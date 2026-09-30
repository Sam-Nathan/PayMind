import { paiseToRupeeString } from '@paymind/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  SegmentedControl,
  Skeleton,
  TextField,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { monthEndIso, shortDate, toIsoDate } from '../data/dates.ts';
import { useGoals, useSafeToSpend, useSeries, useSpendLines } from '../data/money.ts';
import { parseAmountInput } from '../data/payloads.ts';
import { useCategories } from '../data/useExpenses.ts';
import { useManualBalance } from '../data/useHome.ts';
import {
  affordScenario,
  buildForecast,
  dueBefore,
  eatLessDelta,
  formatYm,
  goalMonthlyNeed,
  monthlyOf,
  overlapCancelCandidates,
  skipMonthEta,
  startOfMonthsAgo,
  sumRange,
  type SeriesLike,
  type WhatIfToggles,
} from '../features/money/logic.ts';
import { BalanceSheet, ScenarioToggleCard, Stepper } from '../features/money/ui.tsx';

type Period = 'week' | 'month';
const PRESETS: { id: string; label: string; minor: number; period: Period }[] = [
  { id: 'w5', label: 'Spend ₹5k this week', minor: 500_000, period: 'week' },
  { id: 'm12', label: '₹12k trip', minor: 1_200_000, period: 'month' },
  { id: 'm20', label: '₹20k phone', minor: 2_000_000, period: 'month' },
];

export default function AffordScreen() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const today = toIsoDate(now);
  const monthEnd = monthEndIso(now);

  const sts = useSafeToSpend(now);
  const manual = useManualBalance();
  const lines = useSpendLines(startOfMonthsAgo(now, 4));
  const cats = useCategories();
  const series = useSeries();
  const goals = useGoals();

  const [preset, setPreset] = useState<string | null>('m20');
  const [amountText, setAmountText] = useState('20000');
  const [period, setPeriod] = useState<Period>('month');
  const [toggles, setToggles] = useState<WhatIfToggles>({ skipGoal: false, eatLess: false, cancelSubs: false });
  const [balanceOpen, setBalanceOpen] = useState(false);

  const purchase = amountText.trim() === '0' || amountText.trim() === '' ? 0 : (parseAmountInput(amountText) ?? 0);
  const setAmount = (minor: number) => {
    setPreset(null);
    setAmountText(paiseToRupeeString(Math.round(minor)).replace(/\.00$/, ''));
  };

  const data = useMemo(() => lines.data ?? [], [lines.data]);
  const slugById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.slug] as const)), [cats.data]);
  const forecast = useMemo(() => buildForecast(data, now, 0), [data, now]);

  // "eat out 20% less": food spend this month, paced over the rest of the month
  const diningSpent = useMemo(
    () =>
      sumRange(data, `${today.slice(0, 7)}-01`, today, (l) => {
        const slug = l.categoryId ? slugById.get(l.categoryId) : null;
        return !!slug && (slug === 'food' || slug.startsWith('food.'));
      }),
    [data, slugById, today],
  );
  const eatLessMinor = eatLessDelta(diningSpent, now);

  // "cancel overlapping subscriptions": all but the priciest in a category
  const seriesLike: SeriesLike[] = useMemo(() => series.data ?? [], [series.data]);
  const cancel = useMemo(() => overlapCancelCandidates(seriesLike, slugById), [seriesLike, slugById]);
  const cancelDueMinor = dueBefore(cancel, today, monthEnd);
  const cancelYearly = cancel.reduce((a, s) => a + monthlyOf(s) * 12, 0);

  // "skip this month's goal saving": what it does to the first goal's finish month
  const goal = (goals.data ?? []).find((g) => g.targetDate && g.savedMinor < g.targetMinor) ?? null;
  const goalEta = goal ? skipMonthEta(goal, goalMonthlyNeed(goal, now), now) : null;

  const scenario = useMemo(() => {
    if (!sts.ready) return null;
    return affordScenario(
      {
        balanceMinor: sts.balanceMinor as number,
        upcomingMinor: sts.dueMinor,
        goalSetAsideMinor: sts.goalSetAsideMinor,
        bufferMinor: sts.bufferMinor,
        daysLeft: sts.daysLeft,
        typicalDailySpendMinor: forecast.medianDailyMinor,
      },
      purchase,
      toggles,
      { skipGoalMinor: sts.goalSetAsideMinor, eatLessMinor, cancelSubsMinor: cancelDueMinor },
    );
  }, [sts, forecast.medianDailyMinor, purchase, toggles, eatLessMinor, cancelDueMinor]);

  const nextIncome = shortDate(sts.nextIncomeIso);
  const toggle = (k: keyof WhatIfToggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));
  const when = period === 'week' ? 'this week' : 'this month';

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        {/* Scenario */}
        <Card radius={28} padding={16}>
          <ChipGroup>
            {PRESETS.map((p) => (
              <Chip
                key={p.id}
                label={p.label}
                selected={preset === p.id}
                onPress={() => {
                  setPreset(p.id);
                  setAmountText(paiseToRupeeString(p.minor).replace(/\.00$/, ''));
                  setPeriod(p.period);
                }}
              />
            ))}
          </ChipGroup>
          <View className="mt-4">
            <SegmentedControl<Period>
              options={[
                { value: 'week', label: 'This week' },
                { value: 'month', label: 'This month' },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </View>
          <View className="mt-4 flex-row items-end gap-3">
            <View className="flex-1">
              <TextField label={`Spend ${when}`} prefix="₹" value={amountText} onChangeText={(t) => { setPreset(null); setAmountText(t); }} keyboardType="decimal-pad" placeholder="20,000" />
            </View>
            <View className="pb-0.5">
              <Stepper valueMinor={purchase} stepMinor={50_000} onChange={setAmount} />
            </View>
          </View>
        </Card>

        {!sts.ready && !sts.loading && manual.isFetched ? (
          <Card tone="sand" radius={28} padding={18}>
            <EmptyState
              title="Tell us your balance first"
              body="To check what you can afford, PayMind needs roughly what you have in your accounts. It stays on this phone."
              actionLabel="Set your balance"
              onAction={() => setBalanceOpen(true)}
            />
          </Card>
        ) : sts.loading || !scenario ? (
          <Skeleton height={170} radius={28} />
        ) : (
          <>
            <Verdict
              verdict={scenario.verdict}
              leftMinor={scenario.leftMinor}
              leftPerDayMinor={scenario.leftPerDayMinor}
              daysLeft={sts.daysLeft}
              nextIncome={nextIncome}
              when={when}
            />

            <Card radius={24} padding={16}>
              <Text className="font-sans-bold text-[18px] text-ink">How it's worked out</Text>
              <View className="mt-2">
                <Line label="Money in your account" value={fmtMoney(sts.balanceMinor as number)} />
                <Line label={`Bills, EMI & dues before ${nextIncome}`} value={`−${fmtMoney(scenario.upcomingMinor)}`} />
                <Line label="Goal contributions" value={`−${fmtMoney(scenario.goalSetAsideMinor)}`} />
                <Line label="Safety buffer" value={`−${fmtMoney(sts.bufferMinor)}`} />
                {scenario.eatLessMinor > 0 ? <Line label="Eating out 20% less" value={`+${fmtMoney(scenario.eatLessMinor)}`} /> : null}
                <View className="my-1 h-0.5 bg-ink" />
                <Line label="Free to spend" value={fmtMoney(scenario.freeMinor)} bold />
                <Line label="This purchase" value={`−${fmtMoney(purchase)}`} />
                <View className="my-1 h-0.5 bg-ink" />
                <Line label={`Left for ${sts.daysLeft} days`} value={fmtMoney(scenario.leftMinor)} bold last />
              </View>
            </Card>

            <Text className="font-sans-bold mt-2 text-[18px] text-ink">What if…</Text>
            <ScenarioToggleCard
              title="Skip this month's goal saving"
              subtitle={
                goal && goalEta?.before && goalEta.after
                  ? `${goal.name} moves from ${formatYm(goalEta.before)} to ${formatYm(goalEta.after)}`
                  : sts.goalSetAsideMinor > 0
                    ? 'Your goals wait a month'
                    : 'You have no goal saving to skip'
              }
              deltaMinor={sts.goalSetAsideMinor}
              checked={toggles.skipGoal}
              disabled={sts.goalSetAsideMinor === 0}
              onToggle={() => toggle('skipGoal')}
            />
            <ScenarioToggleCard
              title="Eat out 20% less"
              subtitle={diningSpent > 0 ? 'Lowers what you need for the rest of the month' : 'No food spending this month to base this on'}
              deltaMinor={eatLessMinor}
              checked={toggles.eatLess}
              disabled={eatLessMinor === 0}
              onToggle={() => toggle('eatLess')}
            />
            <ScenarioToggleCard
              title={cancel.length > 0 ? `Cancel ${cancel.map((s) => s.name).join(' and ')}` : 'Cancel overlapping subscriptions'}
              subtitle={
                cancel.length === 0
                  ? 'No overlapping subscriptions found'
                  : `Saves ${fmtMoney(cancelYearly)} a year${cancelDueMinor === 0 ? ' · nothing is due before month end' : ''}`
              }
              deltaMinor={cancelDueMinor}
              checked={toggles.cancelSubs}
              disabled={cancel.length === 0}
              onToggle={() => toggle('cancelSubs')}
            />
          </>
        )}

        <Card tone="sand" radius={24} padding={16}>
          <Text className="font-sans-bold text-[15px] text-ink">Assumptions</Text>
          <Text className="font-sans mt-1.5 text-[14px] leading-[21px] text-ink">
            {manual.data?.updatedAt ? `Balance is what you entered on ${shortDate(manual.data.updatedAt.slice(0, 10))}. ` : 'Balance is what you enter in the app. '}
            Income arriving before {nextIncome} isn't counted. Bills and EMIs are the recurring payments due before then. Your usual
            day-to-day spend is the median of the last 90 days. "This week" or "this month" changes the wording only; the check is
            always against what is free until {nextIncome}. This is a guide, not financial advice.
          </Text>
        </Card>
      </ScrollView>

      <BalanceSheet
        key={manual.data?.updatedAt ?? 'none'}
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        initialBalance={manual.data?.balanceMinor}
        initialBuffer={manual.data?.bufferMinor}
      />
    </View>
  );
}

function Verdict({
  verdict,
  leftMinor,
  leftPerDayMinor,
  daysLeft,
  nextIncome,
  when,
}: {
  verdict: 'yes' | 'tight' | 'no';
  leftMinor: number;
  leftPerDayMinor: number;
  daysLeft: number;
  nextIncome: string;
  when: string;
}) {
  const copy = {
    no: {
      pill: `NOT ${when.toUpperCase()}`,
      head: leftMinor < 0 ? "That's more than you can safely spend right now." : 'You could, but it would squeeze everything else.',
      body:
        leftMinor < 0
          ? `It is ${fmtMoney(-leftMinor)} beyond what's free after bills, goals and your buffer. Waiting until ${nextIncome} keeps them safe.`
          : `Only ${fmtMoney(leftMinor)} would be left for ${daysLeft} days (${fmtMoney(leftPerDayMinor)}/day). Waiting until ${nextIncome} keeps your goals and bills safe.`,
    },
    tight: {
      pill: 'TIGHT',
      head: "Doable, but you'll feel it.",
      body: `${fmtMoney(leftMinor)} would be left for ${daysLeft} days (${fmtMoney(leftPerDayMinor)}/day), less than you usually spend.`,
    },
    yes: {
      pill: 'YES, COMFORTABLY',
      head: 'Yes, this fits without squeezing anything.',
      body: `${fmtMoney(leftMinor)} would still be left for ${daysLeft} days (${fmtMoney(leftPerDayMinor)}/day).`,
    },
  }[verdict];
  const bg = verdict === 'no' ? palette.signal : verdict === 'tight' ? palette.rust : palette.slate;
  return (
    <Card tone="ink" radius={28} padding={18} style={{ backgroundColor: bg }}>
      <View className="h-9 self-start justify-center rounded-pill bg-white px-3.5">
        <Text className="font-sans-bold text-[13px] tracking-[1px]" style={{ color: bg }}>
          {copy.pill}
        </Text>
      </View>
      <Text className="font-sans-bold mt-3 text-[25px] leading-[31px] text-white">{copy.head}</Text>
      <Text className="font-sans mt-2 text-[15px] leading-[22px] text-white/90">{copy.body}</Text>
    </Card>
  );
}

function Line({ label, value, bold, last }: { label: string; value: string; bold?: boolean; last?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between py-2.5 ${last ? '' : ''}`}>
      <Text className={`${bold ? 'font-sans-bold' : 'font-sans'} flex-1 pr-3 text-[16px] text-ink`}>{label}</Text>
      <Text className={`${bold ? 'font-sans-bold' : 'font-sans-semibold'} text-[16px] text-ink`}>{value}</Text>
    </View>
  );
}
