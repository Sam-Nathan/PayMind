import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { AmountText, Card, Chip, ChipGroup, EmptyState, ErrorNote, IconButton, Skeleton, palette } from '../components/index.ts';
import { friendlyError } from '../data/errors.ts';
import { useTimeline } from '../data/money.ts';
import { TIMELINE_FILTERS, groupByDay, type DayGroup, type TimelineFilter } from '../features/money/logic.ts';
import { TypeBadge } from '../features/money/ui.tsx';

export default function TimelineScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const q = useTimeline(filter);
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => groupByDay(q.items, now), [q.items, now]);
  const [refreshing, setRefreshing] = useState(false);

  const header = (
    <View className="mb-3">
      <ChipGroup>
        {TIMELINE_FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </ChipGroup>
      {q.error ? (
        <View className="mt-3">
          <ErrorNote message={friendlyError(q.error)} onRetry={() => q.refetch()} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-paper">
      <Stack.Screen
        options={{ headerRight: () => <IconButton icon="search" tone="light" label="Search" onPress={() => router.push('/search')} /> }}
      />
      <FlatList<DayGroup>
        data={groups}
        keyExtractor={(g) => g.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await q.refetch();
              setRefreshing(false);
            }}
          />
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        renderItem={({ item: g }) => (
          <View className="mb-4">
            <Text className="font-sans-semibold mb-2 border-b border-hairline pb-1.5 text-[13px] tracking-[1.3px] text-muted">{g.label}</Text>
            <Card radius={24} padding={0}>
              {g.items.map((it, i) => (
                <Pressable
                  key={it.key}
                  onPress={() => router.push(it.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.badge} ${it.title}`}
                  className={`flex-row items-center gap-3 p-3.5 active:opacity-80 ${i > 0 ? 'border-t border-hairline' : ''}`}
                >
                  <TypeBadge type={it.badge} />
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-[17px] text-ink" numberOfLines={2}>{it.title}</Text>
                    <Text className="font-sans mt-0.5 text-[14px] text-muted" numberOfLines={2}>{it.subtitle}</Text>
                  </View>
                  {it.amountMinor !== null ? (
                    <AmountText paise={it.amountMinor} variant="row" />
                  ) : null}
                </Pressable>
              ))}
            </Card>
          </View>
        )}
        ListEmptyComponent={
          q.isPending ? (
            <View className="gap-3">
              <Skeleton height={90} radius={24} />
              <Skeleton height={90} radius={24} />
              <Skeleton height={90} radius={24} />
            </View>
          ) : q.error ? null : (
            <Card tone="sand" radius={28} padding={18}>
              <EmptyState
                title={filter === 'all' ? 'Your money story starts here' : 'Nothing here yet'}
                body={filter === 'all' ? 'Add a bill or connect alerts.' : 'Try another filter.'}
                actionLabel={filter === 'all' ? 'Add a bill' : undefined}
                onAction={filter === 'all' ? () => router.push('/add-bill') : undefined}
              />
            </Card>
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={palette.oxblood} style={{ marginVertical: 16 }} /> : null}
      />
    </View>
  );
}
