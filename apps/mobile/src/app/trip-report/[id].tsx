import { countsTowardBalance, spaceTransfers } from '@paymind/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Share, Text, View } from 'react-native';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  IconButton,
  Skeleton,
  StatusBox,
  fmtMoney,
} from '../../components/index.ts';
import { dateRange } from '../../data/dates.ts';
import { friendlyError } from '../../data/errors.ts';
import { useSettlements } from '../../data/settle.ts';
import { useBalances } from '../../data/useBalances.ts';
import { useCategories, useExpenses } from '../../data/useExpenses.ts';
import { useSpace, useSpaceMembers } from '../../data/useSpaces.ts';
import { useSpaceBudgets } from '../../features/spaces/data.ts';
import {
  categoryBreakdown,
  inclusiveDays,
  planVsActual,
  reportFacts,
  rootSlug,
  tripShareText,
} from '../../features/spaces/logic.ts';
import { FlowScreen } from '../../features/settle/ui.tsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shortOn = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]?.slice(0, 3)}`;

export default function TripReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const space = useSpace(id);
  const members = useSpaceMembers(id);
  const balances = useBalances(id);
  const expenses = useExpenses({ spaceId: id, limit: 500 });
  const categories = useCategories();
  const budgets = useSpaceBudgets(id);
  const settlements = useSettlements(id);

  const s = space.data;
  const active = (members.data ?? []).filter((m) => !m.leftAt);
  const exp = expenses.data ?? [];
  const cats = categories.data ?? [];
  const rows = balances.data ?? [];

  const report = useMemo(() => {
    const total = rows.reduce((a, b) => a + b.paidMinor, 0);
    const people = Math.max(1, active.length);
    const breakdown = categoryBreakdown(exp, cats);
    const slugById = new Map(cats.map((c) => [c.id, c.slug]));
    const planned = new Map<string, number>();
    for (const b of budgets.data ?? []) {
      if (b.scope === 'trip' && b.categoryId) planned.set(rootSlug(slugById.get(b.categoryId)), b.limitMinor);
    }
    const plan = planVsActual(breakdown, planned);
    const hasPlan = planned.size > 0;
    const paidByName = rows.map((b) => ({ name: b.displayName, paidMinor: b.paidMinor }));
    const facts = reportFacts({ expenses: exp, breakdown, plan, paidByName });

    let days = 1;
    if (s?.startsOn && s.endsOn) days = inclusiveDays(s.startsOn, s.endsOn);
    else if (exp.length > 1) {
      const times = exp.map((e) => Date.parse(e.occurredAt));
      days = inclusiveDays(new Date(Math.min(...times)).toISOString(), new Date(Math.max(...times)).toISOString());
    }

    const done = (settlements.data ?? []).filter((x) => countsTowardBalance(x.status)).length;
    const remaining = spaceTransfers(rows).length;
    const open = rows.filter((b) => b.netMinor > 0).reduce((a, b) => a + b.netMinor, 0);
    return { total, people, perPerson: Math.round(total / people), perDay: Math.round(total / people / days), plan, hasPlan, facts, done, remaining, open };
  }, [rows, active.length, exp, cats, budgets.data, settlements.data, s?.startsOn, s?.endsOn]);

  const range = s ? dateRange(s.startsOn, s.endsOn) : null;
  const today = new Date().toISOString().slice(0, 10);
  const ongoing = !!s?.endsOn && s.endsOn >= today;
  const budget = s?.budgetMinor ?? null;
  const budgetDiff = budget ? budget - report.total : null;

  const share = () => {
    if (!s) return;
    Share.share({
      message: tripShareText({
        name: s.name,
        range,
        totalMinor: report.total,
        perPersonMinor: report.perPerson,
        budgetMinor: budget,
        balances: rows.map((b) => ({ name: b.displayName, paidMinor: b.paidMinor, netMinor: b.netMinor })),
      }),
    }).catch(() => {});
  };

  const loading = space.isPending || members.isPending || balances.isPending || expenses.isPending;

  return (
    <FlowScreen
      title={`Generated ${shortOn(new Date())}`}
      onBack={() => router.back()}
      right={<IconButton icon="share-outline" label="Share report" onPress={share} />}
      background="bg-[#FBFAF6]"
    >
      {loading ? (
        <>
          <Skeleton height={60} />
          <Skeleton height={150} radius={28} />
          <Skeleton height={200} radius={28} />
        </>
      ) : space.isError || !s ? (
        <ErrorNote message={space.isError ? friendlyError(space.error) : 'We couldn’t find that trip.'} onRetry={() => space.refetch()} />
      ) : exp.length === 0 ? (
        <Card>
          <EmptyState title="Nothing to report yet" body="Add some expenses to this trip and the report writes itself." />
        </Card>
      ) : (
        <>
          {ongoing ? <StatusBox tone="peach">Trip still going — this report is a preview.</StatusBox> : null}

          <View>
            <Text className="font-sans-bold text-[14px] uppercase tracking-[1.3px] text-signal">Trip report</Text>
            <Text className="font-sans-bold mt-1 text-[34px] leading-[40px] text-ink">
              {s.name}
              {range ? `, ${range}` : ''}
            </Text>
            <Text className="font-sans mt-1 text-[15px] text-muted">
              {active.map((m) => m.displayName).join(', ')} · {exp.length} expenses
            </Text>
          </View>

          <Card tone="ink" radius={28} padding={18}>
            <Text className="font-sans-semibold text-[14px] uppercase tracking-[1.3px] text-steel">Total</Text>
            <View className="mt-1 items-start">
              <AmountText paise={report.total} variant="hero" tone="onDark" size={56} />
            </View>
            {budget && budgetDiff !== null ? (
              <Text className="font-sans mt-1 text-[15px] text-paper/80">
                {budgetDiff >= 0
                  ? `${fmtMoney(budgetDiff)} under the ${fmtMoney(budget)} budget`
                  : `${fmtMoney(-budgetDiff)} over the ${fmtMoney(budget)} budget`}
              </Text>
            ) : null}
          </Card>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-[22px] bg-steel p-3.5">
              <Text className="font-sans text-[14px] text-ink">Per person</Text>
              <AmountText paise={report.perPerson} variant="lg" />
            </View>
            <View className="flex-1 rounded-[22px] bg-sand p-3.5">
              <Text className="font-sans text-[14px] text-ink">Per person per day</Text>
              <AmountText paise={report.perDay} variant="lg" />
            </View>
          </View>

          <Card radius={28} padding={16}>
            <Text className="font-sans-bold mb-3 text-[18px] text-ink">Plan vs actual</Text>
            <View className="mb-2 flex-row">
              <Text className="font-sans flex-1 text-[14px] text-muted">Category</Text>
              <Text className="font-sans w-24 text-right text-[14px] text-muted">Planned</Text>
              <Text className="font-sans w-24 text-right text-[14px] text-muted">Actual</Text>
            </View>
            {report.plan.map((r) => {
              const over = r.plannedMinor !== null && r.actualMinor > r.plannedMinor;
              return (
                <View key={r.slug} className="flex-row items-center border-t border-[#F2F0EA] py-2.5">
                  <Text className="font-sans flex-1 text-[16px] text-ink" numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text className="font-sans w-24 text-right text-[16px] text-muted">
                    {r.plannedMinor !== null ? fmtMoney(r.plannedMinor) : '—'}
                  </Text>
                  <Text className={`font-sans-bold w-24 text-right text-[16px] ${over ? 'text-signal' : 'text-ink'}`}>
                    {fmtMoney(r.actualMinor)}
                  </Text>
                </View>
              );
            })}
            {!report.hasPlan ? (
              <Text className="font-sans mt-2 text-[13px] text-muted">No plan was set per category for this trip.</Text>
            ) : null}
          </Card>

          <Card radius={28} padding={16}>
            <Text className="font-sans-bold mb-3 text-[18px] text-ink">Contributions & balances</Text>
            <View className="mb-2 flex-row">
              <Text className="font-sans flex-1 text-[14px] text-muted">Person</Text>
              <Text className="font-sans w-24 text-right text-[14px] text-muted">Paid</Text>
              <Text className="font-sans w-24 text-right text-[14px] text-muted">Balance</Text>
            </View>
            {rows.map((b) => (
              <View key={b.memberId} className="flex-row items-center border-t border-[#F2F0EA] py-2.5">
                <Text className="font-sans flex-1 text-[16px] text-ink" numberOfLines={1}>
                  {b.displayName}
                </Text>
                <Text className="font-sans w-24 text-right text-[16px] text-ink">{fmtMoney(b.paidMinor)}</Text>
                <Text
                  className={`font-sans-bold w-24 text-right text-[16px] ${b.netMinor < 0 ? 'text-signal' : b.netMinor > 0 ? 'text-slate' : 'text-muted'}`}
                >
                  {b.netMinor === 0 ? 'square' : fmtMoney(b.netMinor, 0, true)}
                </Text>
              </View>
            ))}
            <View className="mt-3 rounded-2xl bg-peach p-3">
              <Text className="font-sans text-[14px] text-ink">
                <Text className="font-sans-bold">
                  {report.done} of {report.done + report.remaining}
                </Text>{' '}
                settlement payments done · {fmtMoney(report.open)} still open
              </Text>
            </View>
          </Card>

          {report.facts.length > 0 ? (
            <Card tone="oxblood" radius={28} padding={18} texture>
              <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-peach">What stood out</Text>
              <View className="mt-3 gap-3">
                {report.facts.map((f) => (
                  <Text key={f} className="font-sans text-[17px] leading-6 text-paper">
                    {f}
                  </Text>
                ))}
              </View>
            </Card>
          ) : null}

          {report.remaining > 0 ? (
            <Button
              label={`Close out the last ${report.remaining} payment${report.remaining === 1 ? '' : 's'}`}
              size="lg"
              onPress={() => router.push({ pathname: '/settle', params: { spaceId: s.id } })}
            />
          ) : null}
          <Button label="Share to group" variant="outline" size="lg" onPress={share} />

          <Text className="font-sans mt-1 text-center text-[14px] leading-5 text-muted">
            The shared version shows trip items and balances only — nobody&apos;s personal spending.
          </Text>
        </>
      )}
    </FlowScreen>
  );
}
