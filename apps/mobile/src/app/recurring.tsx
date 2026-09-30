import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  SectionHeader,
  Sheet,
  Skeleton,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import {
  useCancelSeries,
  useSeries,
  useSetReminderLead,
  useSpendLines,
  useTrackSeries,
  type SeriesItem,
} from '../data/money.ts';
import { shortDate } from '../data/dates.ts';
import { useCategories } from '../data/useExpenses.ts';
import {
  initials,
  monthlyOf,
  ordinalDay,
  startOfMonthsAgo,
  subscriptionFlags,
  subscriptionTotals,
  suggestSeries,
  type SeriesFlag,
  type SuggestedSeries,
} from '../features/money/logic.ts';
import { InsightNoteCard, SwitchRow } from '../features/money/ui.tsx';

const REMIND_DAYS = 2;
const FLAG_COLOR: Record<SeriesFlag, string> = {
  'PRICE UP': palette.signal,
  OVERLAP: palette.rust,
  'UNUSED?': palette.slate,
};

function cadenceLabel(c: string): string {
  return { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', yearly: 'Yearly' }[c] ?? c;
}

export default function RecurringScreen() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const series = useSeries();
  const cats = useCategories();
  const lines = useSpendLines(startOfMonthsAgo(now, 6));
  const track = useTrackSeries();
  const remind = useSetReminderLead();
  const cancel = useCancelSeries();
  const [planFor, setPlanFor] = useState<SeriesItem | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);

  const all = useMemo(() => series.data ?? [], [series.data]);
  const subs = useMemo(() => all.filter((s) => s.kind === 'subscription'), [all]);
  const others = useMemo(() => all.filter((s) => s.kind !== 'subscription'), [all]);
  const slugById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.slug] as const)), [cats.data]);
  const catName = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name] as const)), [cats.data]);
  const flags = useMemo(() => subscriptionFlags(subs, slugById, lines.data ?? [], now), [subs, slugById, lines.data, now]);
  const totals = useMemo(() => subscriptionTotals(subs), [subs]);
  const suggestions = useMemo(
    () => (series.isSuccess && all.length === 0 && lines.data ? suggestSeries(lines.data) : []),
    [series.isSuccess, all.length, lines.data],
  );

  const remindersOn = all.length > 0 && all.every((s) => s.remindDaysBefore === REMIND_DAYS);

  // "Worth a look" notes, computed from the flags
  const notes = useMemo(() => {
    const out: { key: string; tone: 'signal' | 'clay' | 'slate'; title: string; body: string; series: SeriesItem }[] = [];
    for (const s of subs) {
      const f = flags.get(s.id) ?? [];
      if (f.includes('PRICE UP')) {
        const up = s.priceUpMinor;
        const from = up ? s.expectedMinor - up : null;
        out.push({
          key: `${s.id}-price`,
          tone: 'signal',
          title: from && up ? `${s.name} went up ${Math.round((up / from) * 100)}%` : `${s.name} price went up`,
          body:
            from && up
              ? `${fmtMoney(from)} → ${fmtMoney(s.expectedMinor)}. That's ${fmtMoney(monthlyOf({ cadence: s.cadence, expectedMinor: up }) * 12)} more a year.`
              : 'The latest bill was higher than before.',
          series: s,
        });
      }
    }
    const overlapGroups = new Map<string, SeriesItem[]>();
    for (const s of subs) {
      if ((flags.get(s.id) ?? []).includes('OVERLAP') && s.categoryId) {
        overlapGroups.set(s.categoryId, [...(overlapGroups.get(s.categoryId) ?? []), s]);
      }
    }
    for (const [cat, g] of overlapGroups) {
      const cheapest = g.slice().sort((a, b) => monthlyOf(a) - monthlyOf(b))[0] as SeriesItem;
      out.push({
        key: `${cat}-overlap`,
        tone: 'clay',
        title: g.length === 2 ? 'Two similar subscriptions' : `${g.length} similar subscriptions`,
        body: `${g.map((x) => x.name).join(' and ')} are both in ${catName.get(cat) ?? 'the same category'}. Dropping ${cheapest.name} saves ${fmtMoney(monthlyOf(cheapest) * 12)} a year.`,
        series: cheapest,
      });
    }
    for (const s of subs) {
      if ((flags.get(s.id) ?? []).includes('UNUSED?')) {
        out.push({
          key: `${s.id}-unused`,
          tone: 'slate',
          title: `Still using ${s.name}?`,
          body: `No other ${s.categoryId ? (catName.get(s.categoryId) ?? 'related') : 'related'} spending in the last 30 days. If you've stopped, cancelling saves ${fmtMoney(monthlyOf(s) * 12)} a year.`,
          series: s,
        });
      }
    }
    return out;
  }, [subs, flags, catName]);

  const onTrack = async (s: SuggestedSeries) => {
    setTracking(s.key);
    try {
      await track.mutateAsync({
        name: s.name,
        kind: 'subscription',
        cadence: s.cadence,
        expectedMinor: s.amountMinor,
        nextDue: s.nextDate,
        merchantId: s.merchantId,
        categoryId: s.categoryId,
        flags: s.priceChange ? { price_change: { from_minor: s.priceChange.fromMinor, to_minor: s.priceChange.toMinor } } : {},
      });
    } catch {
      // surfaced through track.error below
    } finally {
      setTracking(null);
    }
  };

  const loading = series.isPending;

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {series.error ? <ErrorNote message={friendlyError(series.error)} onRetry={() => series.refetch()} /> : null}

        <Card tone="ink" radius={28} padding={18}>
          <Text className="font-sans-semibold text-[13px] tracking-[1.3px] text-steel">
            SUBSCRIPTIONS · {totals.count} ACTIVE
          </Text>
          {loading ? (
            <View className="mt-3"><Skeleton height={56} radius={12} /></View>
          ) : (
            <>
              <View className="mt-2 flex-row items-end">
                <AmountText paise={totals.monthlyMinor} variant="hero" tone="onDark" size={61} unit="a month" />
              </View>
              <Text className="font-sans mt-2 text-[15px] text-paper/80">
                {fmtMoney(totals.yearlyMinor)} a year
                {totals.priceUpMonthlyMinor > 0 ? ` · up ${fmtMoney(totals.priceUpMonthlyMinor)}/month from price rises` : ''}
              </Text>
            </>
          )}
        </Card>

        {suggestions.length > 0 ? (
          <>
            <SectionHeader title="We spotted these" meta="from your last 6 months" />
            <View className="overflow-hidden rounded-[24px] border border-hairline bg-white">
              {suggestions.map((s, i) => (
                <View key={s.key} className={`flex-row items-center gap-3 p-4 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-[16px] text-ink" numberOfLines={1}>{s.name}</Text>
                    <Text className="font-sans mt-0.5 text-[13px] text-muted">
                      {cadenceLabel(s.cadence)} · {s.occurrences} payments · next {shortDate(s.nextDate)}
                    </Text>
                  </View>
                  <View className="items-end gap-1.5">
                    <Text className="font-sans-bold text-[16px] text-ink">{fmtMoney(s.amountMinor)}</Text>
                    <Button label="Track this" size="sm" variant="dark" loading={tracking === s.key} onPress={() => onTrack(s)} />
                  </View>
                </View>
              ))}
            </View>
            {track.error ? <View className="mt-2"><ErrorNote message={friendlyError(track.error)} /></View> : null}
          </>
        ) : null}

        {notes.length > 0 ? (
          <>
            <SectionHeader title="Worth a look" />
            <View className="gap-2.5">
              {notes.map((n) => (
                <InsightNoteCard key={n.key} tone={n.tone} title={n.title} body={n.body} onPress={() => setPlanFor(n.series)} />
              ))}
            </View>
          </>
        ) : null}

        <SectionHeader title="All subscriptions" meta={subs.length > 0 ? 'Tap to plan a cancel' : undefined} />
        {loading ? (
          <Skeleton height={140} radius={24} />
        ) : subs.length === 0 ? (
          <Card tone="sand" radius={24} padding={16}>
            <EmptyState title="No subscriptions found yet" body="We'll spot them as payments come in." />
          </Card>
        ) : (
          <View className="overflow-hidden rounded-[24px] border border-hairline bg-white">
            {subs.map((s, i) => {
              const f = flags.get(s.id) ?? [];
              const was = s.priceUpMinor ? s.expectedMinor - s.priceUpMinor : null;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setPlanFor(s)}
                  accessibilityRole="button"
                  className={`min-h-[64px] flex-row items-center gap-3 p-3 ${i > 0 ? 'border-t border-hairline' : ''}`}
                >
                  <View className="h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-sand">
                    <Text className="font-sans-bold text-[17px] text-oxblood">{initials(s.name)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-[17px] text-ink" numberOfLines={1}>{s.name}</Text>
                    <Text className="font-sans text-[13px] text-muted" numberOfLines={2}>
                      {cadenceLabel(s.cadence)}
                      {s.nextDue ? ` · next ${shortDate(s.nextDue)}` : ''}
                      {was ? ` · was ${fmtMoney(was)}` : ''}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-sans-bold text-[17px] text-ink">{fmtMoney(s.expectedMinor)}</Text>
                    {f.map((x) => (
                      <Text key={x} className="font-sans-bold text-[12px] tracking-[0.8px]" style={{ color: FLAG_COLOR[x] }}>
                        {x}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {others.length > 0 ? (
          <>
            <SectionHeader title="Other recurring payments" meta="in your forecast" />
            <View className="overflow-hidden rounded-[24px] border border-hairline bg-white">
              {others.map((s, i) => (
                <View key={s.id} className={`flex-row items-center justify-between p-4 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                  <View className="flex-1 pr-3">
                    <Text className="font-sans-semibold text-[16px] text-ink" numberOfLines={1}>{s.name}</Text>
                    <Text className="font-sans text-[13px] text-muted">
                      {[
                        s.nextDue ? ordinalDay(s.nextDue) : null,
                        s.amountVaries ? 'amount varies' : cadenceLabel(s.cadence).toLowerCase(),
                        s.installmentsTotal ? `${s.installmentsPaid} of ${s.installmentsTotal} paid` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text className="font-sans-bold text-[16px] text-ink">{fmtMoney(s.expectedMinor)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {all.length > 0 ? (
          <View className="mt-4">
            <SwitchRow
              title={`Remind me ${REMIND_DAYS} days before each`}
              description="Saved on each recurring payment (remind_days_before)."
              value={remindersOn}
              disabled={remind.isPending}
              onValueChange={(v) => remind.mutate(v ? REMIND_DAYS : null)}
            />
            {remind.error ? <View className="mt-2"><ErrorNote message={friendlyError(remind.error)} /></View> : null}
          </View>
        ) : null}

        <View className="mt-4">
          <Button label="Add a bill" variant="dashed" onPress={() => router.push('/add-bill')} />
        </View>
      </ScrollView>

      <Sheet visible={planFor !== null} onClose={() => setPlanFor(null)} title={planFor ? `Plan a cancel · ${planFor.name}` : ''}>
        {planFor ? (
          <View className="gap-3">
            <Text className="font-sans text-[15px] leading-[21px] text-ink">
              {fmtMoney(planFor.expectedMinor)} {cadenceLabel(planFor.cadence).toLowerCase()}
              {planFor.nextDue ? `, next on ${shortDate(planFor.nextDue)}` : ''}. Cancelling saves{' '}
              <Text className="font-sans-bold">{fmtMoney(monthlyOf(planFor) * 12)} a year</Text>.
            </Text>
            <Text className="font-sans text-[13px] leading-[19px] text-muted">
              Cancel inside the service's own app or website before the next charge. Then mark it cancelled here so it leaves your
              forecast.
            </Text>
            {cancel.error ? <ErrorNote message={friendlyError(cancel.error)} /> : null}
            <Button
              label="I've cancelled it"
              variant="dark"
              loading={cancel.isPending}
              onPress={() => cancel.mutate(planFor.id, { onSuccess: () => setPlanFor(null) })}
            />
            <Button label="Keep it" variant="outline" onPress={() => setPlanFor(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
