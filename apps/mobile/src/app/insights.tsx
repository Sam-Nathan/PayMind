import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorNote,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import {
  useAnomalies,
  useInsightProposals,
  useNudgeFrequency,
  useResolveAnomaly,
  useSeries,
  useSetNudgeFrequency,
  useSpendLines,
  type AnomalyItem,
  type NudgeFrequency,
} from '../data/money.ts';
import { monthEndIso, relativeDay } from '../data/dates.ts';
import { useCategories } from '../data/useExpenses.ts';
import { useRecurringDueBefore } from '../data/useHome.ts';
import {
  MONTH_NAMES,
  buildForecast,
  categoryDeltas,
  monthTotals,
  patternStats,
  pctText,
  startOfMonthsAgo,
} from '../features/money/logic.ts';
import { ForecastChart } from '../features/money/ui.tsx';

const FREQ = [
  { value: 'as_it_happens', label: 'As it happens' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly' },
] as const;

export default function InsightsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const [chartW, setChartW] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [unknownFor, setUnknownFor] = useState<AnomalyItem | null>(null);

  const lines = useSpendLines(startOfMonthsAgo(now, 4));
  const due = useRecurringDueBefore(monthEndIso(now));
  const cats = useCategories();
  const series = useSeries();
  const anomalies = useAnomalies();
  const nudges = useInsightProposals();
  const freq = useNudgeFrequency();
  const setFreq = useSetNudgeFrequency();
  const resolve = useResolveAnomaly();

  const data = useMemo(() => lines.data ?? [], [lines.data]);
  const monthName = MONTH_NAMES[now.getMonth()] as string;
  const prevName = (MONTH_NAMES[(now.getMonth() + 11) % 12] as string).slice(0, 3);

  const forecast = useMemo(() => buildForecast(data, now, due.data ?? 0), [data, now, due.data]);
  const months = useMemo(() => monthTotals(data, now, 5), [data, now]);
  const slugById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.slug] as const)), [cats.data]);
  const nameOf = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name] as const)), [cats.data]);
  const deltas = useMemo(() => categoryDeltas(data, now, 3), [data, now]);
  const patterns = useMemo(() => patternStats(data, slugById, series.data ?? [], now), [data, slugById, series.data, now]);

  const higher = forecast.vsLastMonthPct === null ? null : forecast.vsLastMonthPct >= 0;
  const maxDelta = Math.max(1, ...deltas.map((d) => Math.abs(d.deltaMinor)));

  const refresh = async () => {
    setRefreshing(true);
    await qc.refetchQueries({ type: 'active' }).catch(() => {});
    setRefreshing(false);
  };

  const act = (a: AnomalyItem, resolution: 'looks_right' | 'split' | 'unknown') => {
    resolve.mutate(
      { id: a.id, resolution },
      {
        onSuccess: () => {
          if (resolution === 'split') router.push('/expense-new');
          if (resolution === 'unknown') setUnknownFor(a);
        },
      },
    );
  };

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen options={{ title: `Insights · ${monthName}` }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {lines.error ? <ErrorNote message={friendlyError(lines.error)} onRetry={() => lines.refetch()} /> : null}

        {/* Forecast */}
        <Card tone="ink" radius={28} padding={18}>
          <Text className="font-sans-semibold text-[13px] tracking-[1.3px] text-steel">MONTH-END FORECAST</Text>
          {lines.isPending ? (
            <View className="mt-3"><Skeleton height={190} radius={16} /></View>
          ) : forecast.hasEnoughData ? (
            <>
              <View className="mt-1 flex-row flex-wrap items-center gap-3">
                <Text className="font-sans-bold text-[38px] text-paper">{fmtMoney(forecast.projectedMinor)}</Text>
                {forecast.vsLastMonthPct !== null ? (
                  <View className="h-[30px] justify-center rounded-[12px] px-2.5" style={{ backgroundColor: higher ? palette.signal : palette.slate }}>
                    <Text className="font-sans-bold text-[13px] text-white">
                      {pctText(forecast.vsLastMonthPct)} vs {prevName}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="font-sans mt-1 text-[14px] text-paper/75">
                {fmtMoney(forecast.spentToDateMinor)} spent so far · {forecast.daysLeft} days to go
              </Text>
              <View className="mt-3" onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))}>
                {chartW > 0 ? (
                  <ForecastChart
                    width={chartW}
                    points={months.slice(0, -1).map((m) => ({ label: m.label, value: m.totalMinor }))}
                    forecastLabel={months[months.length - 1]!.label}
                    forecastValue={forecast.projectedMinor}
                  />
                ) : null}
              </View>
              <Text className="font-sans mt-2 text-[12px] leading-[17px] text-steel">
                Spent so far + your median daily spend × days left + recurring payments still due.
              </Text>
            </>
          ) : (
            <>
              <Text className="font-sans-bold mt-2 text-[22px] text-paper">Needs a few more weeks of data</Text>
              <Text className="font-sans mt-1 text-[14px] text-paper/75">
                Add expenses for a couple of weeks and PayMind will project where {monthName} lands.
              </Text>
              <View className="mt-4 h-[90px] justify-end">
                <View className="h-px bg-inkSoft" />
                <View className="my-6 h-px bg-inkSoft" />
                <View className="h-px bg-inkSoft" />
              </View>
            </>
          )}
        </Card>

        {/* Why higher */}
        {forecast.hasEnoughData && deltas.length > 0 ? (
          <Card radius={28} padding={16}>
            <Text className="font-sans-bold text-[17px] text-ink">
              Why {monthName} is {higher === false ? 'lower' : 'higher'}
            </Text>
            <Text className="font-sans mt-0.5 text-[13px] text-muted">
              Spend so far vs the same days last month
            </Text>
            <View className="mt-3 gap-3.5">
              {deltas.map((d, i) => {
                const up = d.deltaMinor > 0;
                return (
                  <View key={d.categoryId ?? 'none'}>
                    <View className="mb-1.5 flex-row items-center justify-between">
                      <Text className="font-sans flex-1 text-[14px] text-ink" numberOfLines={1}>
                        {d.categoryId ? (nameOf.get(d.categoryId) ?? 'Category') : 'Uncategorised'}
                      </Text>
                      <Text className="font-sans-bold text-[15px]" style={{ color: up ? palette.ink : palette.slate }}>
                        {up ? '+' : '−'}
                        {fmtMoney(Math.abs(d.deltaMinor))}
                      </Text>
                    </View>
                    <ProgressBar value={Math.abs(d.deltaMinor) / maxDelta} fill={!up ? palette.slate : i === 0 ? palette.signal : palette.clay} />
                  </View>
                );
              })}
            </View>
            {patterns.diningCount > 0 ? (
              <Text className="font-sans mt-3 text-[13px] leading-[19px] text-muted">
                {patterns.diningWeekendCount} of {patterns.diningCount} food payments this month were on a weekend.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Patterns */}
        <SectionHeader title="Patterns" />
        <View className="-mt-3 flex-row flex-wrap gap-2.5">
          <PatternTile
            tone="steel"
            big={String(patterns.smallFoodCount)}
            text={`café & snack payments under ₹300${patterns.smallFoodCount ? ` — ${fmtMoney(patterns.smallFoodMinor)} in total` : ''}`}
          />
          <PatternTile
            tone="sand"
            big={patterns.weekendDiningShare === null ? '—' : `${Math.round(patterns.weekendDiningShare * 100)}%`}
            text={patterns.weekendDiningShare === null ? 'no food spend to compare yet' : 'of food spend happens on weekends'}
          />
          <PatternTile tone="sand" big={compact(patterns.lockedInMinor)} text="locked in recurring payments each month" />
          <PatternTile
            tone="peach"
            big={String(patterns.largeCount)}
            text={
              patterns.largeCount > 0
                ? `large one-off${patterns.largeCount === 1 ? '' : 's'} this month${patterns.largestTitle ? `: ${patterns.largestTitle}, ${fmtMoney(patterns.largestMinor)}` : ''}`
                : 'large one-offs (₹5,000+) this month'
            }
          />
        </View>

        {/* Anomalies */}
        {(anomalies.data ?? []).map((a) => (
          <Card key={a.id} radius={28} padding={16} emphasis="clay2">
            <Text className="font-sans-bold text-[14px] tracking-[1.3px] text-rust">UNUSUAL · PLEASE REVIEW</Text>
            <Text className="font-sans-bold mt-2 text-[19px] text-ink">
              {a.totalMinor !== null ? fmtMoney(a.totalMinor) : 'A payment'}
              {a.title ? ` at ${a.title}` : ''}
            </Text>
            <Text className="font-sans mt-1.5 text-[15px] leading-[21px] text-ink">{a.reason}</Text>
            <View className="mt-3 flex-row gap-2">
              <Button label="Looks right" variant="dark" size="md" full disabled={resolve.isPending} onPress={() => act(a, 'looks_right')} />
              <Button label="Split it" variant="outline" size="md" full disabled={resolve.isPending} onPress={() => act(a, 'split')} />
              <Button label="Don't know it" variant="outline" size="md" full disabled={resolve.isPending} onPress={() => act(a, 'unknown')} />
            </View>
          </Card>
        ))}
        {resolve.error ? <ErrorNote message={friendlyError(resolve.error)} /> : null}

        {/* Nudges: hidden until the nudge engine has written some */}
        {nudges.data && nudges.data.length > 0 ? (
          <>
            <SectionHeader title="Recent nudges" />
            <View className="-mt-3 overflow-hidden rounded-[24px] border border-hairline bg-white">
              {nudges.data.map((n, i) => (
                <View key={n.id} className={`p-4 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                  <Text className="font-sans text-[16px] leading-[22px] text-ink">{n.headline}</Text>
                  <Text className="font-sans mt-1 text-[13px] text-muted">
                    {n.body ? `${n.body} · ` : ''}
                    {relativeDay(n.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Nudge frequency */}
        <Card tone="sand" radius={28} padding={16}>
          <Text className="font-sans-bold text-[17px] text-ink">How often should PayMind nudge you?</Text>
          <View className="mt-3">
            <SegmentedControl<NudgeFrequency>
              options={FREQ}
              value={freq.data ?? 'daily'}
              onChange={(v) => setFreq.mutate(v)}
              selectedStyle="ink"
            />
          </View>
          {setFreq.error ? <Text className="font-sans mt-2 text-[13px] text-signal">{friendlyError(setFreq.error)}</Text> : null}
          <Text className="font-sans-semibold mt-3 text-[15px] text-signal" onPress={() => router.push('/privacy')} accessibilityRole="link">
            Choose categories and quiet hours
          </Text>
        </Card>
      </ScrollView>

      <Sheet visible={unknownFor !== null} onClose={() => setUnknownFor(null)} title="Don't recognise this?">
        <View className="gap-3">
          <Text className="font-sans text-[15px] leading-[21px] text-ink">
            {unknownFor?.totalMinor !== null && unknownFor?.totalMinor !== undefined ? `${fmtMoney(unknownFor.totalMinor)}${unknownFor.title ? ` at ${unknownFor.title}` : ''}. ` : ''}
            We've marked it as unknown. Here is what you can do:
          </Text>
          <Text className="font-sans text-[15px] leading-[21px] text-ink">1. Check your UPI app or card statement for the same payment.</Text>
          <Text className="font-sans text-[15px] leading-[21px] text-ink">2. If it is not yours, tell your bank or UPI app and ask them to dispute or block it.</Text>
          <Text className="font-sans text-[13px] leading-[19px] text-muted">PayMind never blocks cards or payments on its own.</Text>
          <Button label="Got it" variant="dark" onPress={() => setUnknownFor(null)} />
        </View>
      </Sheet>
    </View>
  );
}

function compact(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

function PatternTile({ tone, big, text }: { tone: 'steel' | 'sand' | 'peach'; big: string; text: string }) {
  return (
    <Card tone={tone} radius={24} padding={16} style={{ width: '48.5%' }}>
      <Text className="font-sans-bold text-[25px] text-ink">{big}</Text>
      <Text className="font-sans mt-1 text-[13px] leading-[18px] text-ink">{text}</Text>
    </Card>
  );
}
