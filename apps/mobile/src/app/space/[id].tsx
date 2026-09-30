import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorNote, HeroHeader, IconButton, Skeleton } from '../../components/index.ts';
import { friendlyError } from '../../data/errors.ts';
import { useSettlements } from '../../data/settle.ts';
import { useBalances } from '../../data/useBalances.ts';
import { useCategories, useExpenses } from '../../data/useExpenses.ts';
import { useSpace, useSpaceMembers } from '../../data/useSpaces.ts';
import { CoupleView } from '../../features/spaces/views/CoupleView.tsx';
import { FamilyView } from '../../features/spaces/views/FamilyView.tsx';
import { GenericView } from '../../features/spaces/views/GenericView.tsx';
import { RoommatesView } from '../../features/spaces/views/RoommatesView.tsx';
import { TripView } from '../../features/spaces/views/TripView.tsx';
import type { SpaceCtx } from '../../features/spaces/views/common.tsx';
import { useAuth } from '../../providers/AuthProvider.tsx';

/** Space detail. The layout switches on `space.type`; everything it needs is loaded once here. */
export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;

  const space = useSpace(id);
  const members = useSpaceMembers(id);
  const balances = useBalances(id);
  const expenses = useExpenses({ spaceId: id, limit: 500 });
  const categories = useCategories();
  const settlements = useSettlements(id);

  const s = space.data;
  const ctx: SpaceCtx | null = useMemo(() => {
    if (!s || !id) return null;
    const all = members.data ?? [];
    const names = new Map(all.map((m) => [m.id, m.userId === uid ? 'You' : m.displayName]));
    return {
      id,
      space: s,
      uid,
      active: all.filter((m) => !m.leftAt),
      allMembers: all,
      balances: balances.data ?? [],
      expenses: expenses.data ?? [],
      categories: categories.data ?? [],
      myMember: all.find((m) => m.userId === uid && !m.leftAt),
      settlements: settlements.data ?? [],
      nameOf: (memberId) => (memberId ? names.get(memberId) : undefined) ?? 'Someone',
    };
  }, [s, id, members.data, balances.data, expenses.data, categories.data, settlements.data, uid]);

  if (space.isError) {
    return (
      <View className="flex-1 bg-paper p-4" style={{ paddingTop: insets.top + 8 }}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View className="mt-4">
          <ErrorNote message={friendlyError(space.error)} onRetry={() => space.refetch()} />
        </View>
      </View>
    );
  }

  if (!ctx || members.isPending || balances.isPending) {
    return (
      <View className="flex-1 bg-paper">
        <HeroHeader tone="ink">
          <View className="h-11 flex-row items-center">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
          </View>
          <View className="mt-4 gap-3">
            <Skeleton height={30} width="60%" />
            <Skeleton height={64} width="70%" />
          </View>
        </HeroHeader>
        {space.isSuccess && !s ? <EmptyState title="Space not found" body="It may have been deleted, or you may have left it." /> : null}
      </View>
    );
  }

  // Couple / roommates / family are personal views: they need my own member row.
  if (ctx.myMember) {
    switch (ctx.space.type) {
      case 'couple':
        return <CoupleView ctx={ctx} />;
      case 'roommates':
        return <RoommatesView ctx={ctx} />;
      case 'family':
        return <FamilyView ctx={ctx} />;
    }
  }
  switch (ctx.space.type) {
    case 'trip':
    case 'event':
      return <TripView ctx={ctx} />;
    default:
      return <GenericView ctx={ctx} />;
  }
}
