/** A payment-looking notification captured on the device. Never leaves the device as-is. */
export interface RawCapture {
  /** Stable id (hash of package, time, title and text); use it to `ack`. */
  id: string;
  /** Android package that posted the notification, e.g. "com.phonepe.app". */
  packageName: string;
  title: string;
  text: string;
  /** Notification post time, epoch milliseconds. */
  postTime: number;
}

export interface InstalledUpiApp {
  packageName: string;
  label: string;
}

export type UpiLaunchStatus = 'success' | 'failure' | 'submitted' | 'unknown';

/**
 * What the UPI app handed back. Many apps return nothing (or RESULT_CANCELED even after paying),
 * in which case status is "unknown". Never treat this as proof of payment: use the Verify flow.
 */
export interface UpiLaunchResult {
  status: UpiLaunchStatus;
  resultCode?: number | null;
  txnId?: string | null;
  responseCode?: string | null;
  txnRef?: string | null;
}

export type PaymindCaptureEvents = {
  onCapture(item: RawCapture): void;
};
