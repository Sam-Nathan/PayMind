import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as PaymindCapture from '../../modules/paymind-capture';
import {
  useDeleteLearnedRules,
  useLearnedRules,
  useNotificationPrefs,
  usePrivacySettings,
  useUpdateNotificationPrefs,
  useUpdatePrivacy,
  type LearnedRule,
  type NotificationPrefs,
  type PrivacySettings,
} from '../features/capture/data.ts';
import { syncCaptureNow } from '../features/capture/useCapture.ts';
import { Button, Card, Empty, Group, Overline, Screen, SettingRow, Toggle } from '../features/capture/ui';
import { friendlyError } from '../data/errors.ts';
import { deleteMyReceipts } from '@paymind/db';
import { supabase } from '../lib/supabase.ts';

const hourOf = (t: string) => Number(t.slice(0, 2));
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
const hhmmss = (h: number) => `${String(h).padStart(2, '0')}:00:00`;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/** Best-effort one-line description of a learned rule (match/action jsonb shapes are open). */
function describeRule(r: LearnedRule): { left: string; right: string } {
  const who = str(r.match['merchant']) ?? str(r.match['payee']) ?? str(r.match['vpa']) ?? str(r.match['text']) ?? 'Rule';
  const to =
    str(r.action['category_name']) ??
    str(r.action['category']) ??
    str(r.action['merchant']) ??
    str(r.action['split']) ??
    r.kind;
  return { left: `${who} → ${to}`, right: r.hits > 0 ? `${r.hits} time${r.hits === 1 ? '' : 's'}` : r.kind };
}

export default function PrivacyScreen() {
  const router = useRouter();
  const settingsQ = usePrivacySettings();
  const notifQ = useNotificationPrefs();
  const rulesQ = useLearnedRules();
  const update = useUpdatePrivacy();
  const updateNotif = useUpdateNotificationPrefs();
  const deleteRules = useDeleteLearnedRules();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const s = settingsQ.data;
  const n = notifQ.data;
  const captureSupported = PaymindCapture.isSupported();

  const fail = (e: unknown) => Alert.alert('Could not save', friendlyError(e));
  const setPrivacy = (patch: Partial<PrivacySettings>) => update.mutate(patch, { onError: fail });
  const setNotif = (patch: Partial<NotificationPrefs>) => updateNotif.mutate(patch, { onError: fail });

  const toggleCapture = async (on: boolean) => {
    if (on) {
      router.push('/capture-permission');
      return;
    }
    try {
      await update.mutateAsync({ capture_notifications: false });
      await PaymindCapture.setCaptureEnabled(false); // also clears the on-device queue
      void syncCaptureNow();
    } catch (e) {
      fail(e);
    }
  };

  const rules = rulesQ.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Privacy & data' }} />
      <Screen>
        <Card tone="ink">
          <Text className="font-sans-semibold text-[21px] text-paper">
            Your money data is yours. Every source is opt-in, and you can switch any of it off here.
          </Text>
          <Text className="mt-2 font-sans text-[15px] text-steel">
            PayMind never sees your UPI PIN or card details, and never moves money on its own.
          </Text>
        </Card>

        {s && n ? (
          <>
            <Overline>Connected sources</Overline>
            <Group>
              <SettingRow
                title="UPI & bank alerts"
                description={
                  captureSupported || s.capture_notifications
                    ? 'Reads payment notifications to suggest expenses. Nothing else on your phone.'
                    : 'Available in the Android app only.'
                }
                right={
                  <Toggle
                    label="UPI and bank alerts"
                    value={s.capture_notifications}
                    disabled={!captureSupported && !s.capture_notifications}
                    onValueChange={toggleCapture}
                  />
                }
              />
              <SettingRow
                title="Bank balance"
                description="Via Account Aggregator consent. Coming soon."
                right={<Toggle label="Bank balance" value={false} disabled onValueChange={() => {}} />}
              />
              <SettingRow
                title="E-bills from email"
                description="Only messages from billers you pick."
                right={<Toggle label="E-bills from email" value={s.ebills} onValueChange={(v) => setPrivacy({ ebills: v })} />}
              />
              <SettingRow
                last
                title="Keep receipt photos"
                description="Off = we read the bill, then discard the image."
                right={
                  <Toggle label="Keep receipt photos" value={s.keep_receipts} onValueChange={(v) => setPrivacy({ keep_receipts: v })} />
                }
              />
            </Group>

            <Overline>What people in your spaces see</Overline>
            <Group>
              <SettingRow
                title="Items on shared bills"
                description="Needed to split fairly. They never see your personal expenses."
                right={<Toggle label="Items on shared bills" value disabled onValueChange={() => {}} />}
              />
              <SettingRow
                title="My notes on shared expenses"
                description="Private by default. Sharing notes is coming soon."
                right={<Toggle label="My notes on shared expenses" value={false} disabled onValueChange={() => {}} />}
              />
              <SettingRow
                last
                title="How I paid"
                description={'e.g. "UPI" or "cash" on settlements.'}
                right={
                  <Toggle
                    label="How I paid"
                    value={s.share_payment_method}
                    onValueChange={(v) => setPrivacy({ share_payment_method: v })}
                  />
                }
              />
            </Group>

            <Overline>AI</Overline>
            <Group>
              <SettingRow
                title="Use AI to read bills and answer questions"
                description="Off = manual entry and plain search only."
                right={<Toggle label="Use AI" value={s.ai_enabled} onValueChange={(v) => setPrivacy({ ai_enabled: v })} />}
              />
              <SettingRow
                last
                title="Learn from my corrections"
                description="Improves categories, merchants and split suggestions — for you only."
                right={
                  <Toggle
                    label="Learn from my corrections"
                    value={s.learn_from_corrections}
                    onValueChange={(v) => setPrivacy({ learn_from_corrections: v })}
                  />
                }
              />
            </Group>

            <Overline>Notifications</Overline>
            <Group>
              <SettingRow
                title="Budget alerts"
                description="When a category is heading over."
                right={<Toggle label="Budget alerts" value={n.budget_alerts} onValueChange={(v) => setNotif({ budget_alerts: v })} />}
              />
              <SettingRow
                title="Money nudges"
                description="Patterns and tips, at most once a day."
                right={<Toggle label="Money nudges" value={n.money_nudges} onValueChange={(v) => setNotif({ money_nudges: v })} />}
              />
              <SettingRow
                title="Settlement reminders"
                description="Who owes you, and what you owe."
                right={
                  <Toggle
                    label="Settlement reminders"
                    value={n.settlement_reminders}
                    onValueChange={(v) => setNotif({ settlement_reminders: v })}
                  />
                }
              />
              <SettingRow
                title="Unusual activity"
                description="Always shown for review — never auto-blocked."
                right={
                  <Toggle label="Unusual activity" value={n.unusual_activity} onValueChange={(v) => setNotif({ unusual_activity: v })} />
                }
              />
              <SettingRow
                last
                title={`Quiet hours ${hourLabel(hourOf(s.quiet_hours_start))} – ${hourLabel(hourOf(s.quiet_hours_end))}`}
                description="Hold everything except unusual activity. Tap the title to change hours."
                onPressTitle={() => setHoursOpen(true)}
                right={
                  <Toggle
                    label="Quiet hours"
                    value={s.quiet_hours_enabled}
                    onValueChange={(v) => setPrivacy({ quiet_hours_enabled: v })}
                  />
                }
              />
            </Group>
          </>
        ) : (
          <Empty>{settingsQ.isError ? 'Could not load your privacy settings.' : 'Loading…'}</Empty>
        )}

        <Overline>What PayMind has learned from your fixes</Overline>
        <Card>
          {rules.length === 0 ? (
            <Text className="font-sans text-[14px] text-text-muted">
              Nothing learned yet. Your corrections will show up here.
            </Text>
          ) : (
            rules.slice(0, 4).map((r) => {
              const d = describeRule(r);
              return (
                <View key={r.id} className="flex-row items-center justify-between py-2">
                  <Text className="mr-3 flex-1 font-sans text-[16px] text-ink">{d.left}</Text>
                  <Text className="font-sans text-[13px] text-text-muted">{d.right}</Text>
                </View>
              );
            })
          )}
        </Card>
        {rules.length > 0 ? (
          <View className="mt-3">
            <Button label="Review or reset what it learned" tone="outline" size="lg" onPress={() => setRulesOpen(true)} />
          </View>
        ) : null}

        <Overline>Your data</Overline>
        <View className="gap-3">
          <Button
            label="Download everything (CSV + receipts)"
            tone="outline"
            size="lg"
            onPress={() => Alert.alert('Coming soon', 'Data export is coming soon.')}
          />
          <Button
            label="Delete data from a date range"
            tone="outline"
            size="lg"
            onPress={() => Alert.alert('Coming soon', 'Deleting by date range is coming soon.')}
          />
          <Button label="Delete my account" tone="danger" size="lg" onPress={() => setDeleteOpen(true)} />
        </View>
        <Text className="mt-3 px-1 font-sans text-[14px] text-text-muted">
          Deleting your account removes your personal data. Shared expenses stay visible to the other people in them,
          with your name replaced by &quot;Former member&quot;.
        </Text>
      </Screen>

      <RulesModal
        visible={rulesOpen}
        rules={rules}
        onClose={() => setRulesOpen(false)}
        onDelete={(id) => deleteRules.mutate(id, { onError: fail })}
        onReset={() =>
          Alert.alert('Reset everything it learned?', 'PayMind will forget all your corrections.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Reset',
              style: 'destructive',
              onPress: () => deleteRules.mutate(undefined, { onSuccess: () => setRulesOpen(false), onError: fail }),
            },
          ])
        }
      />
      {s ? (
        <HoursModal
          visible={hoursOpen}
          start={hourOf(s.quiet_hours_start)}
          end={hourOf(s.quiet_hours_end)}
          onClose={() => setHoursOpen(false)}
          onSave={(a, b) => {
            setPrivacy({ quiet_hours_start: hhmmss(a), quiet_hours_end: hhmmss(b) });
            setHoursOpen(false);
          }}
        />
      ) : null}
      <DeleteModal visible={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(35,40,51,0.4)' }}>
        <View className="max-h-[85%] rounded-t-[28px] bg-paper p-4">{children}</View>
      </View>
    </Modal>
  );
}

function RulesModal({
  visible,
  rules,
  onClose,
  onDelete,
  onReset,
}: {
  visible: boolean;
  rules: LearnedRule[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="mb-2 font-sans-semibold text-[18px] text-ink">What PayMind learned</Text>
      <ScrollView>
        {rules.length === 0 ? <Empty>Nothing learned yet. Your corrections will show up here.</Empty> : null}
        {rules.map((r) => {
          const d = describeRule(r);
          return (
            <View key={r.id} className="flex-row items-center border-b border-[#E9E4DA] py-3">
              <View className="flex-1 pr-3">
                <Text className="font-sans text-[16px] text-ink">{d.left}</Text>
                <Text className="font-sans text-[13px] text-text-muted">{d.right}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove rule ${d.left}`} onPress={() => onDelete(r.id)}>
                <Text className="font-sans-semibold text-[14px] text-signal">Remove</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View className="mt-3 gap-2">
        {rules.length > 0 ? <Button label="Reset everything" tone="danger" onPress={onReset} /> : null}
        <Button label="Done" tone="outline" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="font-sans-semibold text-[16px] text-ink">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Button label="−" tone="outline" onPress={() => onChange((value + 23) % 24)} />
        <Text className="w-16 text-center font-sans-semibold text-[16px] text-ink">{hourLabel(value)}</Text>
        <Button label="+" tone="outline" onPress={() => onChange((value + 1) % 24)} />
      </View>
    </View>
  );
}

function HoursModal({
  visible,
  start,
  end,
  onClose,
  onSave,
}: {
  visible: boolean;
  start: number;
  end: number;
  onClose: () => void;
  onSave: (start: number, end: number) => void;
}) {
  const [a, setA] = useState(start);
  const [b, setB] = useState(end);
  const [shown, setShown] = useState(false);
  if (visible && !shown) {
    setShown(true);
    setA(start);
    setB(end);
  } else if (!visible && shown) setShown(false);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="mb-2 font-sans-semibold text-[18px] text-ink">Quiet hours</Text>
      <Stepper label="From" value={a} onChange={setA} />
      <Stepper label="To" value={b} onChange={setB} />
      <View className="mt-3 flex-row gap-2">
        <Button label="Save" flex onPress={() => onSave(a, b)} />
        <Button label="Cancel" tone="outline" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function DeleteModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // Receipt photos live in Storage, which the deletion trigger cannot reach: remove them first.
      if (auth.user) await deleteMyReceipts(supabase, auth.user.id);
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await PaymindCapture.setCaptureEnabled(false);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      onClose();
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not delete your account', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="font-sans-semibold text-[18px] text-signal">Delete my account?</Text>
      <Text className="mt-2 font-sans text-[14px] text-text-muted">
        This removes your personal data and cannot be undone. Shared expenses stay visible to the other people in
        them, shown as &quot;Former member&quot;. Type DELETE to confirm.
      </Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="DELETE"
        className="mt-3 h-12 rounded-[16px] border border-[#E9E4DA] bg-white px-4 font-sans text-[16px] text-ink"
      />
      <View className="mt-4 flex-row gap-2">
        <Button label="Delete account" tone="signal" flex disabled={typed.trim() !== 'DELETE'} loading={busy} onPress={run} />
        <Button label="Cancel" tone="outline" onPress={onClose} />
      </View>
    </Sheet>
  );
}
