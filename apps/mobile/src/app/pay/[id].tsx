import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidVpa, UpiError, type UpiAppId } from '@paymind/core';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  ErrorNote,
  HeroHeader,
  IconButton,
  SectionHeader,
  Skeleton,
  fmtMoney,
  palette,
} from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import {
  recordSettlement,
  updateSettlementStatus,
  useAllMembers,
  useInvalidateMoney,
  useSettlement,
} from '../../data/settle.ts';
import { useSpaces } from '../../data/useSpaces.ts';
import { getInstalledUpiApps, payWithUpi } from '../../features/upi/index.ts';
import { ManualSheet } from '../../features/settle/ManualSheet.tsx';
import {
  decodeDraft,
  defaultNote,
  firstName,
  isUuid,
  noteRefFor,
  personKey,
  sumItems,
  upiTiles,
  type DraftItem,
  type PersonPlan,
  type UpiTile,
} from '../../features/settle/logic.ts';

const DEFAULT_APP_KEY = 'paymind.upi.defaultApp';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayScreen() {
  const { id, items: itemsParam } = useLocalSearchParams<{ id: string; items?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateMoney();
  const spaces = useSpaces();
  const members = useAllMembers();
  const existingId = isUuid(id) ? id : undefined;
  const existing = useSettlement(existingId);

  const items: DraftItem[] = useMemo(() => {
    if (existingId) {
      const s = existing.data;
      if (!s) return [];
      const name = spaces.data?.find((x) => x.id === s.spaceId)?.name ?? 'Shared expenses';
      return [{ spaceId: s.spaceId, spaceName: name, fromMember: s.fromMember, toMember: s.toMember, amountMinor: s.amountMinor }];
    }
    return decodeDraft(itemsParam);
  }, [existingId, existing.data, spaces.data, itemsParam]);

  const total = sumItems(items);
  const payeeRow = members.data?.find((m) => m.id === items[0]?.toMember);
  const payeeName = payeeRow?.displayName ?? 'them';
  const vpa = useMemo(() => {
    if (!payeeRow || !members.data) return null;
    const key = personKey(payeeRow.userId, payeeRow.displayName);
    const hit = members.data.find((m) => personKey(m.userId, m.displayName) === key && m.upiVpa?.trim());
    return hit?.upiVpa?.trim() ?? null;
  }, [payeeRow, members.data]);

  const now = useMemo(() => new Date(), []);
  const spaceLabel = [...new Set(items.map((i) => i.spaceName))].join(' + ');
  const ref = noteRefFor(items[0]?.spaceName ?? '', now);
  const [note, setNote] = useState<string | null>(null);
  const noteText = note ?? defaultNote(ref, '');

  const installed = useQuery({
    queryKey: ['upi-installed'],
    queryFn: async () => (await getInstalledUpiApps()).map((a) => a.packageName),
    staleTime: 5 * 60_000,
  });
  const { tiles, detected } = useMemo(() => upiTiles(installed.data ?? []), [installed.data]);
  const [picked, setPicked] = useState<UpiTile['id'] | null>(null);
  const [always, setAlways] = useState(false);
  const [savedDefault, setSavedDefault] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(DEFAULT_APP_KEY)
      .then((v) => {
        if (v) {
          setSavedDefault(v);
          setAlways(true);
        }
      })
      .catch(() => {});
  }, []);
  const selected: UpiTile | undefined =
    tiles.find((t) => t.id === picked) ?? tiles.find((t) => t.id === savedDefault) ?? tiles[0];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdIds, setCreatedIds] = useState<string[] | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const loading = members.isPending || (!!existingId && existing.isPending) || spaces.isPending;
  const status = existing.data?.status;
  const alreadyDone = !!status && status !== 'initiated' && status !== 'failed' && status !== 'pending';

  const onContinue = async () => {
    if (!selected || !vpa) return;
    setError(null);
    setBusy(true);
    try {
      if (!isValidVpa(vpa)) throw new UpiError(`${payeeName}'s UPI ID doesn't look right (${vpa}).`);
      let ids = createdIds;
      if (!ids) {
        ids = [];
        if (existingId && existing.data) {
          if (existing.data.status === 'failed') await updateSettlementStatus({ id: existingId, status: 'initiated' });
          ids = [existingId];
        } else {
          for (const it of items) {
            ids.push(
              await recordSettlement({
                spaceId: it.spaceId,
                fromMember: it.fromMember,
                toMember: it.toMember,
                amountMinor: it.amountMinor,
                method: 'upi',
                status: 'initiated',
                upiApp: selected.id === 'other' ? null : selected.id,
                noteRef: noteRefFor(it.spaceName, now),
              }),
            );
          }
        }
        setCreatedIds(ids);
        void invalidate();
      }
      try {
        if (always && selected.id !== 'other') await AsyncStorage.setItem(DEFAULT_APP_KEY, selected.id);
        else if (!always) await AsyncStorage.removeItem(DEFAULT_APP_KEY);
      } catch {
        /* the preference is a convenience only */
      }
      const first = ids[0] as string;
      const res = await payWithUpi({
        vpa,
        name: payeeName,
        amountMinor: total,
        note: noteText.trim(),
        ref: first.replace(/-/g, ''),
        ...(selected.id !== 'other' ? { app: selected.id as UpiAppId } : {}),
      });
      if (!res.launched) {
        setError(`We couldn't open a UPI app. Pay ${vpa} from any UPI app, then come back and tell us.`);
        return;
      }
      router.replace({
        pathname: '/verify/[id]',
        params: { id: first, ids: ids.join(','), result: res.status, app: selected.id },
      });
    } catch (e) {
      setError(e instanceof UpiError ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const person: PersonPlan = {
    key: payeeRow ? personKey(payeeRow.userId, payeeRow.displayName) : 'unknown',
    name: payeeName,
    userId: payeeRow?.userId ?? null,
    amountMinor: total,
    items,
    vpa,
    spaceNames: [...new Set(items.map((i) => i.spaceName))],
  };

  const askForVpa = () =>
    Share.share({
      message: `Hi ${firstName(payeeName)}, could you add your UPI ID in PayMind? I'd like to pay you ${fmtMoney(total)}.`,
    }).catch(() => {});

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HeroHeader tone="oxblood">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans-semibold text-[17px] text-paper" numberOfLines={1}>
              Pay {firstName(payeeName)}
            </Text>
            <View className="w-11" />
          </View>
          <View className="mt-4 items-center">
            {loading ? (
              <Skeleton height={64} width="55%" />
            ) : (
              <AmountText paise={total} variant="hero" tone="onDark" size={72} decimals={total % 100 === 0 ? 0 : 2} />
            )}
            <Text className="font-sans mt-2 text-center text-[13px] text-paper/80">
              Your share · {spaceLabel || 'Shared expenses'} · {MONTH_NAMES[now.getMonth()]}
            </Text>
          </View>
        </HeroHeader>

        <View className="gap-3 px-4 pt-4">
          {loading ? (
            <Skeleton height={150} radius={24} />
          ) : items.length === 0 || (existingId && !existing.data) ? (
            <ErrorNote message="We couldn't find that payment. Go back to Settle up and try again." />
          ) : alreadyDone ? (
            <Card>
              <Text className="font-sans-semibold text-[16px] text-ink">This payment is already recorded.</Text>
              <View className="mt-3">
                <Button label="See status" variant="dark" onPress={() => router.replace({ pathname: '/verify/[id]', params: { id: id as string } })} />
              </View>
            </Card>
          ) : !vpa ? (
            <Card radius={24} padding={16}>
              <View className="flex-row items-center gap-2">
                <Ionicons name="information-circle-outline" size={20} color={palette.rust} />
                <Text className="font-sans-semibold flex-1 text-[16px] text-ink">
                  {firstName(payeeName)} hasn&apos;t added a UPI ID
                </Text>
              </View>
              <Text className="font-sans mt-2 text-[14px] leading-5 text-muted">
                Without it we can&apos;t fill in the payment for you. Ask them to add one, or record that you paid
                some other way.
              </Text>
              <View className="mt-4 gap-2">
                <Button label={`Ask ${firstName(payeeName)} to add a UPI ID`} onPress={askForVpa} />
                <Button label="Paid in cash or another way" variant="outline" onPress={() => setManualOpen(true)} />
              </View>
            </Card>
          ) : (
            <>
              <Card radius={24} padding={16}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans text-[14px] text-muted">To</Text>
                  <View className="items-end">
                    <Text className="font-sans-bold text-[15px] text-ink">{payeeName}</Text>
                    <Text className="font-sans text-[12px] text-muted" selectable>
                      {vpa}
                      {isValidVpa(vpa) ? ' · verified by UPI' : ''}
                    </Text>
                  </View>
                </View>
                <View className="my-3 h-px bg-hairline" />
                <Text className="font-sans mb-2 text-[15px] text-muted">Note that travels with the payment</Text>
                <View className="h-12 justify-center rounded-[14px] border border-hairline bg-[#FBF9F5] px-3.5">
                  <TextInput
                    value={noteText}
                    onChangeText={setNote}
                    maxLength={80}
                    accessibilityLabel="Payment note"
                    className="font-sans text-[15px] text-ink"
                  />
                </View>
              </Card>

              <SectionHeader title="Open with" />
              <View className="-mt-3 flex-row flex-wrap gap-3">
                {tiles.map((t) => {
                  const on = selected?.id === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setPicked(t.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={t.name}
                      className={`h-14 w-[48%] flex-row items-center gap-2.5 rounded-2xl bg-white px-3 ${
                        on ? 'border-2 border-signal' : 'border border-hairline'
                      }`}
                    >
                      <View className="h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-sand">
                        <Text className="font-sans-bold text-[13px] text-oxblood">{t.short}</Text>
                      </View>
                      <Text className="font-sans-semibold flex-1 text-[14px] text-ink" numberOfLines={1}>
                        {t.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!detected && installed.isSuccess ? (
                <Text className="font-sans text-[12px] text-muted">
                  We can&apos;t see which UPI apps you have on this device, so your phone will show its own list.
                </Text>
              ) : null}

              <Pressable
                onPress={() => setAlways((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: always }}
                className="flex-row items-center gap-3 py-1"
              >
                <View className={`h-6 w-6 items-center justify-center rounded-md ${always ? 'bg-ink' : 'border border-stone bg-white'}`}>
                  {always ? <Ionicons name="checkmark" size={16} color={palette.white} /> : null}
                </View>
                <Text className="font-sans text-[14px] text-ink">Always use this app</Text>
              </Pressable>

              {error ? <ErrorNote message={error} /> : null}

              <Button
                label={`Continue in ${selected?.id === 'other' ? 'your UPI app' : (selected?.name ?? 'UPI')}`}
                iconRight="arrow-up-outline"
                size="lg"
                loading={busy}
                disabled={!selected || total <= 0}
                onPress={onContinue}
              />
            </>
          )}

          <View className="flex-row gap-3 rounded-[22px] bg-mist p-4">
            <Ionicons name="shield-checkmark-outline" size={22} color={palette.slate} />
            <Text className="font-sans flex-1 text-[13px] leading-5 text-ink">
              PayMind isn&apos;t a bank or a wallet and never holds your money. We open your UPI app with the payee,
              amount and note filled in — you approve with your UPI PIN there, then come back here.
            </Text>
          </View>
        </View>
      </ScrollView>

      <ManualSheet
        person={manualOpen ? person : null}
        initialMethod="cash"
        onClose={() => setManualOpen(false)}
        onDone={() => {
          setManualOpen(false);
          router.replace('/settle');
        }}
      />
    </View>
  );
}
