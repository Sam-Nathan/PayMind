import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AmountText,
  Button,
  Card,
  EmptyState,
  HeroHeader,
  IconButton,
  ListCard,
  ListRow,
  ProgressBar,
  SectionHeader,
  SPACE_TYPES,
  fmtMoney,
  palette,
} from '../../../components/index.ts';
import { dateRange, relativeDay } from '../../../data/dates.ts';
import { InviteIcon, WhoPaidWhat, type SpaceCtx } from './common.tsx';

/** Friends / college / office / custom: the plain layout (hero total, who paid what, expenses). */
export function GenericView({ ctx }: { ctx: SpaceCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { space, id } = ctx;
  const total = ctx.balances.reduce((a, b) => a + b.paidMinor, 0);
  const people = ctx.active.length;
  const perPerson = people > 0 ? Math.round(total / people) : 0;
  const budget = space.budgetMinor;
  const info = SPACE_TYPES[space.type];
  const meta = [info.label, dateRange(space.startsOn, space.endsOn), `${people} people`].filter(Boolean).join(' · ');

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <HeroHeader tone="ink">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans flex-1 px-2 text-center text-[14px] text-steel" numberOfLines={1}>
              {meta}
            </Text>
            <InviteIcon spaceId={id} tone="dark" />
          </View>
          <Text className="font-sans-bold mt-4 text-[26px] text-paper" numberOfLines={2}>
            {space.name}
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
            <Text className="font-sans mt-2 text-[14px] text-paper/80">{fmtMoney(perPerson)} per person · no budget set</Text>
          )}
        </HeroHeader>

        <View className="gap-3 px-4 pt-4">
          <View className="flex-row gap-2">
            <Button label="Settle" size="lg" full onPress={() => router.push({ pathname: '/settle', params: { spaceId: id } })} />
            <Button
              label="+ Add expense"
              variant="outline"
              size="lg"
              full
              onPress={() => router.push({ pathname: '/expense-new', params: { spaceId: id } })}
            />
          </View>

          {ctx.balances.length === 0 ? (
            <Card>
              <EmptyState title="No members yet" />
            </Card>
          ) : (
            <WhoPaidWhat ctx={ctx} />
          )}

          <SectionHeader title="Expenses" />
          {ctx.expenses.length > 0 ? (
            <ListCard>
              {ctx.expenses.slice(0, 50).map((e) => (
                <ListRow
                  key={e.id}
                  title={e.title}
                  subtitle={`${relativeDay(e.occurredAt)} · paid by ${ctx.nameOf(e.paidByMember)}`}
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
