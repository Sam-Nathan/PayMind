package expo.modules.paymindcapture

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/** One captured notification, exactly as handed to JS. Lives only in the on-device queue. */
data class CapturedItem(
  val id: String,
  val packageName: String,
  val title: String,
  val text: String,
  val postTime: Long,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("packageName", packageName)
    .put("title", title)
    .put("text", text)
    .put("postTime", postTime)

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "title" to title,
    "text" to text,
    "postTime" to postTime.toDouble(),
  )

  companion object {
    fun fromJson(o: JSONObject): CapturedItem? {
      val id = o.optString("id", "")
      val pkg = o.optString("packageName", "")
      if (id.isEmpty() || pkg.isEmpty()) return null
      return CapturedItem(
        id = id,
        packageName = pkg,
        title = o.optString("title", ""),
        text = o.optString("text", ""),
        postTime = o.optLong("postTime", 0L),
      )
    }

    /** Stable id so the same notification re-posted by the system is stored once. */
    fun makeId(packageName: String, postTime: Long, title: String, text: String): String {
      val digest = MessageDigest.getInstance("SHA-256")
        .digest("$packageName|$postTime|$title|$text".toByteArray(Charsets.UTF_8))
      return digest.take(10).joinToString("") { "%02x".format(it) }
    }
  }
}

/**
 * Small bounded on-device queue (max 200 items, max 14 days) kept in SharedPreferences as a JSON
 * array. The raw notification text never leaves the device: JS parses it, uploads only amount,
 * payee, time and a dedupe hash, then acks (deletes) the item.
 */
object CaptureStore {
  private const val PREFS = "paymind_capture"
  private const val KEY_QUEUE = "queue"
  private const val KEY_ENABLED = "enabled"
  private const val MAX_TEXT_LENGTH = 600
  const val MAX_ITEMS = 200
  private const val MAX_AGE_MS = 14L * 24 * 60 * 60 * 1000

  private val lock = Any()

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Master switch, mirrored from privacy_settings.capture_notifications by the JS side. Default off. */
  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    synchronized(lock) {
      val editor = prefs(context).edit().putBoolean(KEY_ENABLED, enabled)
      if (!enabled) editor.remove(KEY_QUEUE)
      editor.apply()
    }
  }

  fun trim(value: String): String = if (value.length > MAX_TEXT_LENGTH) value.substring(0, MAX_TEXT_LENGTH) else value

  private fun load(context: Context): MutableList<CapturedItem> {
    val raw = prefs(context).getString(KEY_QUEUE, null) ?: return mutableListOf()
    val out = mutableListOf<CapturedItem>()
    try {
      val arr = JSONArray(raw)
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        CapturedItem.fromJson(o)?.let { out.add(it) }
      }
    } catch (_: Exception) {
      // Corrupt queue: start over rather than crash the listener service.
    }
    return out
  }

  private fun save(context: Context, items: List<CapturedItem>) {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    prefs(context).edit().putString(KEY_QUEUE, arr.toString()).apply()
  }

  /** Adds an item. Returns false if an item with the same id is already queued. */
  fun add(context: Context, item: CapturedItem): Boolean {
    synchronized(lock) {
      val items = load(context)
      if (items.any { it.id == item.id }) return false
      items.add(item)
      val cutoff = System.currentTimeMillis() - MAX_AGE_MS
      items.removeAll { it.postTime in 1 until cutoff }
      while (items.size > MAX_ITEMS) items.removeAt(0)
      save(context, items)
      return true
    }
  }

  fun pending(context: Context): List<CapturedItem> = synchronized(lock) { load(context) }

  fun ack(context: Context, ids: Collection<String>) {
    if (ids.isEmpty()) return
    val drop = ids.toHashSet()
    synchronized(lock) {
      val items = load(context)
      if (items.removeAll { it.id in drop }) save(context, items)
    }
  }
}
