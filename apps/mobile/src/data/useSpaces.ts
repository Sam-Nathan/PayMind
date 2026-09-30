import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';
import { mapMember, mapSpace } from './mappers.ts';
import { useAllBalances } from './useBalances.ts';
import { netStatus } from './netBalances.ts';
import { buildCreateSpaceArgs, type SpaceDraft } from './payloads.ts';
import type { Balance, Space, SpaceMember, SpaceMemberRow, SpaceRow, SpaceSummary } from './types.ts';

const SPACE_COLUMNS = 'id, type, name, starts_on, ends_on, budget_minor, currency, status, created_by, created_at';
const MEMBER_COLUMNS = 'id, space_id, user_id, display_name, upi_vpa, role, share_weight, left_at';

export function useSpaces() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.spaceList(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Space[]> => {
      const { data, error } = await supabase
        .from('spaces')
        .select(SPACE_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as SpaceRow[]).map(mapSpace);
    },
  });
}

export function useSpace(id: string | undefined) {
  return useQuery({
    queryKey: qk.space(id),
    enabled: !!id,
    queryFn: async (): Promise<Space | null> => {
      if (!id) throw new Error('Missing space id.');
      const { data, error } = await supabase.from('spaces').select(SPACE_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapSpace(data as SpaceRow) : null;
    },
  });
}

/** All member rows of one space, oldest first (callers filter out `leftAt` where needed). */
export function useSpaceMembers(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.spaceMembers(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceMember[]> => {
      if (!spaceId) throw new Error('Missing space id.');
      const { data, error } = await supabase
        .from('space_members')
        .select(MEMBER_COLUMNS)
        .eq('space_id', spaceId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data as SpaceMemberRow[]).map(mapMember);
    },
  });
}

/** Pure: combine spaces with their `balances` rows into list summaries. */
export function buildSpaceSummaries(
  spaces: readonly Space[],
  balances: readonly Balance[],
  uid: string | undefined,
): SpaceSummary[] {
  const memberCount = new Map<string, number>();
  // Σ paid over a space's members = Σ confirmed shared expenses, so no expenses scan is needed.
  const totals = new Map<string, number>();
  const myNet = new Map<string, number>();
  for (const b of balances) {
    if (!b.leftAt) memberCount.set(b.spaceId, (memberCount.get(b.spaceId) ?? 0) + 1);
    totals.set(b.spaceId, (totals.get(b.spaceId) ?? 0) + b.paidMinor);
    if (uid && b.userId === uid) myNet.set(b.spaceId, b.netMinor);
  }
  return spaces.map((space) => {
    const net = myNet.get(space.id) ?? 0;
    return {
      space,
      memberCount: memberCount.get(space.id) ?? 0,
      totalMinor: totals.get(space.id) ?? 0,
      myNetMinor: net,
      status: netStatus(net),
    };
  });
}

/**
 * Everything the Spaces tab and Home need per space: member count, total, my net + status.
 * Built from two cached queries (spaces + all balances) that other screens share, instead of
 * re-reading space_members, balances and every confirmed expense.
 */
export function useSpaceSummaries() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const spaces = useSpaces();
  const balances = useAllBalances();
  const data = useMemo(
    () => (spaces.data && balances.data ? buildSpaceSummaries(spaces.data, balances.data, uid) : undefined),
    [spaces.data, balances.data, uid],
  );
  const { refetch: refetchSpaces } = spaces;
  const { refetch: refetchBalances } = balances;
  const refetch = useCallback(
    () => Promise.all([refetchSpaces(), refetchBalances()]),
    [refetchSpaces, refetchBalances],
  );
  return {
    data,
    isPending: spaces.isPending || balances.isPending,
    isError: spaces.isError || balances.isError,
    error: spaces.error ?? balances.error,
    refetch,
  };
}

export function useCreateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SpaceDraft): Promise<string> => {
      const args = buildCreateSpaceArgs(draft);
      const { data, error } = await supabase.rpc('create_space', args);
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.spaces }),
        qc.invalidateQueries({ queryKey: qk.members }),
        qc.invalidateQueries({ queryKey: qk.balances }),
      ]);
    },
  });
}

/** The current user's member row in a space (for "paid by" defaults). */
export function findMyMember(members: readonly SpaceMember[] | undefined, uid: string | undefined) {
  return members?.find((m) => m.userId === uid && !m.leftAt);
}
