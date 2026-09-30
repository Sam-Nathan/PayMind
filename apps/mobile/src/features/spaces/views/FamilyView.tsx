import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
  MemberAvatar,
  Overline,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  categoryColor,
  fmtMoney,
  palette,
} from '../../../components/index.ts';
import { shortDate } from '../../../data/dates.ts';
import { useSpaceBudgets, useSpaceGoal, useSpaceRecurring } from '../data.ts';
import {
  categoryBreakdown,
  categoryName,
  householdInsight,
  inMonth,
  monthLong,
  paidByMember,
  percent,
  rootSlug,
} from '../logic.ts';
import { InviteIcon, type SpaceCtx } from './common.tsx';

type Scope = 'household' | 'mine';

export function FamilyView({ ctx }: { ctx: SpaceCtx }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { space, id } = ctx;
  const now = useMemo(() => new Date(), []);
  const me = ctx.myMember as NonNullable<SpaceCtx['myMember']>;
  const [scope, setScope] = useState<Scope>('household');

  const monthAll = useMemo(() => ctx.expenses.filter((e) => inMonth(e.occurredAt, now)), [ctx.expenses, now]);
  // "Just mine" shows only what I put into the shared pot, never anyone else's spending.
  const shown = useMemo(
    () => (scope === 'mine' ? monthAll.filter((e) => e.paidByMember === me.id) : monthAll),
    [monthAll, scope, me.id],
  );
  const spent = shown.reduce((a, e) => a + e.totalMinor, 0);
  const breakdown = useMemo(() => categoryBreakdown(shown, ctx.categories), [shown, ctx.categories]);
  const paid = useMemo(() => paidByMember(monthAll), [monthAll]);

  const budgets = useSpaceBudgets(id);
  const slugById = useMemo(() => new Map(ctx.categories.map((c) => [c.id, c.slug])), [ctx.categories]);
  const limits = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of budgets.data ?? []) {
      if (b.categoryId) m.set(rootSlug(slugById.get(b.categoryId)), b.limitMinor);
    }
    return m;
  }, [budgets.data, slugById]);
  const groupBudget =
    space.budgetMinor ?? (budgets.data ?? []).find((b) => !b.categoryId)?.limitMinor ?? null;

  const rows = useMemo(() => {
    const spentBy = new Map(breakdown.map((b) => [b.slug, b.totalMinor]));
    const slugs = [...new Set([...limits.keys(), ...breakdown.map((b) => b.slug)])];
    return slugs
      .map((slug) => ({ slug, spent: spentBy.get(slug) ?? 0, limit: limits.get(slug) ?? null }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 8);
  }, [breakdown, limits]);
  const maxSpent = Math.max(1, ...rows.map((r) => r.spent));

  const upcoming = useSpaceRecurring(id);
  const goal = useSpaceGoal(id);
  const g = goal.data;
  const insight = householdInsight({ breakdown, budgets: limits, spentMinor: spent, budgetMinor: groupBudget });

  const contributors = scope === 'mine' ? ctx.active.filter((m) => m.id === me.id) : ctx.active;

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <HeroHeader tone="oxblood">
          <View className="h-11 flex-row items-center justify-between">
            <IconButton icon="chevron-back" tone="dark" label="Back" onPress={() => router.back()} />
            <Text className="font-sans-semibold flex-1 px-2 text-center text-[17px] text-paper" numberOfLines={1}>
              {space.name}
            </Text>
            <InviteIcon spaceId={id} tone="dark" />
          </View>
          <View className="mt-4">
            <SegmentedControl
              tone="onHero"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'household', label: 'Household' },
                { value: 'mine', label: 'Just mine' },
              ]}
            />
          </View>
          <View className="mt-4">
            <Overline tone="peach">
              {scope === 'mine' ? 'Just mine' : 'Household'} · {monthLong(now)}
            </Overline>
          </View>
          <View className="mt-2 items-start">
            <AmountText paise={spent} variant="hero" tone="onDark" size={60} />
          </View>
          <Text className="font-sans mt-2 text-[15px] text-paper/85">
            {scope === 'household' && groupBudget
              ? `${percent(spent, groupBudget)}% of the ${fmtMoney(groupBudget)} family budget · ${ctx.active.length} members`
              : scope === 'mine'
                ? 'What you put into shared spending'
                : `spent · ${ctx.active.length} members`}
          </Text>
        </HeroHeader>

        <View className="gap-3 px-4 pt-4">
          {scope === 'mine' && spent === 0 ? (
            <Card>
              <EmptyState title="You haven't put anything in yet" />
            </Card>
          ) : null}

          <Card radius={28} padding={16}>
            <Text className="font-sans-bold mb-3 text-[18px] text-ink">Who put in what</Text>
            <View className="flex-row flex-wrap gap-y-3">
              {contributors.map((m) => (
                <View key={m.id} className="w-1/4 items-center gap-1">
                  <MemberAvatar id={m.id} name={m.displayName} isYou={m.id === me.id} size={44} />
                  <Text className="font-sans text-[14px] text-muted" numberOfLines={1}>
                    {m.id === me.id ? 'You' : m.displayName.split(' ')[0]}
                  </Text>
                  <Text className="font-sans-bold text-[16px] text-ink">{fmtMoney(paid.get(m.id) ?? 0)}</Text>
                </View>
              ))}
            </View>
          </Card>

          {rows.length > 0 ? (
            <Card radius={28} padding={16}>
              <Text className="font-sans-bold mb-3 text-[18px] text-ink">Household categories</Text>
              <View className="gap-4">
                {rows.map((r) => (
                  <View key={r.slug} className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans text-[16px] text-ink">{categoryName(r.slug)}</Text>
                      <Text className="font-sans-bold text-[16px] text-ink">
                        {fmtMoney(r.spent)}
                        {r.limit ? <Text className="font-sans text-muted"> / {fmtMoney(r.limit)}</Text> : null}
                      </Text>
                    </View>
                    <ProgressBar
                      value={r.limit ? r.spent / r.limit : r.spent / maxSpent}
                      fill={r.limit && r.spent > r.limit ? palette.signal : categoryColor(r.slug)}
                    />
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <SectionHeader title="Coming up for the family" />
          {(upcoming.data ?? []).length === 0 ? (
            <Card>
              <EmptyState title="Nothing due soon" body="Recurring household bills show up here once they're set up." />
            </Card>
          ) : (
            <ListCard>
              {(upcoming.data ?? []).map((u) => (
                <ListRow
                  key={u.id}
                  title={u.name}
                  subtitle={`${shortDate(u.nextDue)} · ${u.cadence.replace('_', ' ')}`}
                  right={u.expectedMinor > 0 ? <AmountText paise={u.expectedMinor} variant="row" /> : undefined}
                  onPress={() => router.push('/recurring')}
                />
              ))}
            </ListCard>
          )}

          {insight ? (
            <Card tone="ink" radius={24} padding={16}>
              <Overline tone="steel">Household insight</Overline>
              <Text className="font-sans mt-2 text-[17px] leading-6 text-paper">{insight}</Text>
            </Card>
          ) : null}

          {g ? (
            <Card radius={24} padding={16} onPress={() => router.push('/goals')}>
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-semibold text-[16px] text-ink">Family goal · {g.name}</Text>
                <Text className="font-sans text-[14px] text-muted">{percent(g.savedMinor, g.targetMinor)}%</Text>
              </View>
              <View className="my-2">
                <ProgressBar value={g.savedMinor / g.targetMinor} fill={palette.oxblood} />
              </View>
              <Text className="font-sans text-[14px] text-muted">
                {fmtMoney(g.savedMinor)} of {fmtMoney(g.targetMinor)}
                {g.targetDate ? ` · target ${new Date(g.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
              </Text>
            </Card>
          ) : (
            <Button label="+ Add a family goal" variant="dashed" size="lg" onPress={() => router.push('/goals')} />
          )}

          <View className="flex-row gap-2">
            <Button label="Settle up" size="lg" full onPress={() => router.push({ pathname: '/settle', params: { spaceId: id } })} />
            <Button
              label="+ Add expense"
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
