import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  HeroHeader,
  IconButton,
  ListCard,
  ListRow,
  MemberAvatar,
  ProgressBar,
  SectionHeader,
  Skeleton,
  SPACE_TYPES,
  fmtMoney,
  palette,
} from '../../components/index.ts';
import { dateRange, relativeDay } from '../../data/dates.ts';
import { friendlyError } from '../../data/errors.ts';
import { useBalances } from '../../data/useBalances.ts';
import { useExpenses } from '../../data/useExpenses.ts';
import { useSpace, useSpaceMembers } from '../../data/useSpaces.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;

  const space = useSpace(id);
  const members = useSpaceMembers(id);
  const balances = useBalances(id);
  const expenses = useExpenses({ spaceId: id, limit: 50 });

  const s = space.data;
  const active = (members.data ?? []).filter((m) => !m.leftAt);
  const rows = balances.data ?? [];
  // Σ paid across members = every confirmed expense in the space. (The expenses list below is
  // capped at 50 rows, so summing it under-counted busy spaces.)
  const total = rows.reduce((a, b) => a + b.paidMinor, 0);
  const budget = s?.budgetMinor ?? null;
  const perPerson = active.length > 0 ? Math.round(total / active.length) : 0;
  const maxPaid = Math.max(1, ...rows.map((b) => b.paidMinor));
  const fairShare = rows.length > 0 ? total / rows.length : 0;
  const names = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.displayName])), [members.data]);
  const memberName = (memberId: string | null) => (memberId ? names.get(memberId) : undefined) ?? 'Someone';

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

  const info = s ? SPACE_TYPES[s.type] : null;
  const meta = s
    ? [info?.label, dateRange(s.startsOn, s.endsOn), `${active.length} people`].filter(Boolean).join(' · ')
    : '';

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <HeroHeader tone="ink">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans flex-1 px-2 text-center text-[14px] text-steel" numberOfLines={1}>
              {meta}
            </Text>
            <View className="w-11" />
          </View>
          {s ? (
            <>
              <Text className="font-sans-bold mt-4 text-[26px] text-paper" numberOfLines={2}>
                {s.name}
              </Text>
              <View className="mt-2 items-start">
                <AmountText paise={total} variant="hero" tone="onDark" size={64} />
              </View>
              {budget ? (
                <View className="mt-4">
                  <ProgressBar value={total / budget} trackTone="inkSoft" fill={total > budget ? palette.signal : palette.clay} />
                  <View className="mt-2 flex-row justify-between">
                    <Text className="font-sans text-[14px] text-paper/80">
                      {Math.round((total / budget) * 100)}% of {fmtMoney(budget)} budget
                    </Text>
                    <Text className="font-sans text-[14px] text-paper/80">{fmtMoney(perPerson)} per person</Text>
                  </View>
                </View>
              ) : (
                <Text className="font-sans mt-2 text-[14px] text-paper/80">
                  {fmtMoney(perPerson)} per person · no budget set
                </Text>
              )}
            </>
          ) : (
            <View className="mt-4 gap-3">
              <Skeleton height={30} width="60%" />
              <Skeleton height={64} width="70%" />
            </View>
          )}
        </HeroHeader>

        <View className="gap-3 px-4 pt-4">
          <View className="flex-row gap-2">
            <Button
              label="Settle"
              size="lg"
              full
              onPress={() => router.push({ pathname: '/settle', params: { spaceId: id } })}
            />
            <Button
              label="+ Add expense"
              variant="outline"
              size="lg"
              full
              onPress={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
            />
          </View>

          <SectionHeader title="Who paid what" meta={rows.length ? 'line = fair share' : undefined} />
          {balances.isPending ? (
            <Skeleton height={180} radius={28} />
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState title="No members yet" />
            </Card>
          ) : (
            <Card radius={28} padding={16}>
              <View className="gap-4">
                {rows.map((b) => {
                  const isYou = b.userId === uid;
                  return (
                    <View key={b.memberId} className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <MemberAvatar id={b.memberId} name={b.displayName} isYou={isYou} size={32} />
                          <Text className="font-sans-semibold text-[16px] text-ink">{isYou ? 'You' : b.displayName}</Text>
                        </View>
                        <Text className="font-sans-semibold text-[14px] text-ink">
                          {fmtMoney(b.paidMinor)} paid ·{' '}
                          <Text className={b.netMinor < 0 ? 'text-signal' : 'text-slate'}>
                            {b.netMinor === 0 ? 'square' : fmtMoney(b.netMinor, 0, true)}
                          </Text>
                        </Text>
                      </View>
                      <ProgressBar
                        value={b.paidMinor / maxPaid}
                        tick={fairShare / maxPaid}
                        fill={isYou ? palette.signal : palette.slate}
                      />
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          <SectionHeader title="Expenses" />
          {expenses.isPending ? (
            <Skeleton height={140} radius={24} />
          ) : expenses.data && expenses.data.length > 0 ? (
            <ListCard>
              {expenses.data.map((e) => (
                <ListRow
                  key={e.id}
                  title={e.title}
                  subtitle={`${relativeDay(e.occurredAt)} · paid by ${memberName(e.paidByMember)}`}
                  right={<AmountText paise={e.totalMinor} variant="row" />}
                />
              ))}
            </ListCard>
          ) : (
            <Card>
              <EmptyState
                title="Add your first expense"
                body="Everything you add here is split between the people in this space."
                actionLabel="+ Add expense"
                onAction={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
              />
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
