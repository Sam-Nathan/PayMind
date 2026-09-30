import { requireOptionalNativeModule, type NativeModule } from 'expo';
import { Platform } from 'react-native';
import type {
  InstalledUpiApp,
  PaymindCaptureEvents,
  RawCapture,
  UpiLaunchResult,
} from './PaymindCapture.types';

declare class PaymindCaptureNative extends NativeModule<PaymindCaptureEvents> {
  hasPermission(): Promise<boolean>;
  openPermissionSettings(): Promise<void>;
  setCaptureEnabled(enabled: boolean): Promise<void>;
  getPending(): Promise<RawCapture[]>;
  ack(ids: string[]): Promise<void>;
  getInstalledUpiApps(): Promise<InstalledUpiApp[]>;
  launchUpi(uri: string, packageName: string | null): Promise<UpiLaunchResult>;
}

/**
 * `null` in Expo Go, on iOS and on web: the module only exists in a development build or release
 * build for Android. Every wrapper below degrades to a harmless no-op in that case.
 */
const native: PaymindCaptureNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<PaymindCaptureNative>('PaymindCapture') : null;

export interface CaptureSubscription {
  remove(): void;
}

/** True only on Android builds that include the native module (never Expo Go, iOS or web). */
export function isSupported(): boolean {
  return native !== null;
}

/** Whether the user has granted PayMind "Notification access" in system settings. */
export async function hasPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.hasPermission();
  } catch {
    return false;
  }
}

/**
 * Opens the system "Notification access" screen. Show the prominent disclosure
 * (capture-permission screen) BEFORE calling this. Returns false if the screen could not open.
 */
export async function openPermissionSettings(): Promise<boolean> {
  if (!native) return false;
  try {
    await native.openPermissionSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * Master switch on the native side, mirrored from privacy_settings.capture_notifications.
 * While off the listener stores nothing; turning it off also clears the on-device queue.
 */
export async function setCaptureEnabled(enabled: boolean): Promise<void> {
  if (!native) return;
  try {
    await native.setCaptureEnabled(enabled);
  } catch {
    /* best effort */
  }
}

/** Payment-looking notifications waiting on the device (bounded, max 200). */
export async function getPending(): Promise<RawCapture[]> {
  if (!native) return [];
  try {
    return await native.getPending();
  } catch {
    return [];
  }
}

/** Removes processed items from the on-device queue. */
export async function ack(ids: readonly string[]): Promise<void> {
  if (!native || ids.length === 0) return;
  try {
    await native.ack([...ids]);
  } catch {
    /* best effort */
  }
}

/** UPI apps installed on this phone (handlers of upi://pay). */
export async function getInstalledUpiApps(): Promise<InstalledUpiApp[]> {
  if (!native) return [];
  try {
    return await native.getInstalledUpiApps();
  } catch {
    return [];
  }
}

/**
 * Starts a upi:// intent, targeted at `packageName` when given, and resolves when the UPI app
 * returns. Rejects if the app is not installed or the link is not a upi:// link.
 * Resolves `{status: 'unknown'}` when the app returns nothing readable.
 */
export async function launchUpi(uri: string, packageName?: string | null): Promise<UpiLaunchResult> {
  if (!native) throw new Error('UPI launcher is not available in this build');
  return native.launchUpi(uri, packageName ?? null);
}

/** Subscribe to "a new payment alert was queued" while the app is running. */
export function addListener(event: 'onCapture', cb: (item: RawCapture) => void): CaptureSubscription {
  if (!native) return { remove() {} };
  return native.addListener(event, cb);
}
