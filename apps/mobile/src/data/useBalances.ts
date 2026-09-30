import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';
import { mapBalance } from './mappers.ts';
import { computeMyNet, type MyNet } from './netBalances.ts';
import type { Balance, BalanceRow } from './types.ts';

const BALANCE_COLUMNS =
  'space_id, member_id, user_id, display_name, left_at, paid_minor, owed_minor, settled_out_minor, settled_in_minor, net_minor';

async function fetchBalances(spaceId?: string): Promise<Balance[]> {
  let q = supabase.from('balances').select(BALANCE_COLUMNS);
  if (spaceId) q = q.eq('space_id', spaceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as BalanceRow[]).map(mapBalance);
}

/**
 * Member rows of every space the user can see. One cached query feeds both Home's net totals and
 * the Spaces list (member counts, space totals), so the view is read once per screen.
 */
export function useAllBalances<T = Balance[]>(select?: (rows: Balance[]) => T) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.allBalances(uid),
    enabled: !!uid,
    queryFn: () => fetchBalances(),
    select,
  });
}

/** Balances for one space (member rows), or every visible space when `spaceId` is omitted. */
export function useBalances(spaceId?: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: spaceId ? qk.spaceBalances(spaceId) : qk.allBalances(uid),
    enabled: !!uid,
    queryFn: () => fetchBalances(spaceId),
  });
}

export const EMPTY_NET: MyNet = {
  owedToYouMinor: 0,
  youOweMinor: 0,
  owedBy: [],
  owes: [],
  perSpace: {},
  spacesOwedCount: 0,
};

/**
 * Owed-to-you / you-owe totals across all spaces plus per-person breakdowns
 * (debts simplified per space with @paymind/core). Derived from the shared all-balances query.
 */
export function useMyNetBalances() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const select = useCallback((rows: Balance[]) => computeMyNet(rows, uid), [uid]);
  return useAllBalances(select);
}
