import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { monthStartDateTime, monthStartIso } from './dates.ts';
import { qk, type ExpenseFilter } from './keys.ts';
import { mapCategory, mapExpense, toMinor } from './mappers.ts';
import { buildCreateExpensePayload, type ExpenseDraft } from './payloads.ts';
import type { Category, CategoryRow, Expense, ExpenseRow } from './types.ts';

const EXPENSE_COLUMNS =
  'id, owner_id, space_id, title, merchant_id, category_id, total_minor, currency, paid_by_member, paid_via, occurred_at, source, status';

/** Confirmed expenses, newest first. `spaceId` = one space; `personal` = only personal ones. */
export function useExpenses(filter: ExpenseFilter = {}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.expenseList(filter),
    enabled: !!session,
    queryFn: async (): Promise<Expense[]> => {
      let q = supabase
        .from('expenses')
        .select(EXPENSE_COLUMNS)
        .neq('status', 'void')
        .order('occurred_at', { ascending: false })
        .limit(filter.limit ?? 100);
      if (filter.spaceId) q = q.eq('space_id', filter.spaceId);
      else if (filter.personal) q = q.is('space_id', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data as ExpenseRow[]).map(mapExpense);
    },
  });
}

export function useCategories() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.categories,
    enabled: !!session,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, parent_id, owner_id, slug, name, icon, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as CategoryRow[]).map(mapCategory);
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ExpenseDraft): Promise<string> => {
      const payload = buildCreateExpensePayload(draft);
      const { data, error } = await supabase.rpc('create_expense', { p: payload });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      // Space summaries derive from balances, so the spaces list itself needs no refetch.
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.expenses }),
        qc.invalidateQueries({ queryKey: qk.balances }),
      ]);
    },
  });
}

/**
 * What the user has spent this calendar month: personal expenses in full plus their own share of
 * shared ones (from expense_shares).
 */
export function useMonthSpend(now: Date = new Date()) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const from = monthStartIso(now);
  return useQuery({
    queryKey: qk.monthSpend(uid, from),
    enabled: !!uid,
    queryFn: async (): Promise<number> => {
      const since = monthStartDateTime(now);
      // Two narrow reads in parallel: my personal totals, and only MY shares of shared expenses
      // (filtered server-side through the member row), instead of every member's shares.
      const [personal, shares] = await Promise.all([
        supabase
          .from('expenses')
          .select('total_minor')
          .is('space_id', null)
          .eq('owner_id', uid)
          .eq('status', 'confirmed')
          .gte('occurred_at', since),
        supabase
          .from('expense_shares')
          .select('owed_minor, expenses!inner(status, occurred_at), space_members!inner(user_id)')
          .eq('expenses.status', 'confirmed')
          .gte('expenses.occurred_at', since)
          .eq('space_members.user_id', uid),
      ]);
      if (personal.error) throw personal.error;
      if (shares.error) throw shares.error;
      let spent = 0;
      for (const e of (personal.data ?? []) as { total_minor: number | string }[]) spent += toMinor(e.total_minor);
      for (const s of (shares.data ?? []) as { owed_minor: number | string }[]) spent += toMinor(s.owed_minor);
      return spent;
    },
  });
}

/** Monthly budget limit (paise) from `budgets` (scope monthly, owner = me), or null. */
export function useMonthlyBudget() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.budget(uid),
    enabled: !!uid,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('limit_minor')
        .eq('owner_id', uid)
        .eq('scope', 'monthly')
        .eq('period', 'monthly')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data as { limit_minor: number | string }[] | null)?.[0];
      return row ? toMinor(row.limit_minor) : null;
    },
  });
}
