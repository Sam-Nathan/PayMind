import { PAISE_PER_RUPEE } from '@paymind/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  SectionHeader,
  Skeleton,
  fmtMoney,
} from '../../components/index.ts';
import { shortDate } from '../../data/dates.ts';
import { friendlyError } from '../../data/errors.ts';
import { useBudgets, useSafeToSpend, useSpaceBudgetSpend, useSpendLines } from '../../data/money.ts';
import { useCategories } from '../../data/useExpenses.ts';
import { useSpaceSummaries } from '../../data/useSpaces.ts';
import { useManualBalance } from '../../data/useHome.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import {
  MONTH_NAMES,
  budgetRowModel,
  budgetWindow,
  buildForecast,
  daysInMonth,
  dayOfWeek,
  spendByCategory,
  spentForCategory,
  startOfMonthsAgo,
  sumRange,
  weekStartIso,
} from '../../features/money/logic.ts';
import { BalanceSheet, BudgetRow } from '../../features/money/ui.tsx';
import { toIsoDate } from '../../data/dates.ts';

const PILL = 'h-11 items-center justify-center rounded-[14px] bg-sand px-3.5 active:opacity-80';

export default function MoneyScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // One window shared with Insights (same query key): covers the month, the week and the 90-day forecast history.
  const lines = useSpendLines(startOfMonthsAgo(now, 4));
  const budgets = useBudgets();
  const cats = useCategories();
  const sts = useSafeToSpend(now);
  const manual = useManualBalance();
  const summaries = useSpaceSummaries();

  const today = toIsoDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const dim = daysInMonth(now);
  const day = now.getDate();

  const parentOf = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.parentId] as const)), [cats.data]);
  const nameOf = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name] as const)), [cats.data]);

  const all = budgets.data ?? [];
  const mine = all.filter((b) => b.ownerId === uid);
  const monthly = mine.find((b) => b.scope === 'monthly' && b.period === 'monthly') ?? null;
  const categoryBudgets = mine.filter((b) => b.scope === 'category' && b.categoryId);
  const weekly = mine.find((b) => b.scope === 'weekly') ?? null;
  const spaceBudgets = all.filter((b) => b.spaceId && (b.scope === 'group' || b.scope === 'event' || b.scope === 'trip'));

  const spaceSince = useMemo(() => {
    let since = monthStart;
    for (const b of spaceBudgets) {
      const w = budgetWindow(b, now);
      if (w.from && w.from < since) since = w.from;
    }
    return new Date(`${since}T00:00:00`);
  }, [spaceBudgets, monthStart, now]);
  const spaceSpend = useSpaceBudgetSpend(spaceBudgets.map((b) => b.spaceId as string), spaceSince);

  const data = lines.data ?? [];
  const byCat = useMemo(() => spendByCategory(data, monthStart, today), [data, monthStart, today]);
  const spentMinor = useMemo(() => sumRange(data, monthStart, today), [data, monthStart, today]);
  const forecast = useMemo(() => buildForecast(data, now, sts.dueMinor), [data, now, sts.dueMinor]);

  const leftMinor = monthly ? monthly.limitMinor - spentMinor : null;
  const projectedOver = monthly ? Math.max(0, forecast.projectedMinor - monthly.limitMinor) : 0;

  const weekSpent = weekly ? sumRange(data, weekStartIso(now), today) : 0;
  const spaceTile = (b: (typeof spaceBudgets)[number]) => {
    const w = budgetWindow(b, now);
    let t = 0;
    for (const l of spaceSpend.data ?? []) {
      if (l.spaceId !== b.spaceId) continue;
      const d = toIsoDate(new Date(l.occurredAt));
      if ((w.from && d < w.from) || (w.to && d > w.to)) continue;
      if (b.categoryId && !(l.categoryId === b.categoryId || (l.categoryId && parentOf.get(l.categoryId) === b.categoryId))) continue;
      t += l.amountMinor;
    }
    return t;
  };

  const refresh = async () => {
    setRefreshing(true);
    await qc.refetchQueries({ type: 'active' }).catch(() => {});
    setRefreshing(false);
  };

  const loading = lines.isPending || budgets.isPending;
  const error = lines.error ?? budgets.error;

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="font-sans-bold text-[28px] text-ink">Money</Text>
            <Text className="font-sans mt-0.5 text-[15px] text-muted">
              {MONTH_NAMES[now.getMonth()]} · day {day} of {dim}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable className={PILL} onPress={() => router.push('/timeline')} accessibilityRole="link">
              <Text className="font-sans-semibold text-[14px] text-ink">Timeline</Text>
            </Pressable>
            <Pressable className={PILL} onPress={() => router.push('/insights')} accessibilityRole="link">
              <Text className="font-sans-semibold text-[14px] text-ink">Insights</Text>
            </Pressable>
          </View>
        </View>

        {error ? (
          <View className="mt-4">
            <ErrorNote message={friendlyError(error)} onRetry={() => void Promise.all([lines.refetch(), budgets.refetch()])} />
          </View>
        ) : null}

        {/* SAFE TO SPEND */}
        <View className="mt-5">
          <Card tone="oxblood" radius={28} padding={18} texture>
            <View className="flex-row items-start justify-between">
              <Text className="font-sans-bold text-[13px] tracking-[1.3px] text-peach">SAFE TO SPEND</Text>
              <Pressable onPress={() => router.push('/afford')} accessibilityRole="link" hitSlop={8}>
                <Text className="font-sans-semibold text-[14px] text-paper underline">Can I afford…?</Text>
              </Pressable>
            </View>
            {sts.loading && manual.isPending ? (
              <View className="mt-4"><Skeleton height={60} radius={12} /></View>
            ) : sts.ready && sts.result ? (
              <>
                <View className="mt-2 flex-row items-end">
                  <AmountText paise={sts.perDayRupees! * PAISE_PER_RUPEE} variant="hero" tone="onDark" size={66} unit="a day" />
                </View>
                <View className="mt-3 gap-2">
                  <Row
                    label="In your account"
                    value={fmtMoney(sts.balanceMinor!)}
                    action={{ label: 'Edit', onPress: () => setBalanceOpen(true) }}
                  />
                  <Row label="Bills, EMI & dues to month end" value={`−${fmtMoney(sts.dueMinor)}`} />
                  <Row label="Goal set-aside" value={`−${fmtMoney(sts.goalSetAsideMinor)}`} />
                  <Row label="Buffer" value={`−${fmtMoney(sts.bufferMinor)}`} />
                  <View className="my-1 h-px bg-paper/25" />
                  <Row
                    label={`Free until ${shortDate(sts.nextIncomeIso)} ÷ ${sts.daysLeft} days`}
                    value={fmtMoney(sts.result.freeMinor)}
                    bold
                  />
                </View>
                <Text className="font-sans mt-3 text-[12px] text-paper/60">
                  Balance entered by you{manual.data?.updatedAt ? ` · ${shortDate(manual.data.updatedAt.slice(0, 10))}` : ''}
                </Text>
              </>
            ) : (
              <View className="mt-3">
                <Text className="font-display text-[66px] leading-[70px] text-paper">—</Text>
                <Text className="font-sans mb-3 mt-1 text-[14px] leading-[20px] text-paper/85">
                  {leftMinor !== null
                    ? `Based on your budget: ${fmtMoney(Math.max(0, leftMinor))} left for ${sts.daysLeft} days (${fmtMoney(Math.max(0, Math.floor(leftMinor / sts.daysLeft)))} a day). Set your balance for the full picture.`
                    : 'Set your balance to see what is safe to spend each day.'}
                </Text>
                <Button label="Set your balance" variant="paperOnInk" size="sm" onPress={() => setBalanceOpen(true)} />
              </View>
            )}
          </Card>
        </View>

        {/* SPENT / LEFT / PROJECTED */}
        <View className="mt-3 flex-row gap-2.5">
          <Mini
            overline="SPENT"
            value={fmtMoney(spentMinor)}
            meta={monthly ? `${Math.round((spentMinor / monthly.limitMinor) * 100)}% of ${fmtMoney(monthly.limitMinor)}` : 'this month'}
            loading={loading}
          />
          <Mini
            overline="LEFT"
            value={leftMinor === null ? '—' : fmtMoney(leftMinor)}
            meta={leftMinor === null ? 'no monthly budget' : `for ${forecast.daysLeft} days`}
            loading={loading}
          />
          <Mini
            peach
            overline="PROJECTED"
            value={forecast.hasEnoughData || spentMinor > 0 ? fmtMoney(forecast.projectedMinor) : '—'}
            meta={monthly ? (projectedOver > 0 ? `${fmtMoney(projectedOver)} over` : 'within budget') : 'by month end'}
            loading={loading}
          />
        </View>

        {/* Category budgets */}
        {categoryBudgets.length > 0 ? (
          <>
            <View className="mb-3 mt-6 flex-row items-center justify-between">
              <Text className="font-sans-bold text-[18px] text-ink">Category budgets</Text>
              <Text className="font-sans text-[12px] text-muted">Tap one for details</Text>
            </View>
            <View className="overflow-hidden rounded-[24px] border border-hairline bg-white">
              {categoryBudgets.map((b, i) => {
                const spent = spentForCategory(byCat, b.categoryId as string, parentOf);
                const model = budgetRowModel(spent, b.limitMinor, day, dim);
                return (
                  <View key={b.id} className={i > 0 ? 'border-t border-hairline' : ''}>
                    <BudgetRow
                      name={b.name ?? nameOf.get(b.categoryId as string) ?? 'Category'}
                      spentMinor={spent}
                      limitMinor={b.limitMinor}
                      model={model}
                      expanded={open === b.id}
                      onToggle={() => setOpen(open === b.id ? null : b.id)}
                      projectedLabel={shortDate(monthEnd)}
                    />
                  </View>
                );
              })}
            </View>
            <Text className="font-sans mt-2 text-[13px] text-muted">
              The faint line marks where you'd be if spending were even across the month.
            </Text>
          </>
        ) : !loading ? (
          <View className="mt-6">
            <Card tone="sand" radius={28} padding={18} onPress={() => router.push('/budget-new')}>
              <Text className="font-sans-bold text-[19px] text-ink">Set your first budget</Text>
              <Text className="font-sans mt-1 text-[14px] text-muted">
                Give a category a monthly limit and PayMind shows whether your pace fits it.
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Other budgets */}
        <SectionHeader title="Other budgets" />
        <View className="flex-row flex-wrap gap-2.5">
          {weekly ? (
            <Tile
              tone="steel"
              title="This week"
              value={`${fmtMoney(weekSpent)} / ${fmtMoney(weekly.limitMinor)}`}
              meta={dayOfWeek(now) >= 7 ? 'resets tomorrow' : 'resets Monday'}
            />
          ) : null}
          {spaceBudgets.map((b) => {
            const sp = summaries.data?.find((s) => s.space.id === b.spaceId);
            const title = b.name ?? sp?.space.name ?? 'Space budget';
            const spent = spaceTile(b);
            if (b.scope === 'trip') {
              return (
                <Tile
                  key={b.id}
                  tone="ink"
                  title={`${title} · trip`}
                  value={`Plan ${fmtMoney(b.limitMinor)}`}
                  meta={`${fmtMoney(spent)} spent so far`}
                  onPress={() => router.push(`/space/${b.spaceId}`)}
                />
              );
            }
            return (
              <Tile
                key={b.id}
                tone="sand"
                title={`${title} · ${b.scope}`}
                value={`${fmtMoney(spent)} / ${fmtMoney(b.limitMinor)}`}
                meta={b.scope === 'group' && sp ? `shared by ${sp.memberCount}` : b.endsOn ? shortDate(b.endsOn) : sp ? `${sp.memberCount} people` : ''}
                onPress={() => router.push(`/space/${b.spaceId}`)}
              />
            );
          })}
          {!weekly && spaceBudgets.length === 0 ? (
            <Text className="font-sans text-[14px] text-muted">No weekly, event, group or trip budgets yet.</Text>
          ) : null}
        </View>
        <View className="mt-3">
          <Button label="+ New budget · monthly, weekly, category, group, event or trip" variant="dashed" onPress={() => router.push('/budget-new')} />
        </View>

        <View className="mt-4 flex-row gap-2.5">
          <Card radius={24} padding={16} onPress={() => router.push('/recurring')} style={{ flex: 1 }}>
            <Text className="font-sans-semibold text-center text-[15px] text-ink">Recurring & subscriptions</Text>
          </Card>
          <Card radius={24} padding={16} onPress={() => router.push('/goals')} style={{ flex: 1, justifyContent: 'center' }}>
            <Text className="font-sans-semibold text-center text-[15px] text-ink">Goals</Text>
          </Card>
        </View>
        {all.length === 0 && !loading && !budgets.isError ? (
          <View className="mt-2">
            <EmptyState title="No budgets yet" body="Budgets are optional. Safe to spend works from your balance alone." />
          </View>
        ) : null}
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

function Row({ label, value, bold, action }: { label: string; value: string; bold?: boolean; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2">
        <Text className={`${bold ? 'font-sans-bold' : 'font-sans'} flex-shrink text-[14px] text-paper`}>{label}</Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <Text className="font-sans-semibold text-[13px] text-peach underline">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text className={`${bold ? 'font-sans-bold' : 'font-sans'} text-[14px] text-paper`}>{value}</Text>
    </View>
  );
}

function Mini({ overline, value, meta, peach, loading }: { overline: string; value: string; meta: string; peach?: boolean; loading?: boolean }) {
  return (
    <Card tone={peach ? 'peach' : 'white'} radius={20} padding={14} style={{ flex: 1 }}>
      <Text className="font-sans-semibold text-[11px] tracking-[1.3px] text-muted">{overline}</Text>
      {loading ? (
        <View className="mt-1.5"><Skeleton height={20} radius={6} /></View>
      ) : (
        <Text className={`font-sans-bold mt-1 text-[17px] ${peach ? 'text-rust' : 'text-ink'}`} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      )}
      <Text className={`font-sans mt-0.5 text-[12px] ${peach ? 'text-rust' : 'text-muted'}`} numberOfLines={2}>
        {meta}
      </Text>
    </Card>
  );
}

function Tile({ tone, title, value, meta, onPress }: { tone: 'steel' | 'sand' | 'ink'; title: string; value: string; meta: string; onPress?: () => void }) {
  const dark = tone === 'ink';
  return (
    <Card tone={tone} radius={24} padding={14} onPress={onPress} style={{ width: '48.5%' }}>
      <Text className={`font-sans-semibold text-[13px] ${dark ? 'text-steel' : 'text-ink/70'}`} numberOfLines={1}>
        {title}
      </Text>
      <Text className={`font-sans-bold mt-1.5 text-[19px] ${dark ? 'text-paper' : 'text-ink'}`} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className={`font-sans mt-1 text-[12px] ${dark ? 'text-paper/70' : 'text-ink/60'}`} numberOfLines={1}>
        {meta}
      </Text>
    </Card>
  );
}
