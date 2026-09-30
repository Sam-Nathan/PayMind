import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorNote,
  IconButton,
  Skeleton,
  fmtMoney,
  palette,
} from '../components/index.ts';
import { shortDate, toIsoDate } from '../data/dates.ts';
import { friendlyError } from '../data/errors.ts';
import { useSpaces } from '../data/useSpaces.ts';
import { enabledFilters, parseSearchQuery, periodText } from '../features/ai/searchQuery.ts';
import { useExpenseSearch, usePeopleNames, useRecentSearches, type SearchRow } from '../features/ai/useSearch.ts';
import { HideNativeHeader } from '../features/ai/ui/chrome.tsx';

const EXAMPLES = ['Uber this year', 'Involving Rahul', 'Above ₹5,000', 'Family groceries · Aug'];

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spaces = useSpaces();
  const people = usePeopleNames();
  const recents = useRecentSearches();

  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  // Debounce typing; Enter / chips apply immediately.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const parsed = useMemo(
    () => parseSearchQuery(query, { now: new Date(), people: people.data ?? [], spaces: spaces.data ?? [] }),
    [query, people.data, spaces.data],
  );
  // New query text means a fresh set of parsed filters.
  useEffect(() => setDisabled(new Set()), [query]);

  const active = useMemo(() => enabledFilters(parsed, disabled), [parsed, disabled]);
  const hasQuery = parsed.term.length > 0 || parsed.filters.length > 0;
  const search = useExpenseSearch(parsed.term, active, hasQuery);
  const { rows, summary } = search;

  useEffect(() => {
    if (hasQuery && summary.isSuccess && summary.data.count > 0) recents.remember(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.isSuccess, summary.data?.count, query]);

  const spaceName = (id: string | null) => (id ? (spaces.data?.find((s) => s.id === id)?.name ?? 'Shared') : 'Personal');
  const apply = (q: string) => {
    setText(q);
    setQuery(q.trim());
  };

  const period = periodText(active);
  const heroLabel = `${parsed.term ? parsed.term : 'All spending'}${period ? ` · ${period}` : ''}`;
  const s = summary.data;

  const shareSummary = async () => {
    if (!s) return;
    const lines = [
      `PayMind · ${heroLabel}`,
      `Your share ${fmtMoney(s.totalMinor, 0)} across ${s.count}${s.capped ? '+' : ''} expense${s.count === 1 ? '' : 's'}, about ${fmtMoney(s.averageMinor, 0)} each.`,
      ...search.flat.slice(0, 10).map((r) => `${shortDate(toIsoDate(new Date(r.occurredAt)))} · ${r.title} · ${fmtMoney(r.myMinor, 2)}${r.spaceId ? ` (your share of ${fmtMoney(r.totalMinor, 2)})` : ''}`),
    ];
    await Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const header = (
    <View className="gap-4 pb-2">
      <View className="flex-row items-center gap-3">
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View className="h-[52px] flex-1 flex-row items-center rounded-[20px] border-2 border-ink bg-white px-4">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setQuery(text.trim())}
            placeholder="How much did I spend on Uber this year"
            placeholderTextColor={palette.stone}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search your money"
            className="font-sans flex-1 text-[17px] text-ink"
          />
          {text.length > 0 ? (
            <Pressable onPress={() => apply('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={palette.stone} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!hasQuery ? (
        <View className="gap-4">
          {recents.recent.length > 0 ? (
            <View className="gap-2">
              <Text className="font-sans-semibold text-[13px] uppercase tracking-[1.3px] text-muted">Recent searches</Text>
              <ChipGroup>
                {recents.recent.map((r) => (
                  <Chip key={r} label={r} neutral onPress={() => apply(r)} />
                ))}
              </ChipGroup>
            </View>
          ) : null}
          <View className="gap-2">
            <Text className="font-sans-semibold text-[13px] uppercase tracking-[1.3px] text-muted">Try</Text>
            <ChipGroup>
              {EXAMPLES.map((e) => (
                <Chip key={e} label={e} onPress={() => apply(e)} />
              ))}
            </ChipGroup>
          </View>
        </View>
      ) : (
        <>
          {parsed.filters.length > 0 ? (
            <ChipGroup>
              {parsed.filters.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  selected={!disabled.has(f.key)}
                  onPress={() =>
                    setDisabled((d) => {
                      const next = new Set(d);
                      if (next.has(f.key)) next.delete(f.key);
                      else next.add(f.key);
                      return next;
                    })
                  }
                />
              ))}
            </ChipGroup>
          ) : null}

          {search.noSuchPerson ? (
            <EmptyState title="Nothing matches" body="We couldn't find that person in your spaces. Try a different name." />
          ) : summary.isError ? (
            <ErrorNote message={friendlyError(summary.error)} onRetry={() => summary.refetch()} />
          ) : !s ? (
            <Skeleton height={150} radius={28} />
          ) : (
            <Card tone="oxblood" radius={28} padding={18} texture>
              <Text className="font-sans-semibold text-[14px] uppercase tracking-[1.3px] text-peach" numberOfLines={1}>
                {heroLabel}
              </Text>
              <View className="mt-2 items-start">
                <AmountText paise={s.totalMinor} variant="hero" tone="onDark" size={60} />
              </View>
              <Text className="font-sans mt-1 text-[13px] text-paper/70">Your share · shared bills count only your part</Text>
              <Text className="font-sans mt-2 text-[15px] leading-[21px] text-paper/85">
                {s.count === 0
                  ? 'Nothing matches. Try a wider date range.'
                  : `${s.count}${s.capped ? '+' : ''} match${s.count === 1 ? '' : 'es'}, about ${fmtMoney(s.averageMinor, 0)} each.`}
              </Text>
            </Card>
          )}

          {search.merchants && search.merchants.aliases.length > 0 && search.merchants.names.length > 0 ? (
            <Card tone="white" radius={24} padding={16}>
              <Text className="font-sans-bold text-[16px] text-ink">{`Grouped as one merchant: ${search.merchants.names[0]}`}</Text>
              <View className="mt-3">
                <ChipGroup>
                  {search.merchants.aliases.slice(0, 8).map((a) => (
                    <Chip key={`${a.merchantId}-${a.text}`} label={a.text} mono />
                  ))}
                </ChipGroup>
              </View>
              <Text className="font-sans mt-3 text-[14px] leading-5 text-muted">
                Payments under these labels are counted together.
              </Text>
            </Card>
          ) : null}

          {s && s.count > 0 ? (
            <View className="mt-2 flex-row items-baseline justify-between">
              <Text className="font-sans-bold text-[18px] text-ink">Matches</Text>
              <Text className="font-sans text-[14px] text-muted">{`${s.count}${s.capped ? '+' : ''} expense${s.count === 1 ? '' : 's'}`}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const footer = (
    <View className="gap-3 pt-3">
      {rows.isFetchingNextPage ? <ActivityIndicator color={palette.oxblood} /> : null}
      {hasQuery && s && s.count > 0 ? (
        <View className="flex-row gap-2">
          <View style={{ flex: 1.6 }}>
            <Button label="Make a report from this" variant="dark" onPress={shareSummary} />
          </View>
          <View className="flex-1">
            <Button
              label="Ask a follow-up"
              variant="outline"
              onPress={() => router.push({ pathname: '/ask', params: { q: query } })}
            />
          </View>
        </View>
      ) : hasQuery && !summary.isPending ? (
        <Button label="Ask a follow-up" variant="outline" onPress={() => router.push({ pathname: '/ask', params: { q: query } })} />
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-paper">
      <HideNativeHeader />
      <FlatList<SearchRow>
        data={hasQuery && !search.noSuchPerson ? search.flat : []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (rows.hasNextPage && !rows.isFetchingNextPage) void rows.fetchNextPage();
        }}
        ListEmptyComponent={
          hasQuery && rows.isPending && !search.noSuchPerson ? (
            <View className="gap-2">
              <Skeleton height={64} radius={20} />
              <Skeleton height={64} radius={20} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              item.spaceId
                ? router.push({ pathname: '/space/[id]', params: { id: item.spaceId } })
                : router.push('/timeline')
            }
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${fmtMoney(item.myMinor, 0)}. Open ${item.spaceId ? spaceName(item.spaceId) : 'timeline'}`}
            className={`min-h-[72px] flex-row items-center justify-between bg-white px-4 py-3 active:opacity-80 ${index === 0 ? 'rounded-t-[24px] border-t' : ''} border-x border-b border-hairline ${
              index === search.flat.length - 1 ? 'rounded-b-[24px]' : ''
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="font-sans-semibold text-[17px] text-ink" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="font-sans mt-0.5 text-[14px] text-muted" numberOfLines={1}>
                {`${shortDate(toIsoDate(new Date(item.occurredAt)))} · ${spaceName(item.spaceId)}`}
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-sans-bold text-[17px] text-ink">{fmtMoney(item.myMinor, 0)}</Text>
              {item.spaceId ? (
                <Text className="font-sans text-[12px] text-muted">{`of ${fmtMoney(item.totalMinor, 0)}`}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
