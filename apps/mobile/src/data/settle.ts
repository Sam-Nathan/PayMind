/**
 * Data hooks for settle up, pay, verify and reminders. Keys local to this file live in `settleKeys`;
 * after a mutation the shared keys (balances, expenses) are invalidated too.
 */
import type { SettlementStatus } from '@paymind/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../providers/AuthProvider.tsx';
import {
  buildSettlePlan,
  countIous,
  type ReminderRepeat,
  type ReminderTone,
  type SettlePlan,
} from '../features/settle/logic.ts';
import { qk } from './keys.ts';
import { toMinor } from './mappers.ts';
import type { Balance } from './types.ts';
import { useAllBalances } from './useBalances.ts';
import { useSpaces } from './useSpaces.ts';

export const settleKeys = {
  all: ['settlements'] as const,
  list: (uid: string | undefined) => ['settlements', 'list', uid] as const,
  one: (id: string | undefined) => ['settlements', 'one', id] as const,
  members: ['space-members', 'all'] as const,
  ious: (spaceIds: string) => ['settlements', 'ious', spaceIds] as const,
};

export interface Settlement {
  id: string;
  spaceId: string;
  fromMember: string;
  toMember: string;
  amountMinor: number;
  status: SettlementStatus;
  noteRef: string | null;
  utr: string | null;
  correctedFromMinor: number | null;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
  method: string | null;
  upiApp: string | null;
}

interface SettlementRow {
  id: string | null;
  space_id: string | null;
  from_member: string | null;
  to_member: string | null;
  amount_minor: number | string | null;
  status: SettlementStatus | null;
  note_ref: string | null;
  utr: string | null;
  corrected_from_minor: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  method: string | null;
  upi_app: string | null;
}

const SETTLEMENT_COLUMNS =
  'id, space_id, from_member, to_member, amount_minor, status, note_ref, utr, corrected_from_minor, created_at, updated_at, completed_at, method, upi_app';

function mapSettlement(r: SettlementRow): Settlement | null {
  if (!r.id || !r.space_id || !r.from_member || !r.to_member || !r.status) return null;
  return {
    id: r.id,
    spaceId: r.space_id,
    fromMember: r.from_member,
    toMember: r.to_member,
    amountMinor: toMinor(r.amount_minor),
    status: r.status,
    noteRef: r.note_ref,
    utr: r.utr,
    correctedFromMinor: r.corrected_from_minor === null ? null : toMinor(r.corrected_from_minor),
    createdAt: r.created_at ?? new Date(0).toISOString(),
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    method: r.method,
    upiApp: r.upi_app,
  };
}

/** Settlements visible to me (newest first), with method/app where the privacy model allows. */
export function useSettlements(spaceId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...settleKeys.list(uid), spaceId ?? 'all'] as const,
    enabled: !!uid,
    queryFn: async (): Promise<Settlement[]> => {
      let q = supabase
        .from('settlements_with_method')
        .select(SETTLEMENT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(100);
      if (spaceId) q = q.eq('space_id', spaceId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as SettlementRow[]).map(mapSettlement).filter((s): s is Settlement => s !== null);
    },
  });
}

export function useSettlement(id: string | undefined) {
  return useQuery({
    queryKey: settleKeys.one(id),
    enabled: !!id,
    queryFn: async (): Promise<Settlement | null> => {
      const { data, error } = await supabase
        .from('settlements_with_method')
        .select(SETTLEMENT_COLUMNS)
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSettlement(data as SettlementRow) : null;
    },
  });
}

export interface MemberInfo {
  id: string;
  spaceId: string;
  userId: string | null;
  displayName: string;
  upiVpa: string | null;
  leftAt: string | null;
}

/** Member rows of every space I can see (for names + UPI IDs across spaces). */
export function useAllMembers() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...settleKeys.members, uid] as const,
    enabled: !!uid,
    queryFn: async (): Promise<MemberInfo[]> => {
      const { data, error } = await supabase
        .from('space_members')
        .select('id, space_id, user_id, display_name, upi_vpa, left_at');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        spaceId: r.space_id,
        userId: r.user_id,
        displayName: r.display_name,
        upiVpa: r.upi_vpa,
        leftAt: r.left_at,
      }));
    },
  });
}

/** Unsimplified IOU count per space (every expense share owed to the member who paid). */
function useSpaceIous(spaceIds: readonly string[]) {
  const key = [...spaceIds].sort().join(',');
  return useQuery({
    queryKey: settleKeys.ious(key),
    enabled: spaceIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('space_id, paid_by_member, expense_shares(member_id, owed_minor)')
        .in('space_id', [...spaceIds])
        .eq('status', 'confirmed')
        .limit(1000);
      if (error) throw error;
      const bySpace = new Map<string, { paidBy: string | null; shares: { memberId: string; owedMinor: number }[] }[]>();
      for (const e of data ?? []) {
        if (!e.space_id) continue;
        const list = bySpace.get(e.space_id) ?? [];
        list.push({
          paidBy: e.paid_by_member,
          shares: ((e.expense_shares ?? []) as { member_id: string; owed_minor: number | string }[]).map((s) => ({
            memberId: s.member_id,
            owedMinor: toMinor(s.owed_minor),
          })),
        });
        bySpace.set(e.space_id, list);
      }
      return new Map([...bySpace].map(([k, v]) => [k, countIous(v)]));
    },
  });
}

/** The whole settle-up plan for the signed-in user (optionally one space). */
export function useSettlePlan(spaceId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const balances = useAllBalances();
  const spaces = useSpaces();
  const members = useAllMembers();

  const rows: Balance[] | undefined = balances.data;
  const scoped = useMemo(
    () => (rows ? (spaceId ? rows.filter((b) => b.spaceId === spaceId) : rows) : undefined),
    [rows, spaceId],
  );
  const spaceIds = useMemo(() => [...new Set((scoped ?? []).map((b) => b.spaceId))], [scoped]);
  const ious = useSpaceIous(spaceIds);

  const plan: SettlePlan | undefined = useMemo(() => {
    if (!scoped) return undefined;
    const names = new Map((spaces.data ?? []).map((s) => [s.id, s.name]));
    return buildSettlePlan({
      balances: scoped,
      ...(members.data ? { members: members.data } : {}),
      spaceNames: names,
      ...(ious.data ? { iousBySpace: ious.data } : {}),
      uid,
    });
  }, [scoped, spaces.data, members.data, ious.data, uid]);

  return {
    plan,
    isPending: balances.isPending,
    isError: balances.isError,
    error: balances.error,
    refetch: async () => {
      await Promise.all([balances.refetch(), members.refetch(), spaces.refetch()]);
    },
  };
}

export interface RecordSettlementArgs {
  spaceId: string;
  fromMember: string;
  toMember: string;
  amountMinor: number;
  method: 'upi' | 'cash' | 'bank' | 'other';
  status: 'initiated' | 'confirmed_manual';
  upiApp?: string | null;
  noteRef?: string | null;
  utr?: string | null;
}

export async function recordSettlement(a: RecordSettlementArgs): Promise<string> {
  const { data, error } = await supabase.rpc('record_settlement', {
    p_space_id: a.spaceId,
    p_from_member: a.fromMember,
    p_to_member: a.toMember,
    p_amount_minor: a.amountMinor,
    p_method: a.method,
    p_status: a.status,
    ...(a.upiApp ? { p_upi_app: a.upiApp } : {}),
    ...(a.noteRef ? { p_note_ref: a.noteRef } : {}),
    ...(a.utr ? { p_utr: a.utr } : {}),
  });
  if (error) throw error;
  return data as string;
}

export async function updateSettlementStatus(p: {
  id: string;
  status: SettlementStatus;
  utr?: string | null;
  amountMinor?: number;
}): Promise<void> {
  const { error } = await supabase.rpc('update_settlement_status', {
    p_id: p.id,
    p_status: p.status,
    ...(p.utr ? { p_utr: p.utr } : {}),
    ...(p.amountMinor !== undefined ? { p_amount_minor: p.amountMinor } : {}),
  });
  if (error) throw error;
}

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: settleKeys.all }),
      qc.invalidateQueries({ queryKey: qk.balances }),
      qc.invalidateQueries({ queryKey: qk.expenses }),
    ]);
  };
}

/** "Paid in cash" / "Paid another way": one confirmed_manual settlement per space the person is owed in. */
export function useRecordManualSettlements() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (p: {
      items: readonly { spaceId: string; fromMember: string; toMember: string; amountMinor: number }[];
      method: 'cash' | 'bank' | 'other';
      noteRef?: string | null;
    }): Promise<string[]> => {
      const ids: string[] = [];
      for (const it of p.items) {
        ids.push(
          await recordSettlement({
            spaceId: it.spaceId,
            fromMember: it.fromMember,
            toMember: it.toMember,
            amountMinor: it.amountMinor,
            method: p.method,
            status: 'confirmed_manual',
            noteRef: p.noteRef ?? null,
          }),
        );
      }
      return ids;
    },
    onSettled: invalidate,
  });
}

/** Apply one status to several settlements (a combined UPI payment spans one row per space). */
export function useUpdateSettlementStatuses() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (p: { ids: readonly string[]; status: SettlementStatus; utr?: string | null }) => {
      for (const id of p.ids) {
        await updateSettlementStatus({ id, status: p.status, utr: p.utr ?? null });
      }
    },
    onSettled: invalidate,
  });
}

export interface SendReminderArgs {
  memberIds: string[];
  tone: ReminderTone;
  repeat: ReminderRepeat;
  items: { memberId: string; amountMinor: number }[];
}

export interface SendReminderResult {
  reminderId: string;
  message: string;
  url: string;
  token: string;
  amountMinor: number;
  pushed: number;
}

export function useSendReminder() {
  return useMutation({
    mutationFn: async (a: SendReminderArgs): Promise<SendReminderResult> => {
      const { data, error } = await supabase.functions.invoke('send-reminder', { body: a });
      if (error) {
        // FunctionsHttpError carries the response; its JSON body has { error, message }.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = (await ctx.json()) as { error?: string; message?: string };
            if (body.error === 'nothing_owed') throw new Error('They do not owe you anything right now.');
            if (body.error === 'cannot_remind_self') throw new Error("You can't send a reminder to yourself.");
            if (body.message) throw new Error(body.message);
          } catch (e) {
            if (e instanceof Error && e.name !== 'SyntaxError') throw e;
          }
        }
        throw error;
      }
      return data as SendReminderResult;
    },
  });
}
