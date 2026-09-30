import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  ErrorNote,
  IconButton,
  Overline,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  fmtMoney,
  palette,
} from '../../components/index.ts';
import { formatINR } from '@paymind/core';
import { friendlyError } from '../../data/errors.ts';
import { useBillDraft, useLastSplit, useSaveBillExpense } from '../../data/ai.ts';
import { useCategories } from '../../data/useExpenses.ts';
import { findMyMember, useSpaceMembers, useSpaces } from '../../data/useSpaces.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import { buildBillExpensePayload } from '../../features/ai/billPayload.ts';
import { computeTotals, isEdited, type DraftItem } from '../../features/ai/draft.ts';
import { namesLabel } from '../../features/ai/format.ts';
import {
  bumpUnits,
  computeSplit,
  defaultAssign,
  defaultSplitState,
  extrasLabel,
  isQtyItem,
  rationale,
  setInput,
  setMode,
  setParticipants,
  toggleOn,
  type AssignMode,
  type SplitState,
} from '../../features/ai/split.ts';
import { HideNativeHeader, MemberChip, PersonToggle, StepPills } from '../../features/ai/ui/chrome.tsx';

const SHARE_BAR = [palette.coral, palette.steel, palette.clay, palette.paper];
const MODE_OPTIONS = [
  { value: 'equal', label: 'Equal' },
  { value: 'percent', label: 'Custom %' },
  { value: 'fixed', label: 'Custom ₹' },
] as const;
const SPREAD_OPTIONS = [
  { value: 'proportional', label: 'In proportion to items' },
  { value: 'equal', label: 'Equally' },
] as const;

function NumberInput({ label, value, onChange, prefix, suffix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="font-sans-medium text-[14px] text-ink">{label}</Text>
      <View className="h-10 w-28 flex-row items-center rounded-xl border border-hairline bg-paper px-3">
        {prefix ? <Text className="font-sans text-[14px] text-muted">{prefix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label} ${suffix ?? 'amount'}`}
          className="font-sans flex-1 text-right text-[15px] text-ink"
        />
        {suffix ? <Text className="font-sans ml-1 text-[14px] text-muted">{suffix}</Text> : null}
      </View>
    </View>
  );
}

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { entry, draft, isPending, isError, error, refetch } = useBillDraft(id);
  const spaces = useSpaces();
  const lastSplit = useLastSplit();
  const categories = useCategories();
  const save = useSaveBillExpense();

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [state, setState] = useState<SplitState | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<{ expenseId: string; spaceName: string } | null>(null);

  // Default space: where the last split happened, if the user still has it.
  useEffect(() => {
    if (spaceId || !spaces.data || lastSplit.isPending) return;
    const hint = lastSplit.data?.spaceId;
    if (hint && spaces.data.some((s) => s.id === hint)) setSpaceId(hint);
    else if (spaces.data.length === 1) setSpaceId((spaces.data[0] as { id: string }).id);
  }, [spaceId, spaces.data, lastSplit.data, lastSplit.isPending]);

  const membersQuery = useSpaceMembers(spaceId ?? undefined);
  const members = useMemo(() => (membersQuery.data ?? []).filter((m) => !m.leftAt), [membersQuery.data]);
  const me = findMyMember(members, uid);
  const nameOf = (mid: string) => (mid === me?.id ? 'You' : (members.find((m) => m.id === mid)?.displayName ?? 'Someone'));

  // (Re)build the split whenever the space or its members change.
  useEffect(() => {
    if (!draft || !me || members.length === 0) return;
    const hint = lastSplit.data?.spaceId === spaceId ? new Set(lastSplit.data?.memberIds ?? []) : null;
    const others = members.filter((m) => m.id !== me.id && (!hint || hint.size === 0 || hint.has(m.id))).map((m) => m.id);
    setState(defaultSplitState(draft, [me.id, ...others]));
    setExpanded({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, members.length, me?.id, !!draft]);

  const totals = useMemo(() => (draft ? computeTotals(draft) : null), [draft]);
  const computed = useMemo(() => (draft && state ? computeSplit(draft, state) : null), [draft, state]);
  const result = computed?.result ?? null;

  if (isPending) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <View className="gap-3">
          <Skeleton height={150} radius={28} />
          <Skeleton height={60} radius={24} />
          <Skeleton height={320} radius={24} />
        </View>
      </View>
    );
  }
  if (isError || !entry || !draft || !totals) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View className="mt-4">
          <ErrorNote message={friendlyError(error)} onRetry={() => refetch()} />
        </View>
      </View>
    );
  }

  const spaceName = spaces.data?.find((s) => s.id === spaceId)?.name ?? 'your space';
  const hintNames = (() => {
    if (!lastSplit.data || lastSplit.data.spaceId !== spaceId) return [];
    const ids = new Set(lastSplit.data.memberIds);
    return members.filter((m) => ids.has(m.id) && m.id !== me?.id).map((m) => m.displayName);
  })();

  const mismatch = result ? result.totalMinor !== totals.totalMinor || result.members.reduce((a, m) => a + m.totalMinor, 0) !== totals.totalMinor : false;
  const myShare = me && result ? (result.byMember[me.id]?.totalMinor ?? 0) : 0;
  const requestMinor = result ? result.totalMinor - myShare : 0;
  const canApprove = !!result && !mismatch && !!me && !!spaceId && state !== null && state.participants.length >= 2;

  const apply = (fn: (s: SplitState) => SplitState) => setState((s) => (s ? fn(s) : s));
  const assignOf = (item: DraftItem) => state?.assigns[item.id] ?? defaultAssign(item, state?.participants ?? []);

  const toggleParticipant = (memberId: string) => {
    if (!state || memberId === me?.id) return;
    const next = state.participants.includes(memberId)
      ? state.participants.filter((p) => p !== memberId)
      : [...state.participants, memberId];
    setState(setParticipants(draft, state, next));
  };

  const approve = async () => {
    if (!result || !state || !me || !spaceId) return;
    setSaveError(null);
    if (entry && entry.status !== 'pending') return setSaveError('This bill has already been added.');
    try {
      const payload = buildBillExpensePayload({
        draft,
        categoryId: categories.data?.find((c) => c.slug === draft.categorySlug)?.id ?? null,
        edited: isEdited(draft),
        shared: { spaceId, paidByMember: me.id, state, result },
      });
      const expenseId = await save.mutateAsync(payload);
      setDone({ expenseId, spaceName });
    } catch (e) {
      setSaveError(friendlyError(e));
    }
  };

  const money = (p: number) => formatINR(p);

  if (done) {
    return (
      <View className="flex-1 bg-paper px-4" style={{ paddingTop: insets.top + 12 }}>
        <HideNativeHeader />
        <View className="flex-row items-center justify-between">
          <View className="w-11" />
          <StepPills steps={['Understand', 'Split', 'Settle']} active={2} />
          <View className="w-11" />
        </View>
        <Card tone="white" radius={28} padding={18} className="mt-6">
          <Text className="font-sans-bold text-[22px] text-ink">Added to {done.spaceName}</Text>
          <Text className="font-sans mt-2 text-[15px] leading-[22px] text-muted">
            {draft.merchant || 'The bill'} · {fmtMoney(totals.totalMinor, 2)}. Everyone's balance is updated. Send a reminder so they can pay you back.
          </Text>
          <View className="mt-5 gap-2">
            <Button
              label="Send reminder"
              size="lg"
              onPress={() =>
                router.replace({ pathname: '/reminders', params: { spaceId: spaceId ?? '', expenseId: done.expenseId } })
              }
            />
            <Button label="See who owes what" variant="outline" size="lg" onPress={() => router.replace('/settle')} />
            <Button label="Done" variant="ghost" onPress={() => router.replace('/')} />
          </View>
        </Card>
      </View>
    );
  }

  const bullets = state ? rationale(draft, state, (m) => (m === me?.id ? 'you' : nameOf(m))) : [];
  const extrasNet = result ? result.extrasTotalMinor : totals.totalMinor - totals.subtotalMinor;

  return (
    <View className="flex-1 bg-paper">
      <HideNativeHeader />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
          <StepPills steps={['Understand', 'Split', 'Settle']} active={1} onSelect={(i) => i === 0 && router.back()} />
          <View className="w-11" />
        </View>

        {/* Suggestion */}
        <Card tone="oxblood" radius={28} padding={18} texture>
          <Text className="font-sans-semibold text-[13px] uppercase tracking-[1.3px] text-[#F2C4B5]">Fair split · suggested</Text>
          <Text className="font-sans mt-2 text-[15px] text-paper">
            {draft.merchant || 'This bill'} · <Text className="font-sans-bold">{money(totals.totalMinor)}</Text> paid by you
          </Text>
          {bullets.length > 0 ? (
            <View className="mt-2 gap-1">
              {bullets.map((b) => (
                <Text key={b} className="font-sans text-[14px] leading-5 text-paper">
                  · {b}
                </Text>
              ))}
            </View>
          ) : null}
          <Text className="font-sans mt-3 text-[12px] text-peach">Tap a name on any item to change who had it.</Text>
        </Card>

        {/* Space + participants */}
        <Card tone="white" radius={24} padding={16}>
          <Overline>Split in</Overline>
          <View className="mt-2">
            {spaces.isPending ? (
              <Skeleton height={40} />
            ) : (spaces.data ?? []).length === 0 ? (
              <View className="gap-2">
                <Text className="font-sans text-[14px] text-muted">You don't have a space to split in yet.</Text>
                <Button label="Create a space" size="sm" variant="dark" onPress={() => router.push('/space-new')} />
              </View>
            ) : (
              <ChipGroup>
                {(spaces.data ?? []).map((s) => (
                  <Chip key={s.id} label={s.name} selected={s.id === spaceId} onPress={() => setSpaceId(s.id)} />
                ))}
              </ChipGroup>
            )}
          </View>
          {hintNames.length > 0 ? (
            <Text className="font-sans mt-3 text-[12px] text-slate">
              Last time you split here with {namesLabel(hintNames)}.
            </Text>
          ) : null}
          {spaceId && members.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  id={m.id}
                  name={m.displayName}
                  isYou={m.id === me?.id}
                  selected={!!state?.participants.includes(m.id)}
                  onPress={() => toggleParticipant(m.id)}
                />
              ))}
            </ScrollView>
          ) : null}
          {spaceId && !membersQuery.isPending && members.length > 0 && !me ? (
            <Text className="font-sans mt-3 text-[13px] text-signal">You're not an active member of this space.</Text>
          ) : null}
        </Card>

        {/* Items */}
        {state && me ? (
          <Card tone="white" radius={24} padding={0}>
            {draft.items.map((item, idx) => {
              const a = assignOf(item);
              const qty = isQtyItem(item);
              const participants = state.participants;
              const line = result?.lines.find((l) => l.itemId === item.id);
              const err = computed?.itemErrors[item.id];
              const onCount = a.mode === 'units' ? participants.filter((p) => (a.units[p] ?? 0) > 0) : a.on.filter((p) => participants.includes(p));
              const helper = (() => {
                if (err) return err;
                if (qty && a.mode === 'units') {
                  const unit = Math.round(item.amountMinor / item.qty);
                  return `By quantity · ${money(unit)} each · tap a name to change count`;
                }
                if (a.mode !== 'equal') return a.mode === 'percent' ? 'Custom percentages' : 'Custom amounts';
                if (onCount.length === 0) return 'Pick at least one person.';
                if (onCount.length === 1) return `Only ${nameOf(onCount[0] as string)} had this`;
                const each = line ? (line.shares[onCount[0] as string] ?? 0) : Math.round(item.amountMinor / onCount.length);
                return `Shared equally by ${onCount.length} · ${money(each)} each`;
              })();
              return (
                <View key={item.id} className={`p-4 ${idx > 0 ? 'border-t border-[#F2F0EA]' : ''}`}>
                  <View className="flex-row items-baseline justify-between">
                    <Text className="font-sans-semibold flex-1 pr-3 text-[16px] text-ink">
                      {item.name}
                      {qty ? ` × ${item.qty}` : ''}
                    </Text>
                    <Text className="font-sans-semibold text-[16px] text-ink">{money(item.amountMinor)}</Text>
                  </View>
                  <View className="mt-2.5 flex-row flex-wrap gap-2">
                    {participants.map((pid) => (
                      <PersonToggle
                        key={pid}
                        id={pid}
                        name={nameOf(pid)}
                        isYou={pid === me.id}
                        on={a.mode === 'units' ? (a.units[pid] ?? 0) > 0 : a.on.includes(pid)}
                        count={a.mode === 'units' ? (a.units[pid] ?? 0) : undefined}
                        onPress={() => apply((s) => (a.mode === 'units' ? bumpUnits(s, item, pid) : toggleOn(s, item.id, pid)))}
                      />
                    ))}
                  </View>
                  <Text className={`font-sans mt-2 text-[12px] ${err ? 'text-signal' : 'text-muted'}`}>{helper}</Text>
                  {!qty ? (
                    expanded[item.id] || a.mode !== 'equal' ? (
                      <View className="mt-3 gap-2">
                        <SegmentedControl
                          options={MODE_OPTIONS}
                          value={a.mode as 'equal' | 'percent' | 'fixed'}
                          onChange={(m: AssignMode) => apply((s) => setMode(s, item.id, m))}
                        />
                        {a.mode === 'percent' || a.mode === 'fixed'
                          ? a.on
                              .filter((p) => participants.includes(p))
                              .map((p) =>
                                a.mode === 'percent' ? (
                                  <NumberInput key={p} label={nameOf(p)} suffix="%" value={a.pct[p] ?? ''} onChange={(v) => apply((s) => setInput(s, item.id, 'pct', p, v))} />
                                ) : (
                                  <NumberInput key={p} label={nameOf(p)} prefix="₹" value={a.fixed[p] ?? ''} onChange={(v) => apply((s) => setInput(s, item.id, 'fixed', p, v))} />
                                ),
                              )
                          : null}
                      </View>
                    ) : (
                      <Pressable onPress={() => setExpanded((e) => ({ ...e, [item.id]: true }))} hitSlop={8} accessibilityRole="button">
                        <Text className="font-sans-semibold mt-1 text-[12px] text-signal">Custom split</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : spaceId ? (
          <Skeleton height={200} radius={24} />
        ) : (
          <Card tone="sand" radius={24} padding={16}>
            <Text className="font-sans-semibold text-[15px] text-ink">Choose a space above to start splitting.</Text>
          </Card>
        )}

        {/* Extras */}
        <Card tone="white" radius={24} padding={16}>
          <View className="flex-row items-baseline justify-between">
            <Text className="font-sans-semibold text-[15px] text-ink">{`${extrasLabel(draft)}`}</Text>
            <Text className="font-sans-bold text-[16px] text-ink">{`${extrasNet >= 0 ? '+ ' : '− '}${money(Math.abs(extrasNet))}`}</Text>
          </View>
          <View className="mt-3">
            <SegmentedControl
              options={SPREAD_OPTIONS}
              value={state?.extrasSpread ?? 'proportional'}
              onChange={(v) => apply((s) => ({ ...s, extrasSpread: v }))}
            />
          </View>
        </Card>

        {/* Each person's share */}
        {result && state ? (
          <Card tone="ink" radius={28} padding={16}>
            <View className="flex-row items-baseline justify-between">
              <Overline tone="steel">Each person's share</Overline>
              <Text className="font-sans text-[13px] text-steel">{`Adds up to ${money(result.totalMinor)}`}</Text>
            </View>
            <View className="mt-3 gap-4">
              {result.members.map((m, i) => {
                const isMe = m.memberId === me?.id;
                return (
                  <View key={m.memberId}>
                    <View className="flex-row items-baseline justify-between">
                      <Text className="font-sans-semibold text-[15px] text-paper">
                        {isMe ? 'You (paid)' : `${nameOf(m.memberId)} owes you`}
                      </Text>
                      <Text className="font-sans-bold text-[21px] text-paper">{money(m.totalMinor)}</Text>
                    </View>
                    <View className="my-2">
                      <ProgressBar
                        value={result.totalMinor > 0 ? m.totalMinor / result.totalMinor : 0}
                        height={6}
                        trackTone="inkSoft"
                        fill={isMe ? palette.coral : (SHARE_BAR[(i % (SHARE_BAR.length - 1)) + 1] as string)}
                      />
                    </View>
                    <Text className="font-sans text-[12px] text-steel">{`Items ${money(m.itemsMinor)} + extras ${money(m.extrasMinor)}`}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : computed?.problem ? (
          <View className="rounded-[18px] bg-blush p-4">
            <Text className="font-sans-semibold text-[14px] text-signal">{computed.problem}</Text>
          </View>
        ) : null}
        {mismatch ? (
          <ErrorNote message="The shares don't add up to the bill total. Adjust the split and try again." />
        ) : null}
        {saveError ? <ErrorNote message={saveError} /> : null}

        <Button
          label={canApprove ? `Approve & request ${money(requestMinor)}` : 'Approve & request'}
          size="lg"
          loading={save.isPending}
          disabled={!canApprove}
          onPress={approve}
        />
        <Text className="font-sans px-2 text-center text-[13px] leading-5 text-muted">
          {spaceId ? `Adds to ${spaceName} · updates everyone's balance` : 'Pick a space to add this to'}
        </Text>
      </ScrollView>
    </View>
  );
}
