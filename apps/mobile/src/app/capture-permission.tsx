import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import * as PaymindCapture from '../../modules/paymind-capture';
import { usePrivacySettings, useUpdatePrivacy } from '../features/capture/data.ts';
import { syncCaptureNow } from '../features/capture/useCapture.ts';
import { Button, Card, Screen } from '../features/capture/ui';

/**
 * Prominent disclosure (Google Play requirement): shown BEFORE the system Notification-access
 * screen. Plain language, what we read, what we send, that it is optional.
 */
export default function CapturePermissionScreen() {
  const router = useRouter();
  const update = useUpdatePrivacy();
  const settings = usePrivacySettings();
  const supported = PaymindCapture.isSupported();
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const waitingRef = useRef(false);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      await update.mutateAsync({ capture_notifications: true });
      await PaymindCapture.setCaptureEnabled(true);
      void syncCaptureNow();
      router.back();
    } catch {
      setMessage('Could not save your choice. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [router, update]);

  // Returning from system settings: proceed only if access was actually granted.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || !waitingRef.current) return;
      waitingRef.current = false;
      setWaiting(false);
      if (await PaymindCapture.hasPermission()) await enable();
      else setMessage('Notification access is still off. You can try again, or keep entering expenses yourself.');
    });
    return () => sub.remove();
  }, [enable]);

  const turnOn = async () => {
    setMessage(null);
    if (await PaymindCapture.hasPermission()) {
      await enable();
      return;
    }
    const opened = await PaymindCapture.openPermissionSettings();
    if (opened) {
      waitingRef.current = true;
      setWaiting(true);
    } else {
      setMessage('Could not open Notification access settings on this phone.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Payment alerts' }} />
      <Screen>
        <Card tone="ink">
          <Text className="font-sans-semibold text-[21px] text-paper">
            Let PayMind notice your payments?
          </Text>
          <Text className="mt-2 font-sans text-[15px] text-steel">
            PayMind can suggest expenses from your UPI and bank payment alerts, so you do not have to type them in.
          </Text>
        </Card>

        <View className="mt-4 gap-3">
          <Card>
            <Text className="font-sans-semibold text-[16px] text-ink">What we read</Text>
            <Text className="mt-1 font-sans text-[14px] text-text-muted">
              Only notifications from UPI and bank apps (like Google Pay, PhonePe, Paytm, BHIM) and payment alerts
              from your messages app. Anything that is not a payment alert is ignored, and OTPs are always skipped.
              PayMind does not read your SMS inbox or any other app.
            </Text>
          </Card>
          <Card>
            <Text className="font-sans-semibold text-[16px] text-ink">What we send</Text>
            <Text className="mt-1 font-sans text-[14px] text-text-muted">
              Only the amount, who it was paid to or from, and the time. The message itself is read on your phone and
              never uploaded. Nothing is added to your expenses until you confirm it.
            </Text>
          </Card>
          <Card tone="mist">
            <Text className="font-sans-semibold text-[16px] text-ink">Your choice</Text>
            <Text className="mt-1 font-sans text-[14px] text-text-muted">
              This is optional. You can switch it off any time in Privacy and data, and PayMind stops reading alerts
              straight away. Android will ask you to allow Notification access for PayMind on the next screen.
            </Text>
          </Card>
        </View>

        {message ? <Text className="mt-4 px-1 font-sans text-[14px] text-signal">{message}</Text> : null}

        <View className="mt-6 gap-3">
          {supported ? (
            <>
              <Button
                label={waiting ? 'Waiting for permission…' : 'Turn on'}
                size="lg"
                tone="signal"
                loading={busy || settings.isLoading}
                disabled={waiting}
                onPress={turnOn}
              />
              <Button label="Not now" size="lg" tone="outline" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Text className="px-1 font-sans text-[14px] text-text-muted">
                Payment alerts are available in the Android app only. You can still add expenses yourself.
              </Text>
              <Button label="OK" size="lg" tone="outline" onPress={() => router.back()} />
            </>
          )}
        </View>
      </Screen>
    </>
  );
}
