package expo.modules.paymindcapture

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS API (see ../../../../../../src/PaymindCapture.ts):
 *  - hasPermission / openPermissionSettings  notification-listener access
 *  - setCaptureEnabled                       master switch mirrored from privacy_settings
 *  - getPending / ack                        bounded on-device queue of payment alerts
 *  - getInstalledUpiApps / launchUpi         UPI handoff
 *  - event "onCapture"                       a new alert was queued while the app is running
 */
class PaymindCaptureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** The launchUpi promise waiting for the UPI app to return. Only one handoff at a time. */
  private var pendingLaunch: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("PaymindCapture")

    Events("onCapture")

    OnCreate {
      CaptureEvents.listener = { item -> sendEvent("onCapture", item.toMap()) }
    }

    OnDestroy {
      CaptureEvents.listener = null
      settlePending(mapOf("status" to "unknown", "resultCode" to null))
    }

    // ---- Notification capture ------------------------------------------------------------

    AsyncFunction("hasPermission") {
      isListenerEnabled()
    }

    AsyncFunction("openPermissionSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (e: ActivityNotFoundException) {
        throw CodedException("ERR_SETTINGS_UNAVAILABLE", "Notification access settings are not available on this device", e)
      }
    }

    AsyncFunction("setCaptureEnabled") { enabled: Boolean ->
      CaptureStore.setEnabled(context, enabled)
    }

    AsyncFunction("getPending") {
      CaptureStore.pending(context).map { it.toMap() }
    }

    AsyncFunction("ack") { ids: List<String> ->
      CaptureStore.ack(context, ids)
    }

    // ---- UPI launcher --------------------------------------------------------------------

    AsyncFunction("getInstalledUpiApps") {
      val pm = context.packageManager
      val probe = Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay?pa=probe@upi&pn=probe&cu=INR"))
      val seen = HashSet<String>()
      val apps = ArrayList<Map<String, Any?>>()
      for (info in queryActivities(pm, probe)) {
        val pkg = info.activityInfo?.packageName ?: continue
        if (!seen.add(pkg)) continue
        apps.add(mapOf("packageName" to pkg, "label" to info.loadLabel(pm).toString()))
      }
      apps
    }

    AsyncFunction("launchUpi") { uri: String, packageName: String?, promise: Promise ->
      val parsed = Uri.parse(uri)
      if (!"upi".equals(parsed.scheme, ignoreCase = true)) {
        promise.reject("ERR_INVALID_URI", "Only upi:// links can be launched", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "No foreground activity to launch the UPI app from", null)
        return@AsyncFunction
      }
      // A new handoff supersedes an older one that never returned.
      settlePending(mapOf("status" to "unknown", "resultCode" to null))

      val intent = Intent(Intent.ACTION_VIEW, parsed)
      if (!packageName.isNullOrBlank()) intent.setPackage(packageName)
      try {
        pendingLaunch = promise
        activity.startActivityForResult(intent, REQUEST_UPI)
      } catch (e: ActivityNotFoundException) {
        pendingLaunch = null
        promise.reject("ERR_UPI_APP_NOT_FOUND", "No UPI app could handle this payment", e)
      } catch (e: Exception) {
        pendingLaunch = null
        promise.reject("ERR_UPI_LAUNCH_FAILED", e.message, e)
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_UPI) return@OnActivityResult
      settlePending(parseUpiResult(payload.resultCode, payload.data))
    }
  }

  private fun settlePending(result: Map<String, Any?>) {
    val promise = pendingLaunch ?: return
    pendingLaunch = null
    promise.resolve(result)
  }

  private fun isListenerEnabled(): Boolean {
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      ?: return false
    val me = context.packageName
    return flat.split(":").any { ComponentName.unflattenFromString(it)?.packageName == me }
  }

  private fun queryActivities(pm: PackageManager, intent: Intent): List<ResolveInfo> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
    } else {
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(intent, 0)
    }
  }

  /**
   * NPCI says a UPI app returns Status / txnId / responseCode / txnRef, either as separate extras or
   * as one "response" string (`txnId=..&responseCode=..&Status=SUCCESS&txnRef=..`). Many apps
   * return nothing, or RESULT_CANCELED even after a successful payment, so anything we cannot
   * parse is reported as "unknown" and the Verify screen remains the source of truth.
   */
  @Suppress("DEPRECATION")
  private fun parseUpiResult(resultCode: Int, data: Intent?): Map<String, Any?> {
    val fields = HashMap<String, String>()
    val extras = data?.extras
    if (extras != null) {
      for (key in extras.keySet()) {
        val value = extras.get(key)
        if (value is String) fields[key.lowercase()] = value
      }
    }
    fields["response"]?.split("&")?.forEach { pair ->
      val i = pair.indexOf('=')
      if (i > 0) {
        val k = pair.substring(0, i).trim().lowercase()
        if (!fields.containsKey(k)) fields[k] = pair.substring(i + 1).trim()
      }
    }
    val status = when (fields["status"]?.uppercase()) {
      "SUCCESS" -> "success"
      "FAILURE", "FAILED" -> "failure"
      "SUBMITTED", "PENDING" -> "submitted"
      else -> "unknown"
    }
    return mapOf(
      "status" to status,
      "resultCode" to resultCode,
      "txnId" to fields["txnid"],
      "responseCode" to fields["responsecode"],
      "txnRef" to fields["txnref"],
    )
  }

  companion object {
    private const val REQUEST_UPI = 48151
  }
}
