package expo.modules.paymindcapture

/**
 * Decides which notifications PayMind may even look at.
 *
 * Privacy rules enforced here, before anything is stored:
 *  1. Only packages on an allowlist (UPI apps, a few bank apps, SMS apps) are inspected.
 *  2. Only text that looks like a completed transaction alert is kept: it must contain a rupee
 *     amount (Rs / INR / the rupee sign) AND a debit/credit word.
 *  3. Anything that looks like an OTP or verification code is always dropped.
 *
 * The allowlist is best-effort: bank app package ids should be re-verified against the Play Store
 * before each release, and any package can be added here without touching the JS side.
 */
object CaptureFilter {

  /** UPI wallets and payment apps. */
  val UPI_APP_PACKAGES: Set<String> = setOf(
    "com.google.android.apps.nbu.paisa.user", // Google Pay
    "com.phonepe.app", // PhonePe
    "net.one97.paytm", // Paytm
    "in.org.npci.upiapp", // BHIM
    "in.amazon.mShop.android.shopping", // Amazon / Amazon Pay
    "com.dreamplug.androidapp", // CRED
  )

  /** Bank apps (best-effort list of the most common retail banking apps in India). */
  val BANK_APP_PACKAGES: Set<String> = setOf(
    "com.snapwork.hdfc", // HDFC Bank MobileBanking
    "com.csam.icici.bank.imobile", // ICICI iMobile Pay
    "com.sbi.lotusintouch", // SBI YONO Lite
    "com.sbi.SBIFreedomPlus", // SBI YONO
    "com.axis.mobile", // Axis Mobile
    "com.msf.kbank.mobile", // Kotak Mobile Banking
    "com.bankofbaroda.mconnect", // bob World
    "com.canarabank.mobility", // Canara ai1
    "com.idfcfirstbank.optimus", // IDFC FIRST Bank
  )

  /**
   * Default SMS apps. Bank SMS alerts arrive as notifications from these. We never read the SMS
   * inbox (no READ_SMS); we only see the notification the SMS app shows.
   */
  val SMS_APP_PACKAGES: Set<String> = setOf(
    "com.google.android.apps.messaging", // Google Messages
    "com.samsung.android.messaging", // Samsung Messages
    "com.android.mms", // AOSP / MIUI messaging
  )

  private val ALLOWED: Set<String> = UPI_APP_PACKAGES + BANK_APP_PACKAGES + SMS_APP_PACKAGES

  private val AMOUNT_RE = Regex("(?:\\u20B9|\\brs\\.?|\\binr)\\s*\\d", RegexOption.IGNORE_CASE)

  private val TXN_WORD_RE = Regex(
    "\\b(?:debited|credited|paid|spent|received|sent|refund(?:ed)?|withdrawn|transferred|deposited|reversed)\\b",
    RegexOption.IGNORE_CASE,
  )

  private val OTP_RE = Regex(
    "\\b(?:otp|one[\\s-]?time[\\s-]?(?:password|passcode|pin)|verification code|security code)\\b",
    RegexOption.IGNORE_CASE,
  )

  fun isAllowedPackage(packageName: String?): Boolean = packageName != null && packageName in ALLOWED

  /** True when the text looks like a completed debit/credit alert and not an OTP. */
  fun looksLikeTransaction(text: String): Boolean {
    if (text.isBlank()) return false
    if (OTP_RE.containsMatchIn(text)) return false
    return AMOUNT_RE.containsMatchIn(text) && TXN_WORD_RE.containsMatchIn(text)
  }
}
