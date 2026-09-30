/**
 * Data hooks for the money & planning screens (Money, Insights, Afford, Recurring, Goals, Timeline).
 * Query keys are local to this file; mutations invalidate the shared keys in ./keys.ts too, so Home
 * and the rest of the app stay in step. Keys start with an existing prefix ('expenses', 'recurring',
 * 'goals', 'budgets') on purpose so the existing invalidations (Realtime, create-expense) reach them.
 */
import { perDayDisplayRupees, safeToSpend, type SafeToSpendResult } from '@paymind/core';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  goalMonthlyNeed,
  keysetFilter,
  mapTimelineEvent,
  myShareOfMonthly,
  TIMELINE_PAGE_SIZE,
  type SpendLine,
  type TimelineEventRow,
  type TimelineFilter,
  type TimelineItem,
} from '../features/money/logic.ts';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../providers/AuthProvider.tsx';
import { daysLeftInMonth, monthEndIso, toIsoDate } from './dates.ts';
import { qk } from './keys.ts';
import { mapRecurring, toMinor } from './mappers.ts';
import type { RecurringRow } from './types.ts';
import { DEFAULT_BUFFER_MINOR, useManualBalance, useRecurringDueBefore } from './useHome.ts';

type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

export const mk = {
  spend: (uid: string | undefined, since: string) => ['expenses', 'spend-lines', uid, since] as const,
  spaceSpend: (ids: string, since: string) => ['expenses', 'space-spend', ids, since] as const,
  timeline: (uid: string | undefined, f: TimelineFilter) => ['expenses', 'timeline', uid, f] as const,
  budgets: (uid: string | undefined) => ['budgets', 'all', uid] as const,
  series: (uid: string | undefined) => ['recurring', 'all', uid] as const,
  goalList: (uid: string | undefined) => ['goals', 'all', uid] as const,
  anomalies: (uid: string | undefined) => ['anomalies', uid] as const,
  insightProposals: (uid: string | undefined) => ['insight-proposals', uid] as const,
  nudgePrefs: (uid: string | undefined) => ['notification-prefs', uid] as const,
};

const PAGE = 1000;
const MAX_PAGES = 6;

/** Runs a ranged query page by page (PostgREST caps a response at ~1000 rows). Bounded by MAX_PAGES. */
async function pageAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await run(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The user's own spend: personal expenses + their share of shared ones, since a date.

interface PersonalRow {
  id: string;
  title: string;
  merchant_id: string | null;
  category_id: string | null;
  total_minor: number | string;
  occurred_at: string;
  recurring_series_id: string | null;
}
interface ShareExpense {
  id: string;
  title: string;
  merchant_id: string | null;
  category_id: string | null;
  occurred_at: string;
  recurring_series_id: string | null;
}
interface ShareRow {
  owed_minor: number | string;
  expenses: ShareExpense | ShareExpense[] | null;
}

/**
 * Two queries (each paged, each bounded by `since`): my personal confirmed expenses and my own
 * expense_shares rows joined to their confirmed expense. No per-expense or per-category requests.
 */
export async function fetchSpendLines(uid: string, since: Date): Promise<SpendLine[]> {
  const sinceIso = since.toISOString();
  const [personal, shares] = await Promise.all([
    pageAll<PersonalRow>((from, to) =>
      supabase
        .from('expenses')
        .select('id, title, merchant_id, category_id, total_minor, occurred_at, recurring_series_id')
        .is('space_id', null)
        .eq('owner_id', uid)
        .eq('status', 'confirmed')
        .gte('occurred_at', sinceIso)
        .order('occurred_at', { ascending: false })
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: PersonalRow[] | null; error: unknown }>,
    ),
    pageAll<ShareRow>((from, to) =>
      supabase
        .from('expense_shares')
        .select('owed_minor, expense_id, expenses!inner(id, title, merchant_id, category_id, occurred_at, status, recurring_series_id), space_members!inner(user_id)')
        .eq('expenses.status', 'confirmed')
        .gte('expenses.occurred_at', sinceIso)
        .eq('space_members.user_id', uid)
        .order('expense_id')
        .range(from, to) as unknown as PromiseLike<{ data: ShareRow[] | null; error: unknown }>,
    ),
  ]);
  const lines: SpendLine[] = personal.map((r) => ({
    id: r.id,
    title: r.title,
    merchantId: r.merchant_id,
    categoryId: r.category_id,
    amountMinor: toMinor(r.total_minor),
    occurredAt: r.occurred_at,
    recurringSeriesId: r.recurring_series_id,
    shared: false,
  }));
  for (const s of shares) {
    const e = Array.isArray(s.expenses) ? s.expenses[0] : s.expenses;
    if (!e) continue;
    lines.push({
      id: e.id,
      title: e.title,
      merchantId: e.merchant_id,
      categoryId: e.category_id,
      amountMinor: toMinor(s.owed_minor),
      occurredAt: e.occurred_at,
      recurringSeriesId: e.recurring_series_id,
      shared: true,
    });
  }
  return lines;
}

/** The user's own spend lines since `since` (local midnight). */
export function useSpendLines(since: Date) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = toIsoDate(since);
  return useQuery({
    queryKey: mk.spend(uid, key),
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<SpendLine[]> => {
      if (!uid) throw new Error('Not signed in.');
      return fetchSpendLines(uid, since);
    },
  });
}

// ---------------------------------------------------------------------------
// Budgets

export type BudgetScope = 'monthly' | 'weekly' | 'category' | 'group' | 'event' | 'trip';
export type BudgetPeriod = 'weekly' | 'monthly' | 'custom';

export interface BudgetItem {
  id: string;
  ownerId: string | null;
  spaceId: string | null;
  scope: BudgetScope;
  period: BudgetPeriod;
  name: string | null;
  categoryId: string | null;
  limitMinor: number;
  startsOn: string | null;
  endsOn: string | null;
}

interface BudgetRow {
  id: string;
  owner_id: string | null;
  space_id: string | null;
  scope: BudgetScope;
  period: BudgetPeriod;
  name: string | null;
  category_id: string | null;
  limit_minor: number | string;
  starts_on: string | null;
  ends_on: string | null;
}

/** Every budget I can see (mine + my spaces'), newest first. */
export function useBudgets() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.budgets(uid),
    enabled: !!uid,
    queryFn: async (): Promise<BudgetItem[]> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('id, owner_id, space_id, scope, period, name, category_id, limit_minor, starts_on, ends_on')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as BudgetRow[]).map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        spaceId: r.space_id,
        scope: r.scope,
        period: r.period,
        name: r.name,
        categoryId: r.category_id,
        limitMinor: toMinor(r.limit_minor),
        startsOn: r.starts_on,
        endsOn: r.ends_on,
      }));
    },
  });
}

export interface SpaceSpendLine {
  spaceId: string;
  categoryId: string | null;
  amountMinor: number;
  occurredAt: string;
}

/** Confirmed expenses (everyone's) in the spaces that carry group/event/trip budgets, since `since`. One paged query. */
export function useSpaceBudgetSpend(spaceIds: readonly string[], since: Date) {
  const ids = [...new Set(spaceIds)].sort();
  const key = toIsoDate(since);
  return useQuery({
    queryKey: mk.spaceSpend(ids.join(','), key),
    enabled: ids.length > 0,
    queryFn: async (): Promise<SpaceSpendLine[]> => {
      const rows = await pageAll<{ space_id: string | null; category_id: string | null; total_minor: number | string; occurred_at: string }>(
        (from, to) =>
          supabase
            .from('expenses')
            .select('space_id, category_id, total_minor, occurred_at')
            .in('space_id', ids)
            .eq('status', 'confirmed')
            .gte('occurred_at', since.toISOString())
            .order('occurred_at', { ascending: false })
            .order('id')
            .range(from, to) as unknown as PromiseLike<{
            data: { space_id: string | null; category_id: string | null; total_minor: number | string; occurred_at: string }[] | null;
            error: unknown;
          }>,
      );
      return rows
        .filter((r) => r.space_id)
        .map((r) => ({
          spaceId: r.space_id as string,
          categoryId: r.category_id,
          amountMinor: toMinor(r.total_minor),
          occurredAt: r.occurred_at,
        }));
    },
  });
}

export interface NewBudget {
  scope: BudgetScope;
  period: BudgetPeriod;
  name: string | null;
  categoryId: string | null;
  spaceId: string | null;
  limitMinor: number;
  startsOn: string | null;
  endsOn: string | null;
}

export function useCreateBudget() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (b: NewBudget): Promise<void> => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not signed in.');
      const { error } = await supabase.from('budgets').insert({
        scope: b.scope,
        period: b.period,
        name: b.name,
        category_id: b.categoryId,
        limit_minor: b.limitMinor,
        starts_on: b.startsOn,
        ends_on: b.endsOn,
        // budgets_one_owner: a budget belongs to me or to a space, never both
        ...(b.spaceId ? { space_id: b.spaceId } : { owner_id: uid }),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

// ---------------------------------------------------------------------------
// Recurring series

export interface SeriesItem {
  id: string;
  name: string;
  kind: 'subscription' | 'emi' | 'bill' | 'other';
  cadence: string;
  expectedMinor: number;
  lastAmountMinor: number | null;
  amountVaries: boolean;
  nextDue: string | null;
  categoryId: string | null;
  merchantId: string | null;
  installmentsTotal: number | null;
  installmentsPaid: number;
  flags: Record<string, unknown> | null;
  priceUpMinor: number | null;
  status: string;
  remindDaysBefore: number | null;
}

interface SeriesRow extends RecurringRow {
  category_id: string | null;
  merchant_id: string | null;
  amount_varies: boolean;
  installments_total: number | null;
  installments_paid: number;
  remind_days_before: number | null;
}

/** Active recurring_series, soonest due first. */
export function useSeries() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.series(uid),
    enabled: !!uid,
    queryFn: async (): Promise<SeriesItem[]> => {
      const { data, error } = await supabase
        .from('recurring_series')
        .select('id, name, kind, cadence, expected_minor, last_amount_minor, amount_varies, next_due, category_id, merchant_id, installments_total, installments_paid, flags, status, remind_days_before')
        .eq('status', 'active')
        .order('next_due', { ascending: true, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return (data as unknown as SeriesRow[]).map((r) => ({
        ...mapRecurring(r),
        amountVaries: r.amount_varies,
        categoryId: r.category_id,
        merchantId: r.merchant_id,
        installmentsTotal: r.installments_total,
        installmentsPaid: r.installments_paid,
        flags: r.flags,
        status: r.status,
        remindDaysBefore: r.remind_days_before,
      }));
    },
  });
}

export interface NewSeries {
  name: string;
  kind: 'subscription' | 'emi' | 'bill' | 'other';
  cadence: 'weekly' | 'monthly';
  expectedMinor: number;
  nextDue: string;
  merchantId: string | null;
  categoryId: string | null;
  flags?: Record<string, unknown>;
}

function invalidateRecurring(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: qk.recurring });
}

/** "Track this": saves a detected series into recurring_series. */
export function useTrackSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: NewSeries): Promise<void> => {
      const { error } = await supabase.from('recurring_series').insert({
        name: s.name,
        kind: s.kind,
        cadence: s.cadence,
        expected_minor: s.expectedMinor,
        last_amount_minor: s.expectedMinor,
        next_due: s.nextDue,
        merchant_id: s.merchantId,
        category_id: s.categoryId,
        flags: (s.flags ?? {}) as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

/** Sets (or clears, with null) `remind_days_before` on every active series. */
export function useSetReminderLead() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (days: number | null): Promise<void> => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('recurring_series')
        .update({ remind_days_before: days })
        .eq('user_id', uid)
        .eq('status', 'active');
      if (error) throw error;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

/** Marks a series cancelled ("plan a cancel" sheet). */
export function useCancelSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('recurring_series').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRecurring(qc),
  });
}

// ---------------------------------------------------------------------------
// Goals

export interface GoalMember {
  id: string;
  userId: string | null;
  name: string;
  weight: number;
}
export interface GoalContribution {
  id: string;
  memberId: string | null;
  userId: string | null;
  amountMinor: number;
  at: string;
}
export interface GoalItem {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string | null;
  savedMinor: number;
  spaceId: string | null;
  members: GoalMember[];
  myMemberId: string | null;
  contributions: GoalContribution[];
}

interface GoalFullRow {
  id: string;
  name: string;
  target_minor: number | string;
  target_date: string | null;
  space_id: string | null;
  goal_contributions: { id: string; member_id: string | null; user_id: string | null; amount_minor: number | string; contributed_at: string }[] | null;
}

/** Active goals with contributions, plus members of the spaces behind shared goals (2 queries). */
export function useGoals() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.goalList(uid),
    enabled: !!uid,
    queryFn: async (): Promise<GoalItem[]> => {
      const { data, error } = await supabase
        .from('goals')
        .select('id, name, target_minor, target_date, space_id, goal_contributions(id, member_id, user_id, amount_minor, contributed_at)')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      const rows = data as unknown as GoalFullRow[];
      const spaceIds = [...new Set(rows.map((r) => r.space_id).filter((x): x is string => !!x))];
      const members = new Map<string, GoalMember[]>();
      if (spaceIds.length > 0) {
        const { data: ms, error: e2 } = await supabase
          .from('space_members')
          .select('id, space_id, user_id, display_name, share_weight, left_at')
          .in('space_id', spaceIds)
          .is('left_at', null);
        if (e2) throw e2;
        for (const m of (ms ?? []) as { id: string; space_id: string; user_id: string | null; display_name: string; share_weight: number | string }[]) {
          const list = members.get(m.space_id) ?? [];
          list.push({ id: m.id, userId: m.user_id, name: m.display_name, weight: Number(m.share_weight ?? 1) });
          members.set(m.space_id, list);
        }
      }
      return rows.map((r) => {
        const contributions = (r.goal_contributions ?? []).map((c) => ({
          id: c.id,
          memberId: c.member_id,
          userId: c.user_id,
          amountMinor: toMinor(c.amount_minor),
          at: c.contributed_at,
        }));
        const ms = r.space_id ? (members.get(r.space_id) ?? []) : [];
        return {
          id: r.id,
          name: r.name,
          targetMinor: toMinor(r.target_minor),
          targetDate: r.target_date,
          savedMinor: contributions.reduce((a, c) => a + c.amountMinor, 0),
          spaceId: r.space_id,
          members: ms,
          myMemberId: ms.find((m) => m.userId === uid)?.id ?? null,
          contributions,
        };
      });
    },
  });
}

/**
 * This month's goal set-aside: each active goal's monthly need for its target date (core
 * requiredMonthly), of which I carry my ratio share on a shared goal.
 */
export function goalSetAsideFor(goals: readonly GoalItem[] | undefined, now: Date): number {
  if (!goals) return 0;
  let total = 0;
  for (const g of goals) {
    const need = goalMonthlyNeed(g, now);
    total += myShareOfMonthly(need, g.members.length ? g.members : null, g.myMemberId);
  }
  return total;
}

export interface NewGoal {
  name: string;
  targetMinor: number;
  targetDate: string | null;
  spaceId: string | null;
}

export function useCreateGoal() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (g: NewGoal): Promise<void> => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not signed in.');
      const { error } = await supabase.from('goals').insert({
        name: g.name,
        target_minor: g.targetMinor,
        target_date: g.targetDate,
        ...(g.spaceId ? { space_id: g.spaceId } : { owner_id: uid }),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals }),
  });
}

export function useAddContribution() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (v: { goalId: string; amountMinor: number; memberId: string | null }): Promise<void> => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not signed in.');
      const { error } = await supabase.from('goal_contributions').insert({
        goal_id: v.goalId,
        amount_minor: v.amountMinor,
        member_id: v.memberId,
        user_id: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: qk.goals }), qc.invalidateQueries({ queryKey: ['expenses', 'timeline'] })]),
  });
}

// ---------------------------------------------------------------------------
// Safe to spend (same sources as Home: manual balance, recurring due to month end)

export interface SafeToSpendView {
  ready: boolean;
  balanceMinor: number | null;
  bufferMinor: number;
  dueMinor: number;
  goalSetAsideMinor: number;
  daysLeft: number;
  nextIncomeIso: string;
  result: SafeToSpendResult | null;
  perDayRupees: number | null;
}

/** First day after the month end (what the design calls "1 Nov"). */
export function nextMonthStartIso(now: Date): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

export function useSafeToSpend(now: Date = new Date()): SafeToSpendView & { loading: boolean } {
  const manual = useManualBalance();
  const due = useRecurringDueBefore(monthEndIso(now));
  const goals = useGoals();
  const daysLeft = daysLeftInMonth(now);
  const goalSetAsideMinor = useMemo(() => goalSetAsideFor(goals.data, now), [goals.data, now.getMonth(), now.getDate()]); // eslint-disable-line react-hooks/exhaustive-deps
  const balanceMinor = manual.data?.balanceMinor ?? null;
  const bufferMinor = manual.data?.bufferMinor ?? DEFAULT_BUFFER_MINOR;
  const dueMinor = due.data ?? 0;
  const result =
    balanceMinor === null
      ? null
      : safeToSpend({ balanceMinor, upcomingMinor: dueMinor, goalSetAsideMinor, bufferMinor, daysLeft });
  return {
    ready: balanceMinor !== null,
    balanceMinor,
    bufferMinor,
    dueMinor,
    goalSetAsideMinor,
    daysLeft,
    nextIncomeIso: nextMonthStartIso(now),
    result,
    perDayRupees: result ? perDayDisplayRupees(result.perDayMinor) : null,
    loading: manual.isPending || due.isPending || goals.isPending,
  };
}

// ---------------------------------------------------------------------------
// Insights: anomalies, nudges, nudge frequency

export interface AnomalyItem {
  id: string;
  reason: string;
  expenseId: string | null;
  title: string | null;
  totalMinor: number | null;
  spaceId: string | null;
}

interface AnomalyRow {
  id: string;
  reason: string;
  expense_id: string | null;
  expenses: { title: string; total_minor: number | string; space_id: string | null } | { title: string; total_minor: number | string; space_id: string | null }[] | null;
}

/** Unresolved anomalies, newest first. */
export function useAnomalies() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.anomalies(uid),
    enabled: !!uid,
    queryFn: async (): Promise<AnomalyItem[]> => {
      const { data, error } = await supabase
        .from('anomalies')
        .select('id, reason, expense_id, expenses(title, total_minor, space_id)')
        .is('resolution', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data as unknown as AnomalyRow[]).map((r) => {
        const e = Array.isArray(r.expenses) ? r.expenses[0] : r.expenses;
        return {
          id: r.id,
          reason: r.reason,
          expenseId: r.expense_id,
          title: e?.title ?? null,
          totalMinor: e ? toMinor(e.total_minor) : null,
          spaceId: e?.space_id ?? null,
        };
      });
    },
  });
}

export type AnomalyResolution = 'looks_right' | 'split' | 'unknown';

export function useResolveAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; resolution: AnomalyResolution }): Promise<void> => {
      const { error } = await supabase
        .from('anomalies')
        .update({ resolution: v.resolution, resolved_at: new Date().toISOString() })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['anomalies'] }), qc.invalidateQueries({ queryKey: ['expenses', 'timeline'] })]),
  });
}

export interface NudgeItem {
  id: string;
  headline: string;
  body: string;
  createdAt: string;
}

/** Recent ai_proposals of kind 'insight' (payload { headline, body }); empty until the nudge engine writes some. */
export function useInsightProposals(limit = 5) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.insightProposals(uid),
    enabled: !!uid,
    queryFn: async (): Promise<NudgeItem[]> => {
      const { data, error } = await supabase
        .from('ai_proposals')
        .select('id, payload, created_at')
        .eq('kind', 'insight')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const out: NudgeItem[] = [];
      for (const r of (data ?? []) as { id: string; payload: Record<string, unknown> | null; created_at: string }[]) {
        const headline = r.payload?.['headline'];
        const body = r.payload?.['body'];
        if (typeof headline === 'string') out.push({ id: r.id, headline, body: typeof body === 'string' ? body : '', createdAt: r.created_at });
      }
      return out;
    },
  });
}

export type NudgeFrequency = 'as_it_happens' | 'daily' | 'weekly';

export function useNudgeFrequency() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: mk.nudgePrefs(uid),
    enabled: !!uid,
    queryFn: async (): Promise<NudgeFrequency> => {
      const { data, error } = await supabase.from('notification_prefs').select('nudge_frequency').maybeSingle();
      if (error) throw error;
      return ((data as { nudge_frequency: NudgeFrequency } | null)?.nudge_frequency ?? 'daily') as NudgeFrequency;
    },
  });
}

export function useSetNudgeFrequency() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (f: NudgeFrequency): Promise<NudgeFrequency> => {
      if (!uid) throw new Error('Not signed in.');
      // The row is auto-created at sign-up; upsert covers accounts that predate the trigger.
      const { error } = await supabase.from('notification_prefs').upsert({ user_id: uid, nudge_frequency: f });
      if (error) throw error;
      return f;
    },
    onSuccess: (f) => qc.setQueryData(mk.nudgePrefs(uid), f),
  });
}

// ---------------------------------------------------------------------------
// Timeline (timeline_events view, keyset pagination on (occurred_at, ref_id))

export function useTimeline(filter: TimelineFilter) {
  const { session } = useAuth();
  const uid = session?.user.id;
  type Cursor = { occurredAt: string; refId: string } | null;
  const q = useInfiniteQuery<
    { items: TimelineItem[]; last: Cursor; more: boolean },
    Error,
    InfiniteData<{ items: TimelineItem[]; last: Cursor; more: boolean }, Cursor>,
    ReturnType<typeof mk.timeline>,
    Cursor
  >({
    queryKey: mk.timeline(uid, filter),
    enabled: !!uid,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('timeline_events')
        .select('event_type, ref_id, space_id, occurred_at, title, amount_minor, status, detail')
        // drop voided and unconfirmed drafts; goal rows have no status
        .or('status.is.null,status.not.in.(void,proposed)')
        .order('occurred_at', { ascending: false })
        .order('ref_id', { ascending: false })
        .limit(TIMELINE_PAGE_SIZE);
      if (filter === 'expenses') query = query.eq('event_type', 'expense');
      else if (filter === 'shared') query = query.not('space_id', 'is', null);
      else if (filter === 'payments') query = query.eq('event_type', 'payment');
      else if (filter === 'bills') query = query.eq('event_type', 'expense').eq('detail', 'recurring');
      else if (filter === 'alerts') query = query.eq('event_type', 'alert');
      else if (filter === 'goals') query = query.eq('event_type', 'goal');
      if (pageParam) query = query.or(keysetFilter(pageParam));
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as TimelineEventRow[];
      const items = rows.map(mapTimelineEvent).filter((x): x is TimelineItem => x !== null);
      const lastRow = items[items.length - 1];
      return { items, last: lastRow ? lastRow.cursor : null, more: rows.length === TIMELINE_PAGE_SIZE };
    },
    getNextPageParam: (lastPage) => (lastPage.more ? lastPage.last : undefined),
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: TimelineItem[] = [];
    for (const p of q.data?.pages ?? []) for (const i of p.items) if (!seen.has(i.key)) (seen.add(i.key), out.push(i));
    return out;
  }, [q.data]);
  return { ...q, items };
}
