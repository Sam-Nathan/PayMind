package expo.modules.paymindcapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Lets the running JS module hear about new captures. Null when the app process has no module. */
object CaptureEvents {
  @Volatile
  var listener: ((CapturedItem) -> Unit)? = null
}

/**
 * Receives every notification posted on the device once the user grants Notification access, and
 * immediately discards all but payment alerts from allowlisted packages (see [CaptureFilter]).
 * Nothing is stored unless capture is enabled in Privacy ([CaptureStore.isEnabled]).
 */
class PaymindNotificationListener : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
    // Pick up alerts posted while the listener was not bound (e.g. right after granting access).
    try {
      activeNotifications?.forEach { handle(it) }
    } catch (_: Exception) {
      // Never let a malformed notification take the service down.
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      handle(sbn)
    } catch (_: Exception) {
      // Swallow: the listener must stay alive whatever another app posts.
    }
  }

  private fun handle(sbn: StatusBarNotification) {
    if (!CaptureStore.isEnabled(applicationContext)) return
    val pkg = sbn.packageName
    if (!CaptureFilter.isAllowedPackage(pkg)) return

    val notification = sbn.notification ?: return
    if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

    val extras = notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
    // Expanded text carries the full alert when the collapsed line is truncated.
    val body = if (bigText.length > text.length) bigText else text

    if (!CaptureFilter.looksLikeTransaction("$title $body")) return

    val cleanTitle = CaptureStore.trim(title)
    val cleanBody = CaptureStore.trim(body)
    val postTime = if (sbn.postTime > 0) sbn.postTime else System.currentTimeMillis()
    val item = CapturedItem(
      id = CapturedItem.makeId(pkg, postTime, cleanTitle, cleanBody),
      packageName = pkg,
      title = cleanTitle,
      text = cleanBody,
      postTime = postTime,
    )
    if (CaptureStore.add(applicationContext, item)) {
      CaptureEvents.listener?.invoke(item)
    }
  }
}
