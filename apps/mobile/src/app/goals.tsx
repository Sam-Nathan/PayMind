import { goalEta, requiredMonthly, splitContribution } from '@paymind/core';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  IconButton,
  ProgressBar,
  SPACE_TYPES,
  Sheet,
  Skeleton,
  StatusBox,
  TextField,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { useAddContribution, useGoals, type GoalItem } from '../data/money.ts';
import { parseAmountInput } from '../data/payloads.ts';
import { useSpaces } from '../data/useSpaces.ts';
import { formatYm, goalMonthlyNeed, goalPlanStatus, myShareOfMonthly, ymFromDate, ymOf } from '../features/money/logic.ts';
import { Stepper } from '../features/money/ui.tsx';

function byMonth(iso: string): string {
  return formatYm(ymFromDate(iso));
}

export default function GoalsScreen() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const goals = useGoals();
  const spaces = useSpaces();
  const add = useAddContribution();
  const [selected, setSelected] = useState<string | null>(null);
  const [plan, setPlan] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const list = goals.data ?? [];
  const goal: GoalItem | null = list.find((g) => g.id === selected) ?? list[0] ?? null;
  const spaceOf = (id: string | null) => spaces.data?.find((s) => s.id === id);

  const need = goal ? goalMonthlyNeed(goal, now) : 0;
  const monthly = goal ? (plan[goal.id] ?? need) : 0;
  const status = goal ? goalPlanStatus(goal, monthly, now) : null;
  const eta = goal ? goalEta({ targetMinor: goal.targetMinor, savedMinor: goal.savedMinor, monthlyContributionMinor: monthly, from: ymOf(now) }) : null;
  const needed = goal?.targetDate
    ? requiredMonthly({ targetMinor: goal.targetMinor, savedMinor: goal.savedMinor, from: ymOf(now), target: ymFromDate(goal.targetDate) })
    : null;

  const ratio = useMemo(() => {
    if (!goal || goal.members.length === 0) return null;
    return Object.fromEntries(goal.members.map((m) => [m.id, m.weight > 0 ? m.weight : 1]));
  }, [goal]);
  const split = goal && ratio ? splitContribution(monthly, ratio) : null;
  const totalWeight = goal ? goal.members.reduce((a, m) => a + (m.weight > 0 ? m.weight : 1), 0) : 0;

  const contributedBy = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of goal?.contributions ?? []) {
      const k = c.memberId ?? c.userId ?? 'you';
      out.set(k, (out.get(k) ?? 0) + c.amountMinor);
    }
    return out;
  }, [goal]);

  const submit = async () => {
    if (!goal) return;
    const minor = parseAmountInput(amount);
    if (minor === null) return setAddError('Enter an amount greater than zero.');
    if (goal.spaceId && !goal.myMemberId) return setAddError("You're not an active member of this goal's space.");
    setAddError(null);
    try {
      await add.mutateAsync({ goalId: goal.id, amountMinor: minor, memberId: goal.spaceId ? goal.myMemberId : null });
      setAmount('');
      setAddOpen(false);
    } catch (e) {
      setAddError(friendlyError(e));
    }
  };

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen
        options={{ headerRight: () => <IconButton icon="add" tone="primary" label="New goal" onPress={() => router.push('/goal-new')} /> }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {goals.error ? <ErrorNote message={friendlyError(goals.error)} onRetry={() => goals.refetch()} /> : null}
        {goals.isPending ? (
          <>
            <Skeleton height={110} radius={28} />
            <Skeleton height={110} radius={28} />
          </>
        ) : list.length === 0 ? (
          <Card tone="sand" radius={28} padding={18}>
            <EmptyState title="What are you saving for?" body="Add a goal and track it on your own or with a space." actionLabel="Add a goal" onAction={() => router.push('/goal-new')} />
          </Card>
        ) : (
          <>
            {list.map((g) => {
              const featured = goal?.id === g.id;
              const sp = spaceOf(g.spaceId);
              const progress = g.targetMinor > 0 ? g.savedMinor / g.targetMinor : 0;
              return (
                <Card key={g.id} tone={featured ? 'ink' : 'white'} radius={28} padding={16} onPress={() => setSelected(g.id)}>
                  <View className="flex-row items-center justify-between">
                    <Text className={`font-sans-bold flex-1 text-[19px] ${featured ? 'text-paper' : 'text-ink'}`} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text className={`font-sans-bold ml-2 text-[13px] tracking-[1px] ${featured ? 'text-steel' : 'text-muted'}`}>
                      {g.spaceId ? `SHARED${sp ? ` · ${SPACE_TYPES[sp.type].label.toUpperCase()}` : ''}` : 'PERSONAL'}
                    </Text>
                  </View>
                  <View className="my-3">
                    <ProgressBar value={progress} fill={featured ? palette.clay : palette.signal} trackTone={featured ? 'inkSoft' : 'sand'} />
                  </View>
                  <View className="flex-row justify-between">
                    <Text className={`font-sans text-[15px] ${featured ? 'text-paper' : 'text-ink'}`}>
                      {fmtMoney(g.savedMinor)} of {fmtMoney(g.targetMinor)}
                    </Text>
                    {g.targetDate ? <Text className={`font-sans text-[15px] ${featured ? 'text-paper/80' : 'text-muted'}`}>by {byMonth(g.targetDate)}</Text> : null}
                  </View>
                </Card>
              );
            })}

            {goal && eta && status ? (
              <Card radius={28} padding={16}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans-bold flex-1 text-[19px] text-ink" numberOfLines={1}>{goal.name}</Text>
                  <Text className="font-sans text-[14px] text-muted">{fmtMoney(eta.remainingMinor)} to go</Text>
                </View>

                <View className="mt-3 flex-row items-center justify-between">
                  <View>
                    <Text className="font-sans text-[16px] text-muted">{goal.spaceId ? 'Together, per month' : 'Per month'}</Text>
                    <Text className="font-sans-bold text-[29px] text-ink">{fmtMoney(monthly)}</Text>
                  </View>
                  <Stepper valueMinor={monthly} stepMinor={50_000} onChange={(v) => setPlan((p) => ({ ...p, [goal.id]: v }))} />
                </View>
                {plan[goal.id] !== undefined && plan[goal.id] !== need ? (
                  <Text className="font-sans-semibold mt-1 text-[13px] text-signal" onPress={() => setPlan((p) => { const { [goal.id]: _omit, ...rest } = p; return rest; })}>
                    Reset to what the target date needs
                  </Text>
                ) : null}

                <View className="mt-3 flex-row gap-2.5">
                  <View className="flex-1 rounded-[18px] bg-paper p-3">
                    <Text className="font-sans text-[13px] text-muted">You'd finish</Text>
                    <Text className="font-sans-bold text-[22px] text-ink">{eta.finish ? formatYm(eta.finish) : '—'}</Text>
                  </View>
                  <View className="flex-1 rounded-[18px] bg-paper p-3">
                    <Text className="font-sans text-[13px] text-muted">
                      {goal.targetDate ? `Needed for ${byMonth(goal.targetDate)}` : 'Target date'}
                    </Text>
                    <Text className="font-sans-bold text-[22px] text-ink">
                      {goal.targetDate ? (needed === null ? '—' : `${fmtMoney(needed)}/mo`) : 'Not set'}
                    </Text>
                  </View>
                </View>

                <View className="mt-3">
                  <StatusBox>
                    {status.kind === 'done'
                      ? 'Goal reached.'
                      : status.kind === 'on_target'
                        ? 'Right on target.'
                        : status.kind === 'behind'
                          ? `Finish ${formatYm(status.finish)} — ${fmtMoney(status.extraMinor)} more a month gets you to ${formatYm(status.target)}`
                          : status.kind === 'no_date'
                            ? status.finish
                              ? `At this pace you'd finish ${formatYm(status.finish)}.`
                              : 'Set a monthly amount to see when you would finish.'
                            : 'Set a monthly amount to see when you would finish.'}
                  </StatusBox>
                </View>

                {goal.spaceId && split ? (
                  <Text className="font-sans mt-3 text-[13px] leading-[19px] text-muted">
                    Split by the space's ratio:{' '}
                    {goal.members
                      .map((m) => `${m.id === goal.myMemberId ? 'You' : m.name} ${fmtMoney(split[m.id] ?? 0)}`)
                      .join(' · ')}
                    {goal.myMemberId ? ` · your part ${fmtMoney(myShareOfMonthly(monthly, goal.members, goal.myMemberId))}` : ''}
                  </Text>
                ) : null}

                <Text className="font-sans-bold mt-4 text-[15px] text-ink">Contributions so far</Text>
                <View className="mt-2 gap-2">
                  {goal.contributions.length === 0 ? (
                    <Text className="font-sans text-[14px] text-muted">Nothing saved yet.</Text>
                  ) : goal.members.length > 0 ? (
                    goal.members.map((m) => {
                      const v = contributedBy.get(m.id) ?? 0;
                      const weightPct = totalWeight > 0 ? Math.round(((m.weight > 0 ? m.weight : 1) / totalWeight) * 100) : 0;
                      return (
                        <ContribRow
                          key={m.id}
                          name={m.id === goal.myMemberId ? 'You' : m.name}
                          value={`${fmtMoney(v)} · ${weightPct}% of each deposit`}
                        />
                      );
                    })
                  ) : (
                    <ContribRow name="You" value={`${fmtMoney(goal.savedMinor)} · ${goal.contributions.length} deposit${goal.contributions.length === 1 ? '' : 's'}`} />
                  )}
                </View>

                <View className="mt-4">
                  <Button label="+ Add contribution" variant="dark" onPress={() => { setAddError(null); setAddOpen(true); }} />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={goal ? `Add to ${goal.name}` : 'Add contribution'}>
        <View className="gap-3">
          <TextField label="Amount" prefix="₹" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="5,000" />
          {goal?.spaceId ? (
            <Text className="font-sans text-[13px] text-muted">Recorded as your own deposit towards the shared goal.</Text>
          ) : null}
          {addError ? <ErrorNote message={addError} /> : null}
          <Button label="Save contribution" size="lg" loading={add.isPending} onPress={submit} />
        </View>
      </Sheet>
    </View>
  );
}

function ContribRow({ name, value }: { name: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-[14px] bg-paper p-3">
      <Text className="font-sans text-[15px] text-ink">{name}</Text>
      <Text className="font-sans-bold text-[14px] text-ink">{value}</Text>
    </View>
  );
}
