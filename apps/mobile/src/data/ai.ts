/**
 * AI data layer: Edge Function calls (ai-parse-bill / ai-parse-expense / ai-assistant, contracts
 * in supabase/functions/README.md), ai_proposals reads/updates, and the shared bill draft cache.
 * Query keys live here, not in keys.ts.
 */
import {
  BillFlagSchema,
  BillParseResultSchema,
  type BillFlag,
  type BillParseResult,
  type ExpenseParseResult,
} from '@paymind/core';
import type { Json } from '@paymind/db';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  draftFromBill,
  emptyDraft,
  type BillDraft,
  type ProposalPayload,
} from '../features/ai/draft.ts';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from '../providers/AuthProvider.tsx';
import { qk } from './keys.ts';
import type { BillExpensePayload } from '../features/ai/billPayload.ts';

// ---------------------------------------------------------------------------
// Keys

export const aiKeys = {
  proposal: (id: string | undefined) => ['ai', 'proposal', id] as const,
  draft: (id: string | undefined) => ['ai', 'bill-draft', id] as const,
  lastSplit: (uid: string | undefined) => ['ai', 'last-split', uid] as const,
};

// ---------------------------------------------------------------------------
// Edge Function calls

export class AiError extends Error {
  override name = 'AiError';
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export type AiFunction = 'ai-parse-bill' | 'ai-parse-expense' | 'ai-assistant' | 'send-reminder';

export interface SendReminderResponse {
  reminderId: string;
  message: string;
  url: string;
  amountMinor: number;
}

/** Confirm an assistant `reminder` proposal: the function creates the reminder row and pushes. */
export function sendReminder(body: { memberIds: string[]; tone: string; repeat: string }): Promise<SendReminderResponse> {
  return invokeAi<SendReminderResponse>('send-reminder', body);
}

/** Invoke an AI function; failures become an AiError carrying the function's error code. */
export async function invokeAi<T>(name: AiFunction, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let code = 'ai_unavailable';
      let message = error.message;
      try {
        const json = (await res.json()) as { error?: { code?: string; message?: string } };
        if (json.error?.code) code = json.error.code;
        if (json.error?.message) message = json.error.message;
      } catch {
        // keep defaults
      }
      throw new AiError(code, message, res.status);
    }
    throw new AiError('network', error.message);
  }
  return data as T;
}

/** Plain-language copy for an AI failure. `ai_disabled` also gets a Privacy link in the UI. */
export function aiErrorCopy(err: unknown): string {
  const code = err instanceof AiError ? err.code : null;
  switch (code) {
    case 'ai_disabled':
      return 'AI is switched off in your Privacy settings, so PayMind can\'t read this. You can turn it back on any time.';
    case 'rate_limited':
      return "You've reached the hourly limit for this. Please try again in a little while.";
    case 'payload_too_large':
      return 'That file is too large. Try a smaller or cropped photo.';
    case 'invalid_request':
      return "That didn't look like something PayMind can read. Try again.";
    case 'not_authenticated':
      return 'Please sign in again to continue.';
    case 'network':
      return "Can't reach PayMind. Check your connection and try again.";
    case 'ai_unavailable':
    case 'ai_bad_output':
      return 'PayMind could not make sense of that just now. Please try again.';
    default:
      return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
  }
}

export const isAiDisabled = (err: unknown): boolean => err instanceof AiError && err.code === 'ai_disabled';

export interface ParseBillResponse {
  proposalId: string;
  bill: BillParseResult;
  flags: BillFlag[];
  receiptPath: string | null;
}

export type ParseBillInput = { imageBase64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' } | { text: string };

export function useParseBill() {
  return useMutation({
    mutationFn: (input: ParseBillInput) => invokeAi<ParseBillResponse>('ai-parse-bill', input),
  });
}

export interface ExpenseResolutionPerson {
  spoken: string;
  memberId: string | null;
  displayName: string | null;
  spaceId: string | null;
  ambiguous: boolean;
  candidates: { memberId: string; displayName: string; spaceId: string; spaceName: string }[];
}

export interface ExpenseResolution {
  spaceId: string | null;
  spaceName: string | null;
  meMemberId: string | null;
  people: ExpenseResolutionPerson[];
}

export interface ParseExpenseResponse {
  proposalId: string;
  expense: ExpenseParseResult;
  resolution: ExpenseResolution;
}

export interface ParseExpenseInput {
  text: string;
  locale: 'en-IN' | 'hi-IN' | 'kn-IN';
  source: 'text' | 'voice';
  /** client's local date, YYYY-MM-DD */
  today: string;
}

export function useParseExpense() {
  return useMutation({
    mutationFn: (input: ParseExpenseInput) => invokeAi<ParseExpenseResponse>('ai-parse-expense', { ...input }),
  });
}

export interface AssistantProposal {
  id: string;
  kind: string;
  payload: unknown;
}

export interface AssistantResponse {
  reply: string;
  proposals: AssistantProposal[];
  toolsUsed: string[];
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The function takes 1 to 20 messages and the last must be the user's. */
export function trimConversation(messages: readonly AssistantMessage[]): AssistantMessage[] {
  // The function also rejects any message over 2000 characters (a long reply would break the chat).
  const recent = messages.slice(-20).map((m) => (m.content.length > 2000 ? { ...m, content: m.content.slice(0, 2000) } : m));
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser <= 0 ? [...recent] : recent.slice(firstUser);
}

export function useAssistant() {
  return useMutation({
    mutationFn: (messages: AssistantMessage[]) =>
      invokeAi<AssistantResponse>('ai-assistant', { messages: trimConversation(messages) }),
  });
}

// ---------------------------------------------------------------------------
// ai_proposals

export type ProposalStatus = 'pending' | 'accepted' | 'edited' | 'rejected';

export interface ProposalRow {
  id: string;
  kind: string;
  payload: unknown;
  status: ProposalStatus;
  spaceId: string | null;
}

export async function fetchProposal(id: string): Promise<ProposalRow | null> {
  const { data, error } = await supabase
    .from('ai_proposals')
    .select('id, kind, payload, status, space_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, kind: data.kind, payload: data.payload, status: data.status, spaceId: data.space_id };
}

export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: aiKeys.proposal(id),
    enabled: !!id,
    queryFn: () => fetchProposal(id as string),
  });
}

export async function markProposal(id: string, status: Exclude<ProposalStatus, 'pending'>, resultRef?: string | null) {
  const { error } = await supabase
    .from('ai_proposals')
    .update({ status, decided_at: new Date().toISOString(), ...(resultRef ? { result_ref: resultRef } : {}) })
    .eq('id', id);
  if (error) throw error;
}

export function useMarkProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: Exclude<ProposalStatus, 'pending'>; resultRef?: string | null }) =>
      markProposal(v.id, v.status, v.resultRef),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: aiKeys.proposal(v.id) }),
  });
}

// ---------------------------------------------------------------------------
// Bill draft (shared by understand/[id] and split/[id] through the query cache)

export interface BillDraftEntry {
  draft: BillDraft;
  /** false when the stored proposal could not be read: the draft is blank (enter manually) */
  parsed: boolean;
  status: ProposalStatus;
}

/** Turn an ai_proposals row of kind bill_parse into a draft, or a blank one if it can't be read. */
export function entryFromProposal(row: ProposalRow): BillDraftEntry {
  const payload = (row.payload ?? {}) as ProposalPayload;
  if (row.kind === 'bill_parse') {
    const bill = BillParseResultSchema.safeParse(payload.bill);
    if (bill.success) {
      const flags = BillFlagSchema.array().safeParse(payload.flags);
      return {
        parsed: true,
        status: row.status,
        draft: draftFromBill(bill.data, flags.success ? flags.data : [], {
          proposalId: row.id,
          source: payload.source === 'ebill' ? 'ebill' : 'scan',
          receiptPath: payload.receiptPath ?? null,
        }),
      };
    }
  }
  return { parsed: false, status: row.status, draft: emptyDraft(row.id) };
}

export function useBillDraft(proposalId: string | undefined) {
  const qc = useQueryClient();
  const key = aiKeys.draft(proposalId);
  const query = useQuery({
    queryKey: key,
    enabled: !!proposalId,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    queryFn: async (): Promise<BillDraftEntry> => {
      const row = await fetchProposal(proposalId as string);
      if (!row) return { parsed: false, status: 'pending', draft: emptyDraft(proposalId ?? null) };
      return entryFromProposal(row);
    },
  });
  const update = useCallback(
    (fn: (d: BillDraft) => BillDraft) => {
      qc.setQueryData<BillDraftEntry>(key, (old) => (old ? { ...old, draft: fn(old.draft) } : old));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, proposalId],
  );
  return { ...query, entry: query.data, draft: query.data?.draft, update };
}

// ---------------------------------------------------------------------------
// Saving

/** create_expense with a full payload (items, item shares); the RPC also closes the proposal. */
export function useSaveBillExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BillExpensePayload): Promise<string> => {
      const { data, error } = await supabase.rpc('create_expense', { p: payload as unknown as Json });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (_id, payload) => {
      // The draft cache never goes stale on its own: mark it decided so a second Save (back
      // navigation, double tap) can't create the same expense twice.
      if (payload.proposal_id) {
        qc.setQueryData<BillDraftEntry>(aiKeys.draft(payload.proposal_id), (old) =>
          old ? { ...old, status: payload.proposal_status ?? 'accepted' } : old,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.expenses }),
        qc.invalidateQueries({ queryKey: qk.balances }),
        payload.proposal_id ? qc.invalidateQueries({ queryKey: aiKeys.proposal(payload.proposal_id) }) : Promise.resolve(),
      ]);
    },
  });
}

/** Undo for assistant confirmations: voids the expense that was just created. */
export async function voidExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from('expenses').update({ status: 'void' }).eq('id', expenseId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// "Last time you split here with ..."

export interface LastSplit {
  spaceId: string;
  memberIds: string[];
}

/** The most recent shared expense I created, with who shared it: default space and people. */
export function useLastSplit() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: aiKeys.lastSplit(uid),
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<LastSplit | null> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('space_id, expense_shares(member_id)')
        .eq('owner_id', uid as string)
        .eq('status', 'confirmed')
        .not('space_id', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data as { space_id: string | null; expense_shares: { member_id: string }[] | null }[] | null)?.[0];
      if (!row?.space_id) return null;
      return { spaceId: row.space_id, memberIds: (row.expense_shares ?? []).map((s) => s.member_id) };
    },
  });
}
