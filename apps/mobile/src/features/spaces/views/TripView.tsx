import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  Chip,
  ChipGroup,
  EmptyState,
  HeroHeader,
  IconButton,
  ProgressBar,
  SPACE_TYPES,
  fmtMoney,
  palette,
} from '../../../components/index.ts';
import { dateRange } from '../../../data/dates.ts';
import { categoryBreakdown, percent } from '../logic.ts';
import { ActivityList, InviteIcon, WhereItWent, WhoPaidWhat, type SpaceCtx } from './common.tsx';

export function TripView({ ctx }: { ctx: SpaceCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { space, id } = ctx;
  const total = ctx.balances.reduce((a, b) => a + b.paidMinor, 0);
  const people = ctx.active.length;
  const perPerson = people > 0 ? Math.round(total / people) : 0;
  const budget = space.budgetMinor;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = space.type === 'event' && !!space.startsOn && space.startsOn > today;
  const breakdown = useMemo(() => categoryBreakdown(ctx.expenses, ctx.categories), [ctx.expenses, ctx.categories]);

  const info = SPACE_TYPES[space.type];
  const when = space.type === 'event' ? (space.startsOn ? dateRange(space.startsOn, space.startsOn) : null) : dateRange(space.startsOn, space.endsOn);
  const meta = [info.label, when, `${people} people`].filter(Boolean).join(' · ');

  // The chips open Ask with the question prefilled; the answers come from the assistant, not from here.
  const debtor = [...ctx.balances]
    .filter((b) => b.netMinor < 0 && b.userId !== ctx.uid)
    .sort((a, b) => a.netMinor - b.netMinor)[0];
  const tripWord = space.type === 'event' ? 'event' : 'trip';
  const questions = [
    `Who spent the most on ${space.name}?`,
    `What is the food total for ${space.name}?`,
    `How much did I pay on ${space.name}?`,
    ...(debtor ? [`What does ${debtor.displayName} owe on ${space.name}?`] : []),
    `What is the cost per person for ${space.name}?`,
  ];
  const chipLabels = [
    'Who spent the most?',
    'Food total?',
    'How much did I pay?',
    ...(debtor ? [`What does ${debtor.displayName.split(' ')[0]} owe?`] : []),
    'Cost per person?',
  ];

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <HeroHeader tone="ink">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans flex-1 px-2 text-center text-[14px] text-steel" numberOfLines={1}>
              {meta}
            </Text>
            {space.type === 'trip' ? (
              <Pressable
                onPress={() => router.push({ pathname: '/trip-report/[id]', params: { id } })}
                accessibilityRole="button"
                className="h-11 items-center justify-center rounded-[14px] bg-paper px-3.5 active:opacity-80"
              >
                <Text className="font-sans-semibold text-[14px] text-ink">Report</Text>
              </Pressable>
            ) : (
              <View className="w-11" />
            )}
          </View>
          <View className="mt-4 flex-row items-center justify-between gap-3">
            <Text className="font-sans-bold flex-1 text-[26px] text-paper" numberOfLines={2}>
              {space.name}
            </Text>
            <InviteIcon spaceId={id} tone="dark" />
          </View>
          <View className="mt-2 items-start">
            <AmountText paise={total} variant="hero" tone="onDark" size={64} />
          </View>
          {budget ? (
            <View className="mt-4">
              <ProgressBar value={total / budget} trackTone="inkSoft" fill={total > budget ? palette.signal : palette.clay} />
              <View className="mt-2 flex-row justify-between">
                <Text className="font-sans text-[14px] text-paper/80">
                  {upcoming ? 'Upcoming · ' : ''}
                  {percent(total, budget)}% of {fmtMoney(budget)} budget
                </Text>
                <Text className="font-sans text-[14px] text-paper/80">{fmtMoney(perPerson)} per person</Text>
              </View>
            </View>
          ) : (
            <Text className="font-sans mt-2 text-[14px] text-paper/80">{fmtMoney(perPerson)} per person</Text>
          )}
        </HeroHeader>

        <View className="gap-3 px-4 pt-4">
          <Card radius={28} padding={16}>
            <View className="mb-3 flex-row items-center gap-1.5">
              <Ionicons name="sparkles-outline" size={16} color={palette.oxblood} />
              <Text className="font-sans-bold text-[14px] uppercase tracking-[1.3px] text-oxblood">Ask this {tripWord}</Text>
            </View>
            <ChipGroup>
              {chipLabels.map((label, i) => (
                <Chip
                  key={label}
                  label={label}
                  onPress={() => router.push({ pathname: '/ask', params: { q: questions[i] as string, spaceId: id } })}
                />
              ))}
            </ChipGroup>
          </Card>

          {ctx.expenses.length === 0 ? (
            <Card>
              <EmptyState
                title="Add your first expense"
                body={`Everything you add here is split between the people on this ${tripWord}.`}
                actionLabel={`+ Add to ${tripWord}`}
                onAction={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
              />
            </Card>
          ) : (
            <>
              <WhoPaidWhat ctx={ctx} />
              <WhereItWent breakdown={breakdown} />
            </>
          )}

          <ActivityList ctx={ctx} />

          <View className="flex-row gap-2">
            <Button
              label={`Settle ${tripWord}`}
              size="lg"
              full
              onPress={() => router.push({ pathname: '/settle', params: { spaceId: id } })}
            />
            <Button
              label={`+ Add to ${tripWord}`}
              variant="outline"
              size="lg"
              full
              onPress={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
