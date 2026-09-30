/** Data hooks for the space detail variants and invites. Query keys local to this feature live here. */
import type { Json } from '@paymind/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../data/keys.ts';
import { toMinor } from '../../data/mappers.ts';
import { supabase } from '../../lib/supabase.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import type { BillMethod } from './logic.ts';

// Keys that mirror shared data start with the shared prefix ('budgets', 'goals', 'recurring',
// 'expenses') so the existing invalidations (create budget/goal/contribution, create expense,
// Realtime) refresh the space screens too.
export const spaceKeys = {
  defaultSplit: (id: string | undefined) => ['space-extra', 'default-split', id] as const,
  rules: (id: string | undefined) => ['space-extra', 'rules', id] as const,
  budgets: (id: string | undefined) => ['budgets', 'space', id] as const,
  goal: (id: string | undefined) => ['goals', 'space', id] as const,
  recurring: (id: string | undefined) => ['recurring', 'space', id] as const,
  myShare: (id: string | undefined, member: string | undefined, month: string) =>
    ['expenses', 'my-space-share', id, member, month] as const,
  invitePreview: (code: string | undefined) => ['space-extra', 'invite', code] as const,
};

export function useDefaultSplit(spaceId: string | undefined) {
  return useQuery({
    queryKey: spaceKeys.defaultSplit(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<Json | null> => {
      const { data, error } = await supabase.from('spaces').select('default_split').eq('id', spaceId as string).maybeSingle();
      if (error) throw error;
      return data?.default_split ?? null;
    },
  });
}

export function useSetDefaultSplit(spaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (split: Record<string, unknown>) => {
      const { error } = await supabase
        .from('spaces')
        .update({ default_split: split as Json })
        .eq('id', spaceId as string);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: spaceKeys.defaultSplit(spaceId) }),
        qc.invalidateQueries({ queryKey: qk.space(spaceId) }),
      ]);
    },
  });
}

export interface SplitRuleRow {
  id: string;
  billKind: string;
  name: string | null;
  method: string;
  params: Json;
}

export function useSplitRules(spaceId: string | undefined) {
  return useQuery({
    queryKey: spaceKeys.rules(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<SplitRuleRow[]> => {
      const { data, error } = await supabase
        .from('split_rules')
        .select('id, bill_kind, name, method, params')
        .eq('space_id', spaceId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, billKind: r.bill_kind, name: r.name, method: r.method, params: r.params }));
    },
  });
}

/** Update the rule of a bill (by row id) or add a new bill rule. */
export function useSaveSplitRule(spaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      existingId?: string | undefined;
      billKind: string;
      name: string;
      method: BillMethod;
      params: Record<string, unknown>;
    }) => {
      if (!spaceId) throw new Error('Missing space id.');
      if (p.existingId) {
        const { error } = await supabase
          .from('split_rules')
          .update({ method: p.method, params: p.params as Json, name: p.name })
          .eq('id', p.existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('split_rules').insert({
          space_id: spaceId,
          bill_kind: p.billKind,
          name: p.name,
          method: p.method,
          params: p.params as Json,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: spaceKeys.rules(spaceId) }),
  });
}

export interface BudgetRow {
  scope: string;
  categoryId: string | null;
  limitMinor: number;
}

export function useSpaceBudgets(spaceId: string | undefined) {
  return useQuery({
    queryKey: spaceKeys.budgets(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('scope, category_id, limit_minor')
        .eq('space_id', spaceId as string);
      if (error) throw error;
      return (data ?? []).map((r) => ({ scope: r.scope, categoryId: r.category_id, limitMinor: toMinor(r.limit_minor) }));
    },
  });
}

export interface SpaceGoal {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string | null;
  savedMinor: number;
  byMember: { memberId: string | null; amountMinor: number }[];
}

export function useSpaceGoal(spaceId: string | undefined) {
  return useQuery({
    queryKey: spaceKeys.goal(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceGoal | null> => {
      const { data, error } = await supabase
        .from('goals')
        .select('id, name, target_minor, target_date, goal_contributions(member_id, amount_minor)')
        .eq('space_id', spaceId as string)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      const g = data?.[0];
      if (!g) return null;
      const contribs = ((g.goal_contributions ?? []) as { member_id: string | null; amount_minor: number | string }[]).map(
        (c) => ({ memberId: c.member_id, amountMinor: toMinor(c.amount_minor) }),
      );
      return {
        id: g.id,
        name: g.name,
        targetMinor: toMinor(g.target_minor),
        targetDate: g.target_date,
        savedMinor: contribs.reduce((a, c) => a + c.amountMinor, 0),
        byMember: contribs,
      };
    },
  });
}

export interface UpcomingBill {
  id: string;
  name: string;
  cadence: string;
  nextDue: string;
  expectedMinor: number;
}

export function useSpaceRecurring(spaceId: string | undefined) {
  return useQuery({
    queryKey: spaceKeys.recurring(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<UpcomingBill[]> => {
      const { data, error } = await supabase
        .from('recurring_series')
        .select('id, name, cadence, next_due, expected_minor')
        .eq('space_id', spaceId as string)
        .eq('status', 'active')
        .not('next_due', 'is', null)
        .order('next_due', { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        cadence: r.cadence,
        nextDue: r.next_due as string,
        expectedMinor: toMinor(r.expected_minor),
      }));
    },
  });
}

/** My own share (Σ expense_shares) of this month's confirmed expenses in a space. */
export function useMyMonthShare(spaceId: string | undefined, memberId: string | undefined, now: Date = new Date()) {
  const { session } = useAuth();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return useQuery({
    queryKey: spaceKeys.myShare(spaceId, memberId, from.slice(0, 7)),
    enabled: !!session && !!spaceId && !!memberId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('expense_shares')
        .select('owed_minor, expenses!inner(occurred_at, status)')
        .eq('space_id', spaceId as string)
        .eq('member_id', memberId as string)
        .eq('expenses.status', 'confirmed')
        .gte('expenses.occurred_at', from);
      if (error) throw error;
      return (data ?? []).reduce((a, r) => a + toMinor(r.owed_minor), 0);
    },
  });
}

// ---------------------------------------------------------------------------
// Invites

export interface InvitePreview {
  spaceName: string;
  memberName: string;
  invitedBy: string | null;
  expiresAt: string | null;
  usable: boolean;
}

export function usePreviewInvite(code: string | null) {
  return useQuery({
    queryKey: spaceKeys.invitePreview(code ?? undefined),
    enabled: !!code,
    retry: false,
    queryFn: async (): Promise<InvitePreview> => {
      const { data, error } = await supabase.rpc('preview_space_invite', { p_code: code as string });
      if (error) throw error;
      const j = (data ?? {}) as Record<string, unknown>;
      return {
        spaceName: String(j['space_name'] ?? 'a space'),
        memberName: String(j['member_name'] ?? ''),
        invitedBy: j['invited_by'] ? String(j['invited_by']) : null,
        expiresAt: j['expires_at'] ? String(j['expires_at']) : null,
        usable: j['usable'] !== false,
      };
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<{ spaceId: string; memberId: string }> => {
      const { data, error } = await supabase.rpc('accept_space_invite', { p_code: code });
      if (error) throw error;
      const j = (data ?? {}) as Record<string, unknown>;
      return { spaceId: String(j['space_id']), memberId: String(j['member_id']) };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.spaces }),
        qc.invalidateQueries({ queryKey: qk.members }),
        qc.invalidateQueries({ queryKey: qk.balances }),
        qc.invalidateQueries({ queryKey: qk.expenses }),
      ]);
    },
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: async (p: { spaceId: string; memberId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_space_invite', { p_space_id: p.spaceId, p_member_id: p.memberId });
      if (error) throw error;
      return data as string;
    },
  });
}

/** Add a person who is not on the app yet (a placeholder member), so they can be invited. */
export function useAddPlaceholderMember(spaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string): Promise<string> => {
      const name = displayName.trim();
      if (!spaceId) throw new Error('Missing space id.');
      if (!name) throw new Error('Enter a name.');
      const { data, error } = await supabase
        .from('space_members')
        .insert({ space_id: spaceId, display_name: name.slice(0, 80) })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.members }),
        qc.invalidateQueries({ queryKey: qk.balances }),
      ]);
    },
  });
}
