import { perDayDisplayRupees, safeToSpend } from '@paymind/core';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  AmountText,
  Button,
  Card,
  DateBadge,
  ErrorNote,
  HeroHeader,
  IconButton,
  InboxRow,
  InsightCard,
  ListCard,
  ListRow,
  ProgressBar,
  QuickActionBar,
  SectionHeader,
  Sheet,
  Skeleton,
  SpaceCard,
  StatCard,
  TextField,
  fmtMoney,
} from '../../components/index.ts';
import { dayAndMonth, daysLeftInMonth, monthEndIso, monthShort } from '../../data/dates.ts';
import { friendlyError } from '../../data/errors.ts';
import { useMyNetBalances } from '../../data/useBalances.ts';
import { useMonthSpend, useMonthlyBudget } from '../../data/useExpenses.ts';
import {
  DEFAULT_BUFFER_MINOR,
  useActiveGoal,
  useInboxCount,
  useLatestInsight,
  useManualBalance,
  useRecurringDueBefore,
  useSetManualBalance,
  useUpcomingRecurring,
} from '../../data/useHome.ts';
import { parseAmountInput } from '../../data/payloads.ts';
import { firstNameOf, useProfile } from '../../data/useProfile.ts';
import { useSpaceSummaries } from '../../data/useSpaces.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';

export default function HomeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const now = new Date();
  const [refreshing, setRefreshing] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [customiseOpen, setCustomiseOpen] = useState(false);

  const profile = useProfile();
  const net = useMyNetBalances();
  const spaces = useSpaceSummaries();
  const spend = useMonthSpend(now);
  const budget = useMonthlyBudget();
  const upcoming = useUpcomingRecurring(3);
  const due = useRecurringDueBefore(monthEndIso(now));
  const inbox = useInboxCount();
  const goal = useActiveGoal();
  const insight = useLatestInsight();
  const manual = useManualBalance();

  const refresh = async () => {
    setRefreshing(true);
    await qc.refetchQueries({ type: 'active' }).catch(() => {});
    setRefreshing(false);
  };

  const daysLeft = daysLeftInMonth(now);
  const sts = manual.data
    ? safeToSpend({
        balanceMinor: manual.data.balanceMinor,
        upcomingMinor: due.data ?? 0,
        goalSetAsideMinor: 0,
        bufferMinor: manual.data.bufferMinor,
        daysLeft,
      })
    : null;
  const perDayPaise = sts ? perDayDisplayRupees(sts.perDayMinor) * 100 : null;

  const n = net.data;
  const spaceName = (id: string | undefined) => spaces.data?.find((s) => s.space.id === id)?.space.name;
  const biggestCreditor = n?.owes[0];

  const limit = budget.data ?? null;
  const pct = limit && limit > 0 && spend.data !== undefined ? Math.round((spend.data / limit) * 100) : null;

  const loadingStats = net.isPending;

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <HeroHeader overlap={70}>
          <View className="h-11 flex-row items-center justify-between">
            <Text className="font-sans text-[18px] text-paper">
              Hello, <Text className="font-sans-bold">{firstNameOf(profile.data, session?.user.email)}</Text>
            </Text>
            <View className="flex-row gap-2">
              <IconButton icon="notifications-outline" tone="dark" label="Notifications" onPress={() => router.push('/timeline')} />
              <IconButton icon="options-outline" tone="paper" label="Customise home" onPress={() => setCustomiseOpen(true)} />
            </View>
          </View>

          <View className="mt-5 items-center">
            <View className="h-[38px] flex-row items-center gap-2 rounded-pill bg-oxblood-deep px-[18px]">
              <View className="h-2 w-2 rounded-pill bg-clay" />
              <Text className="font-sans-semibold text-[12px] tracking-[1.5px] text-paper">SAFE TO SPEND TODAY</Text>
            </View>
          </View>

          <View className="mt-4 items-center">
            {perDayPaise !== null ? (
              <>
                <AmountText paise={perDayPaise} variant="hero" tone="onDark" size={80} />
                <Text className="font-sans mt-2 text-center text-[13px] leading-[19px] text-paper/85">
                  a day for the next <Text className="font-sans-bold">{daysLeft} days</Text> — after bills, goal savings
                  and a <Text className="font-sans-bold">{fmtMoney(manual.data?.bufferMinor ?? DEFAULT_BUFFER_MINOR)}</Text>{' '}
                  buffer.{' '}
                  <Text className="font-sans-semibold" onPress={() => router.push('/(tabs)/money')}>
                    How is this worked out?
                  </Text>
                </Text>
                <Text className="font-sans mt-1 text-[12px] text-paper/60" onPress={() => setBalanceOpen(true)}>
                  Balance entered by you · Update
                </Text>
              </>
            ) : (
              <>
                <Text className="font-display text-[80px] leading-[84px] text-paper">—</Text>
                <Text className="font-sans mb-3 mt-1 text-center text-[13px] leading-[19px] text-paper/85">
                  Set your balance to see what's safe to spend each day.
                </Text>
                <Button label="Set your balance" variant="paperOnInk" size="sm" onPress={() => setBalanceOpen(true)} />
              </>
            )}
          </View>
        </HeroHeader>

        <View className="-mt-[70px] px-4">
          {/* stat trio, bottom-aligned and staggered */}
          {loadingStats ? (
            <View className="flex-row items-end gap-2.5">
              <Skeleton height={172} radius={28} style={{ flex: 138 }} />
              <Skeleton height={149} radius={28} style={{ flex: 110 }} />
              <Skeleton height={127} radius={28} style={{ flex: 88 }} />
            </View>
          ) : (
            <View className="flex-row items-end gap-2.5">
              <StatCard
                variant="steel"
                overline="Owed to you"
                size="lg"
                shadow
                value={fmtMoney(n?.owedToYouMinor ?? 0)}
                meta={
                  (n?.owedToYouMinor ?? 0) > 0
                    ? `${n?.owedBy.length} ${n?.owedBy.length === 1 ? 'person' : 'people'} · ${n?.spacesOwedCount} ${n?.spacesOwedCount === 1 ? 'space' : 'spaces'}`
                    : 'Nobody owes you'
                }
                action={(n?.owedToYouMinor ?? 0) > 0 ? { label: 'Remind all in one tap', onPress: () => router.push('/reminders') } : undefined}
                onPress={() => router.push('/reminders')}
                style={{ flex: 138, height: 172 }}
              />
              <StatCard
                variant="signal"
                overline="You owe"
                size="md"
                value={fmtMoney(n?.youOweMinor ?? 0)}
                meta={
                  biggestCreditor
                    ? `${biggestCreditor.name} · ${spaceName(biggestCreditor.spaceIds[0]) ?? 'Space'}`
                    : 'You are all clear'
                }
                onPress={() => router.push('/settle')}
                style={{ flex: 110, height: 149 }}
              />
              <StatCard
                variant="clay"
                overline={`${monthShort(now)} budget`}
                size="sm"
                value={pct !== null ? `${pct}%` : '—'}
                meta={pct !== null ? `used · day ${now.getDate()}` : 'Set a budget'}
                onPress={() => router.push('/(tabs)/money')}
                style={{ flex: 88, height: 127 }}
              />
            </View>
          )}

          <View className="mt-4">
            <QuickActionBar
              actions={[
                { icon: 'receipt-outline', label: 'Scan bill', onPress: () => router.push('/add-bill') },
                { icon: 'sparkles-outline', label: 'Ask', onPress: () => router.push('/(tabs)/ask') },
                { icon: 'mic-outline', label: 'Say it', onPress: () => router.push('/voice'), accent: 'signal' },
                { icon: 'swap-horizontal-outline', label: 'Settle', onPress: () => router.push('/settle') },
              ]}
            />
          </View>

          {net.isError ? (
            <View className="mt-4">
              <ErrorNote message={friendlyError(net.error)} onRetry={() => net.refetch()} />
            </View>
          ) : null}

          {insight.data ? (
            <View className="mt-4">
              <InsightCard
                overline="PayMind noticed"
                headline={insight.data.headline}
                body={insight.data.body}
                actions={[
                  { label: 'See why', onPress: () => router.push('/insights') },
                  { label: 'Try a scenario', onPress: () => router.push('/afford') },
                ]}
              />
            </View>
          ) : null}

          {inbox.data && inbox.data.count > 0 ? (
            <View className="mt-4">
              <InboxRow
                count={inbox.data.count}
                title="New transactions to confirm"
                subtitle={`Picked up from UPI alerts${
                  inbox.data.recurringCount > 0 ? ` · ${inbox.data.recurringCount} looks recurring` : ''
                }`}
                onPress={() => router.push('/capture-inbox')}
              />
            </View>
          ) : null}

          {upcoming.data && upcoming.data.length > 0 ? (
            <>
              <SectionHeader title="Coming up" actionLabel="All recurring" onAction={() => router.push('/recurring')} />
              <ListCard>
                {upcoming.data.map((r) => {
                  const d = r.nextDue ? dayAndMonth(r.nextDue) : { day: '', month: '' };
                  return (
                    <ListRow
                      key={r.id}
                      left={<DateBadge day={d.day} month={d.month} />}
                      title={r.name}
                      subtitle={r.priceUpMinor ? `Price up ${fmtMoney(r.priceUpMinor)}` : undefined}
                      subtitleTone="rust"
                      right={<AmountText paise={r.expectedMinor} variant="row" />}
                      onPress={() => router.push('/recurring')}
                    />
                  );
                })}
              </ListCard>
            </>
          ) : null}

          <SectionHeader title="Your spaces" actionLabel="See all" onAction={() => router.push('/(tabs)/spaces')} />
          {spaces.isPending ? (
            <Skeleton height={185} radius={24} />
          ) : spaces.data && spaces.data.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {spaces.data.slice(0, 8).map((s) => (
                <SpaceCard
                  key={s.space.id}
                  title={s.space.name}
                  dark={s.space.type === 'trip' && s.space.status !== 'settled' && s.space.status !== 'archived'}
                  status={s.status}
                  amountMinor={s.status === 'square' ? s.totalMinor : s.myNetMinor}
                  caption={s.space.type === 'trip' ? `${s.memberCount} people` : `${s.memberCount} people`}
                  onPress={() => router.push(`/space/${s.space.id}`)}
                />
              ))}
            </ScrollView>
          ) : (
            <Card tone="sand" radius={28} padding={18} onPress={() => router.push('/(tabs)/spaces')}>
              <Text className="font-sans-bold text-[19px] text-ink">Start a space</Text>
              <Text className="font-sans mt-1 text-[14px] text-muted">
                A trip, a flat, a couple or a group of friends — split costs and settle up in one place.
              </Text>
            </Card>
          )}

          {goal.data ? (
            <View className="mt-4">
              <Card padding={16} onPress={() => router.push('/goals')}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans-semibold flex-1 text-[15px] text-ink" numberOfLines={1}>
                    {goal.data.name}
                  </Text>
                  <Text className="font-sans text-[15px] text-muted">
                    {goal.data.targetMinor > 0 ? Math.round((goal.data.savedMinor / goal.data.targetMinor) * 100) : 0}%
                  </Text>
                </View>
                <View className="my-2.5">
                  <ProgressBar value={goal.data.targetMinor > 0 ? goal.data.savedMinor / goal.data.targetMinor : 0} />
                </View>
                <Text className="font-sans text-[13px] text-muted">
                  {fmtMoney(goal.data.savedMinor)} of {fmtMoney(goal.data.targetMinor)}
                  {goal.data.targetDate
                    ? ` · by ${new Date(goal.data.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
                    : ''}
                </Text>
              </Card>
            </View>
          ) : null}

          <View className="mt-6">
            <Button label="+ Add an expense" variant="dashed" onPress={() => router.push('/expense-new')} />
          </View>
        </View>
      </ScrollView>

      <BalanceSheet
        key={manual.data?.updatedAt ?? 'none'}
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        initialBalance={manual.data?.balanceMinor}
        initialBuffer={manual.data?.bufferMinor ?? DEFAULT_BUFFER_MINOR}
      />
      <Sheet visible={customiseOpen} onClose={() => setCustomiseOpen(false)} title="Customise home">
        <Text className="font-sans mb-4 text-[15px] text-muted">
          Choose which cards appear on Home. This is coming soon.
        </Text>
        <Button label="Got it" variant="dark" onPress={() => setCustomiseOpen(false)} />
      </Sheet>
    </View>
  );
}

function BalanceSheet({
  visible,
  onClose,
  initialBalance,
  initialBuffer,
}: {
  visible: boolean;
  onClose: () => void;
  initialBalance: number | undefined;
  initialBuffer: number;
}) {
  const set = useSetManualBalance();
  const [balance, setBalance] = useState(initialBalance !== undefined ? String(initialBalance / 100) : '');
  const [buffer, setBuffer] = useState(String(initialBuffer / 100));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const b = balance.trim() === '0' ? 0 : parseAmountInput(balance);
    const buf = buffer.trim() === '0' || buffer.trim() === '' ? 0 : parseAmountInput(buffer);
    if (b === null) return setError('Enter the money you have in your bank accounts now.');
    if (buf === null) return setError('Enter a buffer amount, or 0.');
    setError(null);
    try {
      await set.mutateAsync({ balanceMinor: b, bufferMinor: buf });
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Your balance">
      <View className="gap-3">
        <Text className="font-sans text-[14px] text-muted">
          PayMind can't see your bank yet, so tell us roughly what you have. It stays on this phone.
        </Text>
        <TextField label="Money in your accounts" prefix="₹" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="45,000" />
        <TextField label="Buffer to keep untouched" prefix="₹" value={buffer} onChangeText={setBuffer} keyboardType="decimal-pad" placeholder="5,000" />
        {error ? <ErrorNote message={error} /> : null}
        <Button label="Save" size="lg" loading={set.isPending} onPress={save} />
      </View>
    </Sheet>
  );
}
