import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import {
  AmountText,
  Card,
  EmptyState,
  IconButton,
  ListCard,
  ListRow,
  MemberAvatar,
  ProgressBar,
  SectionHeader,
  avatarColor,
  categoryColor,
  fmtMoney,
  palette,
} from '../../../components/index.ts';
import { relativeDay } from '../../../data/dates.ts';
import type { Settlement } from '../../../data/settle.ts';
import type { Balance, Category, Expense, Space, SpaceMember } from '../../../data/types.ts';
import { methodLabel } from '../../settle/logic.ts';
import type { CategoryTotal } from '../logic.ts';

export interface SpaceCtx {
  id: string;
  space: Space;
  uid: string | undefined;
  /** members who have not left */
  active: SpaceMember[];
  allMembers: SpaceMember[];
  balances: Balance[];
  /** confirmed expenses, newest first (up to 500) */
  expenses: Expense[];
  categories: Category[];
  myMember: SpaceMember | undefined;
  settlements: Settlement[];
  nameOf: (memberId: string | null) => string;
}

/** Person-plus icon in a hero/header: opens space-invite for this space. */
export function InviteIcon({ spaceId, tone = 'light' }: { spaceId: string; tone?: 'light' | 'dark' }) {
  const router = useRouter();
  return (
    <IconButton
      icon="person-add-outline"
      tone={tone}
      label="Invite"
      onPress={() => router.push({ pathname: '/space-invite', params: { spaceId } })}
    />
  );
}

/** "Who paid what": paid amount + balance per member, bar vs the fair-share tick. */
export function WhoPaidWhat({ ctx }: { ctx: SpaceCtx }) {
  const rows = ctx.balances.filter((b) => !b.leftAt || b.paidMinor > 0);
  const total = rows.reduce((a, b) => a + b.paidMinor, 0);
  const maxPaid = Math.max(1, ...rows.map((b) => b.paidMinor));
  const fairShare = rows.length > 0 ? total / rows.length : 0;
  return (
    <Card radius={28} padding={16}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-sans-bold text-[18px] text-ink">Who paid what</Text>
        <Text className="font-sans text-[13px] text-muted">line = fair share</Text>
      </View>
      <View className="gap-4">
        {rows.map((b) => {
          const isYou = b.userId !== null && b.userId === ctx.uid;
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
              <ProgressBar value={b.paidMinor / maxPaid} tick={fairShare / maxPaid} fill={avatarColor(b.memberId, isYou)} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** Stacked bar + two-column legend ("Where it went"). */
export function WhereItWent({ breakdown, title = 'Where it went' }: { breakdown: readonly CategoryTotal[]; title?: string }) {
  const total = breakdown.reduce((a, b) => a + b.totalMinor, 0);
  if (total <= 0) return null;
  return (
    <Card radius={28} padding={16}>
      <Text className="font-sans-bold mb-3 text-[18px] text-ink">{title}</Text>
      <ProgressBar
        height={18}
        segments={breakdown.map((b) => ({ value: b.totalMinor / total, color: categoryColor(b.slug) }))}
      />
      <View className="mt-4 flex-row flex-wrap">
        {breakdown.map((b) => (
          <View key={b.slug} className="w-1/2 flex-row items-center gap-2 py-1.5 pr-2">
            <View className="h-3 w-3 rounded" style={{ backgroundColor: categoryColor(b.slug) }} />
            <Text className="font-sans flex-1 text-[15px] text-ink" numberOfLines={1}>
              {b.name}
            </Text>
            <Text className="font-sans-bold text-[15px] text-ink">{fmtMoney(b.totalMinor)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

interface ActivityItem {
  key: string;
  at: string;
  title: string;
  sub: string;
  right: { kind: 'amount'; minor: number } | { kind: 'label'; text: string; tone: 'slate' | 'muted' | 'signal' };
}

export function buildActivity(ctx: SpaceCtx, limit = 6): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const e of ctx.expenses.slice(0, limit)) {
    items.push({
      key: `e${e.id}`,
      at: e.occurredAt,
      title: `${ctx.nameOf(e.paidByMember)} added ${e.title}`,
      sub: `${relativeDay(e.occurredAt)} · paid by ${ctx.nameOf(e.paidByMember)}`,
      right: { kind: 'amount', minor: e.totalMinor },
    });
  }
  for (const s of ctx.settlements.slice(0, limit)) {
    const m = methodLabel(s.method, s.upiApp);
    const settled = s.status === 'completed' || s.status === 'confirmed_manual' || s.status === 'corrected';
    items.push({
      key: `s${s.id}`,
      at: s.createdAt,
      title: `${ctx.nameOf(s.fromMember)} paid ${ctx.nameOf(s.toMember)} ${fmtMoney(s.amountMinor)}${m ? ` via ${m}` : ''}`,
      sub: `${relativeDay(s.createdAt)} · ${settled ? 'confirmed' : s.status}`,
      right: settled
        ? { kind: 'label', text: 'SETTLED', tone: 'slate' }
        : s.status === 'failed'
          ? { kind: 'label', text: 'FAILED', tone: 'signal' }
          : { kind: 'label', text: s.status === 'cancelled' ? 'CANCELLED' : 'PENDING', tone: 'muted' },
    });
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

export function ActivityList({ ctx }: { ctx: SpaceCtx }) {
  const items = buildActivity(ctx);
  return (
    <>
      <SectionHeader title="Activity" />
      {items.length === 0 ? (
        <Card>
          <EmptyState title="Nothing yet" body="Expenses and payments in this space show up here." />
        </Card>
      ) : (
        <ListCard>
          {items.map((it) => (
            <ListRow
              key={it.key}
              title={it.title}
              subtitle={it.sub}
              right={
                it.right.kind === 'amount' ? (
                  <AmountText paise={it.right.minor} variant="row" />
                ) : (
                  <Text
                    className="font-sans-bold text-[12px] tracking-[1px]"
                    style={{ color: it.right.tone === 'slate' ? palette.slate : it.right.tone === 'signal' ? palette.signal : palette.muted }}
                  >
                    {it.right.text}
                  </Text>
                )
              }
            />
          ))}
        </ListCard>
      )}
    </>
  );
}
