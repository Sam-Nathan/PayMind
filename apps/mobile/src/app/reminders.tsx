import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  ListCard,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  StatusPill,
  fmtMoney,
} from '../components/index.ts';
import { relativeDay } from '../data/dates.ts';
import { friendlyError } from '../data/errors.ts';
import {
  useAllMembers,
  useExpenseShareMembers,
  useSendReminder,
  useSettlePlan,
  useSettlements,
  type Settlement,
} from '../data/settle.ts';
import { useSpaces } from '../data/useSpaces.ts';
import {
  REPEAT_OPTIONS,
  TONE_OPTIONS,
  buildReminderMessage,
  firstName,
  historyDetail,
  type ReminderRepeat,
  type ReminderTone,
} from '../features/settle/logic.ts';
import { FlowScreen } from '../features/settle/ui.tsx';
import { useAuth } from '../providers/AuthProvider.tsx';

export default function RemindersScreen() {
  const router = useRouter();
  const {
    person: personParam,
    spaceId: spaceParam,
    expenseId: expenseParam,
  } = useLocalSearchParams<{ person?: string; spaceId?: string; expenseId?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { plan, isPending, isError, error, refetch } = useSettlePlan();
  const members = useAllMembers();
  const spaces = useSpaces();
  const history = useSettlements();
  const send = useSendReminder();
  const shareMembers = useExpenseShareMembers(expenseParam || undefined);

  const [picked, setPicked] = useState<string | null>(personParam ?? null);
  const [tone, setTone] = useState<ReminderTone>('friendly');
  const [repeat, setRepeat] = useState<ReminderRepeat>('once');
  const [sent, setSent] = useState<{ message: string; pushed: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Hand-off from split/[id] ("Send reminder" after adding a bill): the people who owe me in that
  // space, preferring those with a share of that expense, are listed first and the first is picked.
  const relevant = useMemo(() => {
    const out = new Set<string>();
    if (!spaceParam || !plan) return out;
    const sharers = new Set(shareMembers.data ?? []);
    const inSpace = plan.gets.filter((g) => g.items.some((i) => i.spaceId === spaceParam));
    const fromBill = inSpace.filter((g) => g.items.some((i) => i.spaceId === spaceParam && sharers.has(i.fromMember)));
    for (const g of fromBill.length > 0 ? fromBill : inSpace) out.add(g.key);
    return out;
  }, [spaceParam, plan, shareMembers.data]);
  const gets = useMemo(() => {
    const all = plan?.gets ?? [];
    return relevant.size === 0 ? all : [...all.filter((g) => relevant.has(g.key)), ...all.filter((g) => !relevant.has(g.key))];
  }, [plan, relevant]);
  const person = gets.find((g) => g.key === picked) ?? gets[0];

  // A different person/tone makes the returned message stale.
  useEffect(() => {
    setSent(null);
    setSendError(null);
  }, [person?.key, tone, repeat]);

  const lines = useMemo(
    () => (person ? person.items.map((i) => ({ space: i.spaceName, amountMinor: i.amountMinor })) : []),
    [person],
  );
  const preview = person ? buildReminderMessage(tone, person.name, lines) : '';

  const onSend = async () => {
    if (!person) return;
    setSendError(null);
    try {
      const memberIds = [...new Set(person.items.map((i) => i.fromMember))];
      const res = await send.mutateAsync({
        memberIds,
        tone,
        repeat,
        items: person.items.map((i) => ({ memberId: i.fromMember, amountMinor: i.amountMinor })),
      });
      setSent({ message: res.message, pushed: res.pushed });
      await Share.share({ message: res.message });
    } catch (e) {
      setSendError(friendlyError(e));
    }
  };

  const memberById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const spaceName = (id: string) => spaces.data?.find((s) => s.id === id)?.name ?? 'Shared';

  return (
    <FlowScreen title="Reminders & history" onBack={() => router.back()}>
      <Card radius={28} padding={16}>
        <Text className="font-sans-bold text-[19px] text-ink">Nudge someone</Text>
        {relevant.size > 0 ? (
          <Text className="font-sans mt-1 text-[14px] text-muted">
            Owe you in {spaceName(spaceParam as string)}:{' '}
            {gets
              .filter((g) => relevant.has(g.key))
              .map((g) => firstName(g.name))
              .join(', ')}
          </Text>
        ) : null}

        {isPending ? (
          <View className="mt-3">
            <Skeleton height={56} radius={16} />
          </View>
        ) : isError ? (
          <View className="mt-3">
            <ErrorNote message={friendlyError(error)} onRetry={() => refetch()} />
          </View>
        ) : !person ? (
          <EmptyState title="Nobody owes you right now" />
        ) : (
          <>
            <View className="mt-3 flex-row flex-wrap gap-2.5">
              {gets.map((g) => {
                const on = g.key === person.key;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setPicked(g.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`min-h-14 w-[31%] justify-center rounded-2xl bg-white px-3 py-2 ${
                      on ? 'border-[1.5px] border-signal' : 'border-[1.5px] border-hairline'
                    }`}
                  >
                    <Text className="font-sans-semibold text-[16px] text-ink" numberOfLines={1}>
                      {firstName(g.name)}
                    </Text>
                    <Text className="font-sans text-[14px] text-muted">{fmtMoney(g.amountMinor)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="font-sans-semibold mb-1.5 mt-4 text-[13px] uppercase tracking-[1.3px] text-muted">Tone</Text>
            <SegmentedControl options={TONE_OPTIONS} value={tone} onChange={setTone} />
            <Text className="font-sans-semibold mb-1.5 mt-4 text-[13px] uppercase tracking-[1.3px] text-muted">Repeat</Text>
            <SegmentedControl options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} />

            <View className="mt-4 rounded-[20px] bg-ink p-4">
              {sent ? (
                <Text className="font-sans-semibold mb-1.5 text-[11px] uppercase tracking-[1.3px] text-steel">
                  Sent{sent.pushed > 0 ? ' · they also got a notification' : ''}
                </Text>
              ) : null}
              <Text className="font-sans text-[16px] leading-[23px] text-paper" selectable>
                {sent?.message ?? preview}
              </Text>
            </View>

            {sendError ? (
              <View className="mt-3">
                <ErrorNote message={sendError} />
              </View>
            ) : null}
            <View className="mt-4 flex-row gap-3">
              <Button
                label={`Send to ${firstName(person.name)}`}
                size="lg"
                full
                loading={send.isPending}
                onPress={onSend}
              />
              {sent ? (
                <Button
                  label="Share…"
                  variant="outline"
                  size="lg"
                  onPress={() => Share.share({ message: sent.message }).catch(() => {})}
                />
              ) : null}
            </View>
          </>
        )}
      </Card>

      <SectionHeader title="Settlement history" />
      {history.isPending ? (
        <Skeleton height={200} radius={24} />
      ) : history.isError ? (
        <ErrorNote message={friendlyError(history.error)} onRetry={() => history.refetch()} />
      ) : (history.data ?? []).length === 0 ? (
        <Card>
          <EmptyState title="No settlements yet" />
        </Card>
      ) : (
        <ListCard>
          {(history.data ?? []).map((s) => (
            <HistoryRow
              key={s.id}
              s={s}
              uid={uid}
              memberById={memberById}
              spaceName={spaceName(s.spaceId)}
              onPress={() => {
                const mine = memberById.get(s.fromMember)?.userId === uid;
                if (!mine) return;
                if (s.status === 'initiated' || s.status === 'pending') router.push({ pathname: '/verify/[id]', params: { id: s.id } });
                else if (s.status === 'failed') router.push({ pathname: '/pay/[id]', params: { id: s.id } });
              }}
            />
          ))}
        </ListCard>
      )}
    </FlowScreen>
  );
}

function HistoryRow({
  s,
  uid,
  memberById,
  spaceName,
  onPress,
}: {
  s: Settlement;
  uid: string | undefined;
  memberById: Map<string, { displayName: string; userId: string | null }>;
  spaceName: string;
  onPress: () => void;
}) {
  const nameOf = (id: string) => {
    const m = memberById.get(id);
    return m?.userId === uid ? 'You' : (m?.displayName ?? 'Someone');
  };
  const detail = historyDetail(s);
  const corrected = s.status === 'corrected' && s.correctedFromMinor !== null;
  const dim = s.status === 'cancelled';
  return (
    <Pressable onPress={onPress} className={`min-h-[72px] flex-row items-center gap-3 px-4 py-3 ${dim ? 'opacity-70' : ''}`}>
      <View className="flex-1">
        <Text className="font-sans-semibold text-[17px] text-ink">
          {nameOf(s.fromMember)} → {nameOf(s.toMember)}
        </Text>
        <Text className="font-sans mt-0.5 text-[14px] text-muted" numberOfLines={2}>
          {[relativeDay(s.createdAt), spaceName, ...detail].join(' · ')}
        </Text>
      </View>
      <View className="items-end gap-1.5">
        <View className="flex-row items-center gap-1.5">
          {corrected ? <AmountText paise={s.correctedFromMinor as number} variant="row" tone="muted" strike /> : null}
          <AmountText paise={s.amountMinor} variant="row" strike={s.status === 'cancelled'} tone={dim ? 'muted' : 'default'} />
        </View>
        <StatusPill status={s.status} />
      </View>
    </Pressable>
  );
}
