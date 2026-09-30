import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';
import { mapBalance } from './mappers.ts';
import { computeMyNet, type MyNet } from './netBalances.ts';
import type { Balance, BalanceRow } from './types.ts';

/** Balances for one space (member rows), or every visible space when `spaceId` is omitted. */
export function useBalances(spaceId?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.balancesFor(spaceId),
    enabled: !!session,
    queryFn: async (): Promise<Balance[]> => {
      let q = supabase.from('balances').select('*');
      if (spaceId) q = q.eq('space_id', spaceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as BalanceRow[]).map(mapBalance);
    },
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
 * (debts simplified per space with @paymind/core).
 */
export function useMyNetBalances() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.myNet(uid),
    enabled: !!uid,
    queryFn: async (): Promise<MyNet> => {
      const { data, error } = await supabase.from('balances').select('*');
      if (error) throw error;
      return computeMyNet((data as BalanceRow[]).map(mapBalance), uid);
    },
  });
}
