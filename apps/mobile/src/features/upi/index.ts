import { buildUpiUri, upiAppTargets, type UpiAppId } from '@paymind/core';
import { Linking, Platform } from 'react-native';
import * as PaymindCapture from '../../../modules/paymind-capture';

export interface PayWithUpiParams {
  vpa: string;
  name: string;
  amountMinor: number;
  note?: string;
  /** Our settlement reference (tr). */
  ref?: string;
  /** Preferred UPI app; omitted = let the system chooser pick. */
  app?: UpiAppId;
}

export type PayWithUpiStatus = 'success' | 'failure' | 'submitted' | 'unknown' | 'unavailable';

export interface PayWithUpiResult {
  launched: boolean;
  status: PayWithUpiStatus;
  txnId?: string | null;
  txnRef?: string | null;
}

/** Installed UPI apps (Android native module). Empty elsewhere. */
export const getInstalledUpiApps = PaymindCapture.getInstalledUpiApps;

/**
 * Hands the payment to the user's own UPI app. PayMind never moves money. The returned status is
 * only a hint ("unknown" is normal): the Verify flow is the source of truth.
 * Throws UpiError (from core) for an invalid VPA/amount before anything launches.
 */
export async function payWithUpi(p: PayWithUpiParams): Promise<PayWithUpiResult> {
  const uri = buildUpiUri({
    pa: p.vpa,
    pn: p.name,
    am: p.amountMinor,
    ...(p.note ? { tn: p.note } : {}),
    ...(p.ref ? { tr: p.ref } : {}),
  });
  const target = p.app ? upiAppTargets.find((a) => a.id === p.app) : undefined;

  if (Platform.OS === 'android' && PaymindCapture.isSupported()) {
    try {
      const res = await PaymindCapture.launchUpi(uri, target?.androidPackage);
      return { launched: true, status: res.status, txnId: res.txnId ?? null, txnRef: res.txnRef ?? null };
    } catch {
      // Chosen app not installed or launch failed: fall through to the generic link.
    }
  }

  const link =
    Platform.OS === 'ios' && target ? uri.replace(/^upi:\/\/pay/, target.iosScheme) : uri;
  for (const candidate of link === uri ? [uri] : [link, uri]) {
    try {
      await Linking.openURL(candidate);
      return { launched: true, status: 'unknown' };
    } catch {
      /* try next */
    }
  }
  return { launched: false, status: 'unavailable' };
}
