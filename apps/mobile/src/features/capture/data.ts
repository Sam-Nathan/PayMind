/** Supabase data hooks for the capture inbox, privacy settings and learned rules. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../providers/AuthProvider.tsx';
import { supabase } from '../../lib/supabase.ts';

// ---------------------------------------------------------------------------
// Types (packages/db types are still a placeholder, so these mirror docs/schema.md)

export interface PrivacySettings {
  capture_notifications: boolean;
  aa_balance: boolean;
  ebills: boolean;
  keep_receipts: boolean;
  ai_enabled: boolean;
  learn_from_corrections: boolean;
  share_payment_method: boolean;
  quiet_hours_enabled: boolean;
  /** 'HH:MM:SS' */
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  capture_notifications: false,
  aa_balance: false,
  ebills: false,
  keep_receipts: false,
  ai_enabled: true,
  learn_from_corrections: true,
  share_payment_method: false,
  quiet_hours_enabled: true,
  quiet_hours_start: '22:00:00',
  quiet_hours_end: '08:00:00',
};

export interface NotificationPrefs {
  budget_alerts: boolean;
  money_nudges: boolean;
  settlement_reminders: boolean;
  unusual_activity: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  budget_alerts: true,
  money_nudges: true,
  settlement_reminders: true,
  unusual_activity: true,
};

export interface LearnedRule {
  id: string;
  kind: 'category' | 'merchant' | 'split';
  match: Record<string, unknown>;
  action: Record<string, unknown>;
  hits: number;
  created_at: string;
}

export interface CapturedTxn {
  id: string;
  source: 'upi_notification' | 'sms' | 'ebill' | 'manual';
  parsed: Record<string, unknown> | null;
  amount_minor: number;
  payee: string | null;
  vpa: string | null;
  occurred_at: string;
  suggested_category_id: string | null;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string | null;
  sort_order: number;
}

export const queryKeys = {
  privacy: ['privacy_settings'] as const,
  notificationPrefs: ['notification_prefs'] as const,
  learnedRules: ['learned_rules'] as const,
  capturedInbox: ['captured_txns', 'inbox'] as const,
  capturedHistory: ['captured_txns', 'history'] as const,
  categories: ['categories'] as const,
};

// ---------------------------------------------------------------------------
// Privacy settings

export function usePrivacySettings() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.privacy, uid],
    enabled: !!uid,
    queryFn: async (): Promise<PrivacySettings> => {
      const { data, error } = await supabase.from('privacy_settings').select('*').maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_PRIVACY, ...(data ?? {}) } as PrivacySettings;
    },
  });
}

/** Optimistic update with rollback (design: "Switches optimistic with rollback on error"). */
export function useUpdatePrivacy() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const key = [...queryKeys.privacy, uid];
  return useMutation({
    mutationFn: async (patch: Partial<PrivacySettings>) => {
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase
        .from('privacy_settings')
        .upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PrivacySettings>(key);
      qc.setQueryData<PrivacySettings>(key, { ...(prev ?? DEFAULT_PRIVACY), ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---------------------------------------------------------------------------
// Notification prefs

export function useNotificationPrefs() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.notificationPrefs, uid],
    enabled: !!uid,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase.from('notification_prefs').select('*').maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_NOTIFICATION_PREFS, ...(data ?? {}) } as NotificationPrefs;
    },
  });
}

export function useUpdateNotificationPrefs() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const key = [...queryKeys.notificationPrefs, uid];
  return useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase
        .from('notification_prefs')
        .upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key);
      qc.setQueryData<NotificationPrefs>(key, { ...(prev ?? DEFAULT_NOTIFICATION_PREFS), ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---------------------------------------------------------------------------
// Learned rules

export function useLearnedRules() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.learnedRules, uid],
    enabled: !!uid,
    queryFn: async (): Promise<LearnedRule[]> => {
      const { data, error } = await supabase
        .from('learned_rules')
        .select('id, kind, match, action, hits, created_at')
        .order('hits', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LearnedRule[];
    },
  });
}

/** Delete one rule (id) or all of the signed-in user's rules (no id). RLS scopes it to the owner. */
export function useDeleteLearnedRules() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Not signed in');
      const q = supabase.from('learned_rules').delete();
      const { error } = await (id ? q.eq('id', id) : q.eq('user_id', uid));
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.learnedRules }),
  });
}

// ---------------------------------------------------------------------------
// Categories (system + own)

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, parent_id, name, slug, sort_order')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

// ---------------------------------------------------------------------------
// Capture inbox

export function useCapturedInbox() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.capturedInbox, uid],
    enabled: !!uid,
    queryFn: async (): Promise<CapturedTxn[]> => {
      const { data, error } = await supabase
        .from('captured_txns')
        .select('id, source, parsed, amount_minor, payee, vpa, occurred_at, suggested_category_id')
        .eq('status', 'inbox')
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CapturedTxn[];
    },
  });
}

export interface HistoryTxn {
  id: string;
  payee: string | null;
  vpa: string | null;
  amount_minor: number;
  occurred_at: string;
}

/** Last ~6 months of captured transactions (any status), used to spot recurring payments. */
export function useCapturedHistory() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: [...queryKeys.capturedHistory, uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HistoryTxn[]> => {
      const since = new Date(Date.now() - 190 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('captured_txns')
        .select('id, payee, vpa, amount_minor, occurred_at')
        .gte('occurred_at', since)
        .neq('status', 'not_mine')
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as HistoryTxn[];
    },
  });
}

export interface ConfirmArgs {
  id: string;
  categoryId?: string | null;
  /** Optional edits applied to the captured row before it becomes an expense. */
  edits?: { payee?: string; amountMinor?: number };
}

export function useConfirmCaptured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, categoryId, edits }: ConfirmArgs): Promise<string> => {
      if (edits && (edits.payee !== undefined || edits.amountMinor !== undefined)) {
        const patch: Record<string, unknown> = {};
        if (edits.payee !== undefined) patch['payee'] = edits.payee;
        if (edits.amountMinor !== undefined) patch['amount_minor'] = edits.amountMinor;
        const { error: updateError } = await supabase.from('captured_txns').update(patch).eq('id', id);
        if (updateError) throw updateError;
      }
      const { data, error } = await supabase.rpc('confirm_captured_txn', {
        p_id: id,
        ...(categoryId ? { p_category_id: categoryId } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['captured_txns'] });
      void qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useDismissCaptured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('captured_txns').update({ status: 'not_mine' }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['captured_txns'] }),
  });
}
