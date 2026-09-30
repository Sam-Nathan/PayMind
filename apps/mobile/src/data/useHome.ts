/**
 * Smaller reads that only the Home dashboard needs: recurring bills, inbox count, goal, insight,
 * and the manually-entered balance that feeds safe-to-spend until an account-aggregator source exists.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { toIsoDate } from './dates.ts';
import { qk } from './keys.ts';
import { mapGoal, mapRecurring, toMinor } from './mappers.ts';
import type { Goal, GoalRow, Insight, RecurringItem, RecurringRow } from './types.ts';

/** Next `limit` active recurring payments by due date. */
export function useUpcomingRecurring(limit = 3) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.upcomingRecurring(limit),
    enabled: !!session,
    queryFn: async (): Promise<RecurringItem[]> => {
      const { data, error } = await supabase
        .from('recurring_series')
        .select('*')
        .eq('status', 'active')
        .not('next_due', 'is', null)
        .gte('next_due', toIsoDate(new Date()))
        .order('next_due', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data as RecurringRow[]).map(mapRecurring);
    },
  });
}

/** Σ expected amounts of active recurring payments due between today and `monthEnd` (YYYY-MM-DD). */
export function useRecurringDueBefore(monthEnd: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.dueBeforeMonthEnd(uid, monthEnd),
    enabled: !!uid,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('recurring_series')
        .select('expected_minor')
        .eq('status', 'active')
        .gte('next_due', toIsoDate(new Date()))
        .lte('next_due', monthEnd);
      if (error) throw error;
      return ((data ?? []) as { expected_minor: number | string }[]).reduce(
        (a, r) => a + toMinor(r.expected_minor),
        0,
      );
    },
  });
}

export interface InboxInfo {
  count: number;
  /** how many of them the parser flagged as recurring (parsed.looks_recurring) */
  recurringCount: number;
}

/** captured_txns with status 'inbox' (auto-captured UPI alerts waiting to be confirmed). */
export function useInboxCount() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.inboxCount,
    enabled: !!session,
    queryFn: async (): Promise<InboxInfo> => {
      const { data, error } = await supabase
        .from('captured_txns')
        .select('id, parsed')
        .eq('status', 'inbox')
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; parsed: Record<string, unknown> | null }[];
      return {
        count: rows.length,
        recurringCount: rows.filter((r) => r.parsed?.['looks_recurring'] === true).length,
      };
    },
  });
}

/** The user's first active goal with contributions summed. */
export function useActiveGoal() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.activeGoal(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Goal | null> => {
      const { data, error } = await supabase
        .from('goals')
        .select('id, name, target_minor, target_date, status, goal_contributions(amount_minor)')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = (data as GoalRow[] | null)?.[0];
      return row ? mapGoal(row) : null;
    },
  });
}

/**
 * Latest pending `ai_proposals` row of kind 'insight' with payload { headline, body }.
 * Returns null until the nudge engine (M4) writes one.
 */
export function useLatestInsight() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.insight(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Insight | null> => {
      const { data, error } = await supabase
        .from('ai_proposals')
        .select('id, payload')
        .eq('kind', 'insight')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data as { id: string; payload: Record<string, unknown> | null }[] | null)?.[0];
      const headline = row?.payload?.['headline'];
      const body = row?.payload?.['body'];
      if (!row || typeof headline !== 'string' || typeof body !== 'string') return null;
      return { id: row.id, headline, body };
    },
  });
}

// ---------------------------------------------------------------------------
// Manual balance (TODO: move to a profile/privacy field or the Account Aggregator in M6)

export interface ManualBalance {
  balanceMinor: number;
  bufferMinor: number;
  updatedAt: string;
}

export const DEFAULT_BUFFER_MINOR = 500000; // ₹5,000
const BALANCE_KEY = 'paymind.manualBalance.v1';

/** Validates stored JSON; anything malformed reads as "no balance". */
export function parseManualBalance(raw: string | null): ManualBalance | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ManualBalance>;
    if (Number.isSafeInteger(v.balanceMinor) && Number.isSafeInteger(v.bufferMinor)) {
      return {
        balanceMinor: v.balanceMinor as number,
        bufferMinor: v.bufferMinor as number,
        updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function useManualBalance() {
  return useQuery({
    queryKey: qk.manualBalance,
    staleTime: Infinity,
    queryFn: async (): Promise<ManualBalance | null> => {
      try {
        return parseManualBalance(await AsyncStorage.getItem(BALANCE_KEY));
      } catch {
        return null;
      }
    },
  });
}

export function useSetManualBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { balanceMinor: number; bufferMinor: number }): Promise<ManualBalance> => {
      const value: ManualBalance = { ...v, updatedAt: new Date().toISOString() };
      await AsyncStorage.setItem(BALANCE_KEY, JSON.stringify(value));
      return value;
    },
    onSuccess: (value) => qc.setQueryData(qk.manualBalance, value),
  });
}
