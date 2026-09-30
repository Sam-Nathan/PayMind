import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider.tsx';
import { supabase } from '../lib/supabase.ts';
import { qk } from './keys.ts';
import { mapBalance, mapMember, mapSpace, toMinor } from './mappers.ts';
import { netStatus } from './netBalances.ts';
import { buildCreateSpaceArgs, type SpaceDraft } from './payloads.ts';
import type { BalanceRow, Space, SpaceMember, SpaceMemberRow, SpaceRow, SpaceSummary } from './types.ts';

export function useSpaces() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.spaceList(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Space[]> => {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
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
      const { data, error } = await supabase.from('spaces').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapSpace(data as SpaceRow) : null;
    },
  });
}

/** Active (not left) members of one space. */
export function useSpaceMembers(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.spaceMembers(spaceId),
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceMember[]> => {
      const { data, error } = await supabase
        .from('space_members')
        .select('*')
        .eq('space_id', spaceId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data as SpaceMemberRow[]).map(mapMember);
    },
  });
}

/** Everything the Spaces tab and Home need per space: member count, total, my net + status. */
export function useSpaceSummaries() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: qk.spaceSummaries(uid),
    enabled: !!uid,
    queryFn: async (): Promise<SpaceSummary[]> => {
      const [spaces, members, balances, expenses] = await Promise.all([
        supabase.from('spaces').select('*').order('created_at', { ascending: false }),
        supabase.from('space_members').select('id, space_id, left_at'),
        supabase.from('balances').select('*'),
        supabase.from('expenses').select('space_id, total_minor').eq('status', 'confirmed').not('space_id', 'is', null),
      ]);
      for (const r of [spaces, members, balances, expenses]) if (r.error) throw r.error;

      const memberCount = new Map<string, number>();
      for (const m of (members.data ?? []) as { space_id: string; left_at: string | null }[]) {
        if (m.left_at) continue;
        memberCount.set(m.space_id, (memberCount.get(m.space_id) ?? 0) + 1);
      }
      const totals = new Map<string, number>();
      for (const e of (expenses.data ?? []) as { space_id: string; total_minor: number | string }[]) {
        totals.set(e.space_id, (totals.get(e.space_id) ?? 0) + toMinor(e.total_minor));
      }
      const myNet = new Map<string, number>();
      for (const b of ((balances.data ?? []) as BalanceRow[]).map(mapBalance)) {
        if (b.userId === uid) myNet.set(b.spaceId, b.netMinor);
      }

      return (spaces.data as SpaceRow[]).map(mapSpace).map((space) => {
        const net = myNet.get(space.id) ?? 0;
        return {
          space,
          memberCount: memberCount.get(space.id) ?? 0,
          totalMinor: totals.get(space.id) ?? 0,
          myNetMinor: net,
          status: netStatus(net),
        };
      });
    },
  });
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
