import { countsTowardBalance } from '@paymind/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  ListCard,
  MemberAvatar,
  Skeleton,
  StatCard,
  SectionHeader,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { shortDate } from '../data/dates.ts';
import { friendlyError } from '../data/errors.ts';
import { useAllMembers, useSettlePlan, useSettlements } from '../data/settle.ts';
import { useSpaces } from '../data/useSpaces.ts';
import { ManualSheet } from '../features/settle/ManualSheet.tsx';
import { encodeDraft, plural, type PersonPlan, type SpaceCardData } from '../features/settle/logic.ts';
import { FlowScreen } from '../features/settle/ui.tsx';
import { useAuth } from '../providers/AuthProvider.tsx';

const breakdown = (p: PersonPlan) => p.items.map((i) => `${i.spaceName} ${fmtMoney(i.amountMinor)}`).join(' · ');

export default function SettleScreen() {
  const router = useRouter();
  const { spaceId, toast: toastParam } = useLocalSearchParams<{ spaceId?: string; toast?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { plan, isPending, isError, error, refetch } = useSettlePlan(spaceId);
  const spaces = useSpaces();
  const members = useAllMembers();
  const settlements = useSettlements(spaceId);
  const [refreshing, setRefreshing] = useState(false);
  const [manual, setManual] = useState<{ person: PersonPlan; method: 'cash' | 'other' } | null>(null);
  const [toast, setToast] = useState<string | null>(toastParam ?? null);

  const filterName = spaceId ? spaces.data?.find((s) => s.id === spaceId)?.name : undefined;
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);

  // Settlements that already moved money, shown dimmed and struck through on the space card.
  const settledBySpace = useMemo(() => {
    const out = new Map<string, { label: string; amountMinor: number }[]>();
    for (const s of settlements.data ?? []) {
      if (!countsTowardBalance(s.status)) continue;
      const f = memberName.get(s.fromMember);
      const t = memberName.get(s.toMember);
      if (!f || !t) continue;
      const label = `${f.userId === uid ? 'You' : f.displayName} → ${t.userId === uid ? 'You' : t.displayName} · paid ${shortDate(s.completedAt ?? s.createdAt)}`;
      const list = out.get(s.spaceId) ?? [];
      if (list.length < 3) list.push({ label, amountMinor: s.amountMinor });
      out.set(s.spaceId, list);
    }
    return out;
  }, [settlements.data, memberName, uid]);

  // My UPI payments that haven't been confirmed yet. They don't count toward balances, so the
  // same person still shows under "You pay": surface them so nobody pays twice.
  const inFlight = useMemo(
    () =>
      (settlements.data ?? []).filter(
        (s) => (s.status === 'initiated' || s.status === 'pending') && memberName.get(s.fromMember)?.userId === uid,
      ),
    [settlements.data, memberName, uid],
  );

  const pay = (p: PersonPlan) =>
    router.push({ pathname: '/pay/[id]', params: { id: 'draft', items: encodeDraft(p.items) } });

  const allSquare = plan && plan.pays.length === 0 && plan.gets.length === 0;

  return (
    <FlowScreen
      title="Settle up"
      onBack={() => router.back()}
      right={
        <Pressable
          onPress={() => router.push('/reminders')}
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-[14px] bg-sand px-3.5 active:opacity-80"
        >
          <Text className="font-sans-semibold text-[14px] text-ink">History</Text>
        </Pressable>
      }
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
      }}
    >
      {filterName ? (
        <View className="flex-row items-center justify-between">
          <Text className="font-sans text-[14px] text-muted">Only {filterName}</Text>
          <Pressable onPress={() => router.setParams({ spaceId: undefined })} hitSlop={8}>
            <Text className="font-sans-semibold text-[14px] text-signal">Show all spaces</Text>
          </Pressable>
        </View>
      ) : null}

      {toast ? (
        <View className="rounded-[18px] bg-mist p-3.5">
          <Text className="font-sans-semibold text-[14px] text-slate">{toast}</Text>
        </View>
      ) : null}

      {isPending ? (
        <>
          <View className="flex-row gap-3">
            <Skeleton height={112} radius={28} style={{ flex: 1 }} />
            <Skeleton height={112} radius={28} style={{ flex: 1 }} />
          </View>
          <Skeleton height={190} radius={26} />
        </>
      ) : isError || !plan ? (
        <ErrorNote message={friendlyError(error)} onRetry={() => refetch()} />
      ) : (
        <>
          <View className="flex-row gap-3">
            <StatCard
              variant="signal"
              overline="You owe"
              size="lg"
              style={{ flex: 1, minHeight: 112 }}
              value={fmtMoney(plan.youOweMinor)}
              meta={plural(plan.pays.length, 'person', 'people')}
            />
            <StatCard
              variant="steel"
              overline="Owed to you"
              size="lg"
              style={{ flex: 1, minHeight: 112 }}
              value={fmtMoney(plan.owedToYouMinor)}
              meta={`${plural(plan.gets.length, 'person', 'people')} · ${plural(plan.spacesOwedCount, 'space')}`}
            />
          </View>

          {inFlight.length > 0 ? (
            <Card tone="sand" radius={24} padding={16}>
              <Text className="font-sans-bold text-[16px] text-ink">Waiting for confirmation</Text>
              <Text className="font-sans mt-0.5 text-[13px] text-muted">
                Check these in your UPI app before paying again.
              </Text>
              {inFlight.slice(0, 5).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push({ pathname: '/verify/[id]', params: { id: s.id } })}
                  accessibilityRole="button"
                  className="mt-3 flex-row items-center justify-between active:opacity-80"
                >
                  <Text className="font-sans-semibold flex-1 pr-3 text-[15px] text-ink" numberOfLines={1}>
                    To {memberName.get(s.toMember)?.displayName ?? 'someone'} · {shortDate(s.createdAt)}
                  </Text>
                  <Text className="font-sans-semibold text-[15px] text-signal">{fmtMoney(s.amountMinor)} · Check</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {allSquare ? (
            <Card>
              <EmptyState title="You're all square." body="Nobody owes anything." />
            </Card>
          ) : null}

          {plan.pays.length > 0 ? (
            <>
              <SectionHeader title="You pay" />
              {plan.pays.map((p) => (
                <Card key={p.key} radius={24} padding={16}>
                  <View className="flex-row items-center gap-3">
                    <MemberAvatar id={p.key} name={p.name} size={56} />
                    <View className="flex-1">
                      <Text className="font-sans-semibold text-[16px] text-ink">{p.name}</Text>
                      <Text className="font-sans mt-0.5 text-[12px] text-muted" numberOfLines={2}>
                        {breakdown(p)}
                      </Text>
                    </View>
                    <AmountText paise={p.amountMinor} variant="lg" />
                  </View>
                  <View className="mt-4 gap-2">
                    <Button label={`Pay ${fmtMoney(p.amountMinor)} with your UPI app`} onPress={() => pay(p)} />
                    <View className="flex-row gap-2">
                      <Button
                        label="Paid in cash"
                        variant="outline"
                        full
                        onPress={() => setManual({ person: p, method: 'cash' })}
                      />
                      <Button
                        label="Paid another way"
                        variant="outline"
                        full
                        onPress={() => setManual({ person: p, method: 'other' })}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          {plan.gets.length > 0 ? (
            <>
              <SectionHeader
                title="You get back"
                actionLabel="Remind all in one message"
                onAction={() => router.push('/reminders')}
              />
              <ListCard>
                {plan.gets.map((g) => (
                  <View key={g.key} className="min-h-[76px] flex-row items-center gap-3 px-4 py-3">
                    <MemberAvatar id={g.key} name={g.name} size={56} />
                    <View className="flex-1">
                      <Text className="font-sans-semibold text-[16px] text-ink">
                        {g.name} · {fmtMoney(g.amountMinor)}
                      </Text>
                      <Text className="font-sans mt-0.5 text-[12px] text-muted" numberOfLines={2}>
                        {breakdown(g)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => router.push({ pathname: '/reminders', params: { person: g.key } })}
                      accessibilityRole="button"
                      accessibilityLabel={`Remind ${g.name}`}
                      className="h-10 items-center justify-center rounded-[14px] border border-hairline bg-white px-3.5 active:opacity-80"
                    >
                      <Text className="font-sans-semibold text-[13px] text-ink">Remind</Text>
                    </Pressable>
                  </View>
                ))}
              </ListCard>
            </>
          ) : null}

          {plan.spaces.map((s) => (
            <SimplifiedCard
              key={s.spaceId}
              card={s}
              settled={settledBySpace.get(s.spaceId) ?? []}
              onOpen={() => router.push(`/space/${s.spaceId}`)}
            />
          ))}
        </>
      )}

      <ManualSheet
        person={manual?.person ?? null}
        initialMethod={manual?.method ?? 'cash'}
        onClose={() => setManual(null)}
        onDone={() => {
          setToast(`Marked as paid. ${manual ? manual.person.name : ''} will see it.`.replace('  ', ' '));
          setManual(null);
        }}
      />
    </FlowScreen>
  );
}

function SimplifiedCard({
  card,
  settled,
  onOpen,
}: {
  card: SpaceCardData;
  settled: { label: string; amountMinor: number }[];
  onOpen: () => void;
}) {
  return (
    <Card tone="ink" radius={28} padding={18}>
      <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-steel">
        {card.name} · simplified
      </Text>
      <View className="mt-3 gap-1">
        <View className="flex-row items-end gap-3">
          <Text className="font-display text-[46px] leading-[50px] text-paper">{card.ious}</Text>
          <Text className="font-sans mb-1.5 flex-1 text-[15px] text-paper/80">
            {card.ious === 1 ? 'IOU' : 'IOUs'} between {card.people} people
          </Text>
        </View>
        <View className="flex-row items-end gap-3">
          <Text className="font-display text-[46px] leading-[50px] text-clay">{card.payments}</Text>
          <Text className="font-sans mb-1.5 flex-1 text-[15px] text-paper/80">
            {card.payments === 1 ? 'payment settles' : 'payments settle'} everything
          </Text>
        </View>
      </View>
      <View className="mt-3 gap-2">
        {card.transfers.map((t, i) => (
          <Pressable
            key={i}
            onPress={onOpen}
            className="h-11 flex-row items-center justify-between rounded-[14px] bg-ink-soft px-3.5"
          >
            <Text className="font-sans-medium text-[15px] text-paper">
              {t.fromName} → {t.toName}
            </Text>
            <Text className="font-sans-bold text-[15px] text-paper">{fmtMoney(t.amountMinor)}</Text>
          </Pressable>
        ))}
        {settled.map((s, i) => (
          <View key={`s${i}`} className="h-11 flex-row items-center justify-between rounded-[14px] bg-ink-soft px-3.5 opacity-50">
            <Text className="font-sans-medium flex-1 text-[14px] text-paper" numberOfLines={1}>
              {s.label}
            </Text>
            <Text className="font-sans-bold text-[15px] text-paper" style={{ textDecorationLine: 'line-through' }}>
              {fmtMoney(s.amountMinor)}
            </Text>
          </View>
        ))}
      </View>
      <Text className="font-sans mt-3 text-[13px] leading-[18px]" style={{ color: palette.steel }}>
        Net balances first (who is up, who is down), then the largest debts are matched to the largest credits.
        Nobody pays more than they owe overall.
      </Text>
    </Card>
  );
}
