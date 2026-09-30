import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { monthStartIso } from './dates.ts';
import { qk, type ExpenseFilter } from './keys.ts';
import { mapCategory, mapExpense, toMinor } from './mappers.ts';
import { buildCreateExpensePayload, type ExpenseDraft } from './payloads.ts';
import type { Category, CategoryRow, Expense, ExpenseRow } from './types.ts';

/** Confirmed expenses, newest first. `spaceId` = one space; `personal` = only personal ones. */
export function useExpenses(filter: ExpenseFilter = {}) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.expenseList(filter),
    enabled: !!session,
    queryFn: async (): Promise<Expense[]> => {
      let q = supabase
        .from('expenses')
        .select('*')
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
        .select('*')
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.expenses }),
        qc.invalidateQueries({ queryKey: qk.balances }),
        qc.invalidateQueries({ queryKey: qk.spaces }),
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
      const [mine, expenses] = await Promise.all([
        supabase.from('space_members').select('id').eq('user_id', uid),
        supabase
          .from('expenses')
          .select('space_id, total_minor, expense_shares(member_id, owed_minor)')
          .eq('status', 'confirmed')
          .gte('occurred_at', `${from}T00:00:00`),
      ]);
      if (mine.error) throw mine.error;
      if (expenses.error) throw expenses.error;
      const myIds = new Set(((mine.data ?? []) as { id: string }[]).map((m) => m.id));
      type Row = {
        space_id: string | null;
        total_minor: number | string;
        expense_shares: { member_id: string; owed_minor: number | string }[] | null;
      };
      let spent = 0;
      for (const e of (expenses.data ?? []) as Row[]) {
        if (e.space_id === null) spent += toMinor(e.total_minor);
        else
          for (const s of e.expense_shares ?? []) {
            if (myIds.has(s.member_id)) spent += toMinor(s.owed_minor);
          }
      }
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
