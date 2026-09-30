import type { SpaceType } from '@paymind/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  ChipGroup,
  Chip,
  EmptyState,
  ErrorNote,
  FeaturedSpaceCard,
  Skeleton,
  SPACE_TYPES,
  SPACE_TYPE_ORDER,
  SpaceRow,
  fmtMoney,
} from '../../components/index.ts';
import { dateRange, shortDate } from '../../data/dates.ts';
import { friendlyError } from '../../data/errors.ts';
import { useSpaceSummaries } from '../../data/useSpaces.ts';
import type { SpaceSummary } from '../../data/types.ts';

function subtitleFor(s: SpaceSummary): string {
  const { space, memberCount } = s;
  const info = SPACE_TYPES[space.type];
  const parts: string[] = [];
  if (space.type === 'trip' || space.type === 'event') {
    parts.push(info.label);
    const when = space.type === 'event' ? (space.startsOn ? shortDate(space.startsOn) : null) : dateRange(space.startsOn, space.endsOn);
    if (when) parts.push(when);
    parts.push(`${memberCount} people`);
    if (space.budgetMinor) parts.push(`budget ${fmtMoney(space.budgetMinor)}`);
  } else if (space.type === 'friends' || space.type === 'custom') {
    parts.push(`${memberCount} people`);
  } else {
    parts.push(info.label, `${memberCount} people`);
  }
  return parts.join(' · ');
}

export default function SpacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const summaries = useSpaceSummaries();
  const [type, setType] = useState<SpaceType>('trip');
  const [refreshing, setRefreshing] = useState(false);
  const info = SPACE_TYPES[type];

  const list = summaries.data ?? [];
  const featured = list.find((s) => s.space.status === 'settling');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await summaries.refetch();
            setRefreshing(false);
          }}
        />
      }
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-sans-bold text-[28px] leading-[34px] text-ink">Spaces</Text>
          <Text className="font-sans text-[15px] text-muted">Everyone you share money with</Text>
        </View>
        <Button label="Settle all" variant="dark" size="sm" onPress={() => router.push('/settle')} />
      </View>

      {summaries.isPending ? (
        <>
          <Skeleton height={145} radius={28} />
          <Skeleton height={76} radius={22} />
          <Skeleton height={76} radius={22} />
        </>
      ) : summaries.isError ? (
        <ErrorNote message={friendlyError(summaries.error)} onRetry={() => summaries.refetch()} />
      ) : (
        <>
          {featured ? (
            <FeaturedSpaceCard
              overline={`${SPACE_TYPES[featured.space.type].label}${
                featured.space.startsOn ? ` · ${dateRange(featured.space.startsOn, featured.space.endsOn)}` : ''
              } · settling`}
              title={featured.space.name}
              pill="Settling"
              members={[]}
              totalMinor={featured.totalMinor}
              note={
                featured.status === 'owed'
                  ? `you're owed ${fmtMoney(featured.myNetMinor)}`
                  : featured.status === 'owe'
                    ? `you owe ${fmtMoney(-featured.myNetMinor)}`
                    : 'all square'
              }
              onPress={() => router.push(`/space/${featured.space.id}`)}
            />
          ) : null}

          {list.length === 0 ? (
            <EmptyState
              title="No spaces yet"
              body="Create a space for a trip, your flat or a group of friends, then add expenses to split them."
            />
          ) : (
            list
              .filter((s) => s.space.id !== featured?.space.id)
              .map((s) => (
                <SpaceRow
                  key={s.space.id}
                  type={s.space.type}
                  name={s.space.name}
                  subtitle={subtitleFor(s)}
                  status={s.status}
                  amountMinor={s.myNetMinor}
                  upcoming={s.space.type === 'event' && !!s.space.startsOn && s.space.startsOn > today}
                  onPress={() => router.push(`/space/${s.space.id}`)}
                />
              ))
          )}
        </>
      )}

      <Card tone="sand" radius={28} padding={18}>
        <Text className="font-sans-bold mb-3 text-[19px] text-ink">Start a space</Text>
        <ChipGroup>
          {SPACE_TYPE_ORDER.map((t) => (
            <Chip key={t} label={SPACE_TYPES[t].label} selected={t === type} onPress={() => setType(t)} />
          ))}
        </ChipGroup>
        <View className="my-3 rounded-[18px] bg-white p-3.5">
          <Text className="font-sans-semibold text-[12px] uppercase tracking-[1.3px] text-muted">
            {info.explainerTitle}
          </Text>
          <Text className="font-sans mt-1 text-[15px] leading-[21px] text-ink">{info.explainer}</Text>
        </View>
        <Button
          label={`Create ${info.label.toLowerCase()} space`}
          onPress={() => router.push({ pathname: '/space-new', params: { type } })}
        />
      </Card>
    </ScrollView>
  );
}
