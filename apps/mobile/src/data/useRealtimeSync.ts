import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';

/**
 * expense_shares is deliberately not subscribed: create_expense / update_expense always write the
 * parent expenses row too, and one expense has one share row per member, so listening to shares
 * multiplied the events (and Realtime's per-subscriber RLS checks) for no new information.
 */
const MONEY_TABLES = ['expenses', 'settlements'] as const;

/**
 * One Realtime channel for the signed-in user. RLS decides which rows each subscriber receives, so
 * only changes in the user's own spaces arrive. Bursts are coalesced into one invalidation.
 * Mount once (see AppProviders).
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    let money: ReturnType<typeof setTimeout> | undefined;
    let inbox: ReturnType<typeof setTimeout> | undefined;

    const onMoneyChange = () => {
      clearTimeout(money);
      money = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: qk.expenses });
        void qc.invalidateQueries({ queryKey: qk.balances });
      }, 250);
    };
    const onInboxChange = () => {
      clearTimeout(inbox);
      inbox = setTimeout(() => void qc.invalidateQueries({ queryKey: qk.inbox }), 250);
    };

    let channel = supabase.channel(`paymind-sync-${uid}`);
    for (const table of MONEY_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onMoneyChange);
    }
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'captured_txns' },
      onInboxChange,
    );
    channel.subscribe();

    return () => {
      clearTimeout(money);
      clearTimeout(inbox);
      void supabase.removeChannel(channel);
    };
  }, [qc, uid]);
}
