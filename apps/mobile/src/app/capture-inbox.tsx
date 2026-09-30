import { formatINR, rupeesToPaise } from '@paymind/core';
import { Link, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  useCapturedHistory,
  useCapturedInbox,
  useConfirmCaptured,
  useDismissCaptured,
  usePrivacySettings,
  type CapturedTxn,
} from '../features/capture/data.ts';
import { friendlyError } from '../data/errors.ts';
import type { Category } from '../data/types.ts';
import { useCategories } from '../data/useExpenses.ts';
import { detectRecurringHint } from '../features/capture/recurring.ts';
import { Button, Card, Empty, Screen, palette } from '../features/capture/ui';

const SOURCE_LABEL: Record<CapturedTxn['source'], string> = {
  upi_notification: 'UPI alert',
  sms: 'Bank SMS',
  ebill: 'E-bill',
  manual: 'Manual',
};

function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(now)) return `today ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `yesterday ${time}`;
  return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
}

function categoryLabel(id: string | null, cats: Category[]): string {
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Uncategorised';
  const parent = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
  return parent ? `${parent.name} · ${c.name}` : c.name;
}

const errMsg = friendlyError;

export default function CaptureInboxScreen() {
  const router = useRouter();
  const inbox = useCapturedInbox();
  const history = useCapturedHistory();
  const categories = useCategories();
  const settings = usePrivacySettings();
  const confirm = useConfirmCaptured();
  const dismiss = useDismissCaptured();
  const [editing, setEditing] = useState<CapturedTxn | null>(null);

  const cats = categories.data ?? [];
  const items = inbox.data ?? [];

  const hints = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of items) {
      const h = detectRecurringHint({ ...t, amount_minor: t.amount_minor }, history.data ?? []);
      const parsedHint = t.parsed?.['recurring_hint'];
      if (h) out.set(t.id, h);
      else if (parsedHint) out.set(t.id, typeof parsedHint === 'string' ? parsedHint : 'repeats regularly');
    }
    return out;
  }, [items, history.data]);

  const doConfirm = async (t: CapturedTxn, toSubscriptions: boolean) => {
    try {
      await confirm.mutateAsync({ id: t.id, categoryId: t.suggested_category_id });
      if (toSubscriptions) router.push('/recurring');
    } catch (e) {
      Alert.alert('Could not confirm', errMsg(e));
    }
  };

  const doDismiss = async (t: CapturedTxn) => {
    try {
      await dismiss.mutateAsync(t.id);
    } catch (e) {
      Alert.alert('Could not update', errMsg(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Picked up automatically' }} />
      <Screen>
        <View className="mb-3 flex-row items-baseline justify-between px-1">
          <Text className="font-sans-semibold text-[18px] text-ink">Picked up automatically</Text>
          <Text className="font-sans text-[14px] text-text-muted">{items.length} to review</Text>
        </View>

        {inbox.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={palette.ink} />
        ) : inbox.isError ? (
          <Empty>Could not load your alerts. Pull back and try again.</Empty>
        ) : items.length === 0 ? (
          <View>
            <Empty>Nothing to review. Payment alerts you allow will show up here.</Empty>
            {settings.data && !settings.data.capture_notifications ? (
              <Link href="/privacy" className="text-center font-sans-semibold text-[15px] text-signal">
                Turn on payment alerts in Privacy
              </Link>
            ) : null}
          </View>
        ) : (
          <View className="gap-3">
            {items.map((t) => {
              const hint = hints.get(t.id);
              const credit = t.parsed?.['direction'] === 'credit';
              const title = t.payee ?? t.vpa ?? 'Unknown';
              const source = [SOURCE_LABEL[t.source], formatWhen(t.occurred_at), t.vpa?.toUpperCase()]
                .filter(Boolean)
                .join(' · ');
              return (
                <Card key={t.id}>
                  <View className="flex-row items-center justify-between">
                    <Text className="mr-3 flex-1 font-sans-semibold text-[16px] text-ink" numberOfLines={1}>
                      {title}
                    </Text>
                    <Text
                      className="font-sans-bold text-[17px]"
                      style={{ color: credit ? palette.slate : palette.ink }}
                    >
                      {credit ? '+' : ''}
                      {formatINR(t.amount_minor, { decimals: 'auto' })}
                    </Text>
                  </View>
                  <Text className="mt-1 font-sans text-[12px] text-text-muted">{source}</Text>
                  <Text className="mt-1 font-sans-semibold text-[13px]" style={{ color: palette.slate }}>
                    {credit
                      ? 'Money received — not added as an expense'
                      : `${categoryLabel(t.suggested_category_id, cats)} — personal`}
                  </Text>
                  {hint && !credit ? (
                    <Pressable accessibilityRole="link" onPress={() => router.push('/recurring')} className="mt-1">
                      <Text className="font-sans-semibold text-[13px]" style={{ color: palette.rust }}>
                        Looks recurring ({hint})  Subscriptions
                      </Text>
                    </Pressable>
                  ) : null}
                  <View className="mt-3 flex-row gap-2">
                    {credit ? (
                      <Button label="Dismiss" tone="outline" flex onPress={() => doDismiss(t)} />
                    ) : (
                      <>
                        <Button
                          label={hint ? 'Add to subscriptions' : 'Confirm'}
                          flex
                          loading={confirm.isPending && confirm.variables?.id === t.id}
                          onPress={() => doConfirm(t, !!hint)}
                        />
                        <Button label="Edit" tone="outline" onPress={() => setEditing(t)} />
                        <Button label="Not mine" tone="outline" onPress={() => doDismiss(t)} />
                      </>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <EditSheet
        txn={editing}
        categories={cats}
        busy={confirm.isPending}
        onClose={() => setEditing(null)}
        onSave={async (t, edits, categoryId) => {
          try {
            await confirm.mutateAsync({ id: t.id, categoryId, edits });
            setEditing(null);
          } catch (e) {
            Alert.alert('Could not save', errMsg(e));
          }
        }}
      />
    </>
  );
}

function EditSheet({
  txn,
  categories,
  busy,
  onClose,
  onSave,
}: {
  txn: CapturedTxn | null;
  categories: Category[];
  busy: boolean;
  onClose: () => void;
  onSave: (t: CapturedTxn, edits: { payee?: string; amountMinor?: number }, categoryId: string | null) => void;
}) {
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);

  if (txn && seen !== txn.id) {
    setSeen(txn.id);
    setPayee(txn.payee ?? '');
    setAmount(String(txn.amount_minor / 100));
    setCategoryId(txn.suggested_category_id);
  }

  const save = () => {
    if (!txn) return;
    let amountMinor: number;
    try {
      amountMinor = rupeesToPaise(amount);
    } catch {
      Alert.alert('Check the amount', 'Enter a valid amount in rupees.');
      return;
    }
    if (amountMinor <= 0) {
      Alert.alert('Check the amount', 'The amount must be more than zero.');
      return;
    }
    const edits: { payee?: string; amountMinor?: number } = {};
    if (payee.trim() && payee.trim() !== (txn.payee ?? '')) edits.payee = payee.trim();
    if (amountMinor !== txn.amount_minor) edits.amountMinor = amountMinor;
    onSave(txn, edits, categoryId);
  };

  const input = 'h-12 rounded-[16px] border border-[#E9E4DA] bg-white px-4 font-sans text-[16px] text-ink';
  return (
    <Modal visible={!!txn} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(35,40,51,0.4)' }}>
        <View className="max-h-[85%] rounded-t-[28px] bg-paper p-4">
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text className="mb-3 font-sans-semibold text-[18px] text-ink">Edit before confirming</Text>
            <Text className="mb-1 font-sans-medium text-[13px] text-text-muted">Merchant</Text>
            <TextInput value={payee} onChangeText={setPayee} className={input} placeholder="Who was it?" />
            <Text className="mb-1 mt-3 font-sans-medium text-[13px] text-text-muted">Amount (₹)</Text>
            <TextInput value={amount} onChangeText={setAmount} className={input} keyboardType="decimal-pad" />
            <Text className="mb-2 mt-3 font-sans-medium text-[13px] text-text-muted">Category</Text>
            <View className="flex-row flex-wrap gap-2">
              {categories.map((c) => {
                const on = c.id === categoryId;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setCategoryId(c.id)}
                    className={`rounded-pill px-3 py-2 ${on ? 'bg-ink' : 'bg-[#EDE7DB]'}`}
                  >
                    <Text className={`font-sans-semibold text-[13px] ${on ? 'text-paper' : 'text-ink'}`}>
                      {categoryLabel(c.id, categories)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-3 font-sans text-[12px] text-text-muted">
              Saved as a personal expense. To split it with a space, use Add bill.
            </Text>
            <View className="mt-4 flex-row gap-2">
              <Button label="Confirm" flex loading={busy} onPress={save} />
              <Button label="Cancel" tone="outline" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
