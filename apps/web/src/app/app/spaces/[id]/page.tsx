import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddExpenseForm } from '../../../../components/AddExpenseForm';
import { SettleSection, type DebtItem } from '../../../../components/SettleSection';
import { Avatar, Container, EmptyState, Hero, ProgressBar, SectionHeader } from '../../../../components/ui';
import { requireUser } from '../../../../lib/auth';
import { inr0, inr2, shortDate } from '../../../../lib/format';
import { transfersFor } from '../../../../lib/queries';
import { typeLabel } from '../../../../lib/space-meta';
import { createClient } from '../../../../lib/supabase/server';
import type {
  BalanceRow,
  Category,
  Expense,
  Settlement,
  Space,
  SpaceMember,
} from '../../../../lib/types';

export const metadata: Metadata = { title: 'Space' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SpaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requireUser();
  const supabase = await createClient();

  const spaceRes = await supabase
    .from('spaces')
    .select('id,type,name,starts_on,ends_on,budget_minor,currency,status,created_by,created_at')
    .eq('id', id)
    .maybeSingle();
  const space = spaceRes.data as Space | null;
  if (!space) notFound();

  const [membersRes, balancesRes, expensesRes, settlementsRes, catRes] = await Promise.all([
    supabase
      .from('space_members')
      .select('id,space_id,user_id,display_name,upi_vpa,role,share_weight,left_at')
      .eq('space_id', id)
      .order('joined_at', { ascending: true }),
    supabase.from('balances').select('*').eq('space_id', id),
    supabase
      .from('expenses')
      .select('id,owner_id,space_id,title,total_minor,paid_by_member,occurred_at,status,category_id')
      .eq('space_id', id)
      .eq('status', 'confirmed')
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('settlements')
      .select('id,space_id,from_member,to_member,amount_minor,status,note_ref,utr,created_at,completed_at')
      .eq('space_id', id)
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('id,slug,name').is('owner_id', null).order('sort_order'),
  ]);

  const members = (membersRes.data as SpaceMember[] | null) ?? [];
  const balances = (balancesRes.data as BalanceRow[] | null) ?? [];
  const expenses = (expensesRes.data as Expense[] | null) ?? [];
  const pending = (settlementsRes.data as Settlement[] | null) ?? [];
  const categories = ((catRes.data as Category[] | null) ?? []).filter((c) => c.slug !== null);

  const me = members.find((m) => m.user_id === user.id) ?? null;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = (mid: string) => memberById.get(mid)?.display_name ?? 'Former member';

  const active = members.filter((m) => !m.left_at);
  const totalMinor = balances.reduce((s, b) => s + Number(b.paid_minor), 0);
  const budget = space.budget_minor ? Number(space.budget_minor) : null;
  const maxPaid = Math.max(1, ...balances.map((b) => Number(b.paid_minor)));

  const toItem = (
    from: string,
    to: string,
    amountMinor: number,
    extra: Partial<DebtItem> = {},
  ): DebtItem => ({
    from,
    to,
    amountMinor,
    fromName: nameOf(from),
    toName: nameOf(to),
    toVpa: memberById.get(to)?.upi_vpa ?? null,
    ...extra,
  });

  const transfers = transfersFor(balances).map((t) => toItem(t.from, t.to, t.amountMinor));
  const inProgress = pending.map((s) =>
    toItem(s.from_member, s.to_member, Number(s.amount_minor), {
      settlementId: s.id,
      status: s.status,
    }),
  );

  const dates =
    space.starts_on || space.ends_on
      ? [space.starts_on, space.ends_on]
          .filter(Boolean)
          .map((d) => shortDate(`${d}T12:00:00+05:30`))
          .join(' – ')
      : null;

  return (
    <>
      <Hero tone={space.type === 'trip' || space.type === 'event' ? 'ink' : 'oxblood'}>
        <Link href="/app/spaces" className="text-[14px] font-semibold text-text-on-dark-muted">
          ← Spaces
        </Link>
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-[1.3px] text-text-on-dark-muted">
          {typeLabel(space.type)}
          {dates ? ` · ${dates}` : ''} · {active.length} {active.length === 1 ? 'person' : 'people'}
          {space.status !== 'active' ? ` · ${space.status}` : ''}
        </p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight">{space.name}</h1>
        <p className="mt-3 font-display text-[56px] font-bold leading-none md:text-[72px]">
          <span className="mr-1 font-sans text-[22px] font-semibold align-top">₹</span>
          {inr0(totalMinor).replace('₹', '')}
        </p>
        <p className="mt-1 text-[13px] text-text-on-dark-muted">spent together</p>
        {budget ? (
          <div className="mt-4 max-w-md">
            <ProgressBar
              value={totalMinor / budget}
              tone="clay"
              track="bg-ink-soft"
            />
            <div className="mt-2 flex justify-between text-[14px] text-paper/80">
              <span>
                {Math.round((totalMinor / budget) * 100)}% of {inr0(budget)} budget
              </span>
              {active.length ? <span>{inr0(Math.round(totalMinor / active.length))} per person</span> : null}
            </div>
          </div>
        ) : null}
      </Hero>

      <Container className="pb-8">
        <SectionHeader title="Who paid what" />
        {balances.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <div className="card space-y-4 !p-5">
            {balances.map((b) => {
              const net = Number(b.net_minor);
              const isYou = b.user_id === user.id;
              return (
                <div key={b.member_id}>
                  <div className="flex items-center gap-3">
                    <Avatar id={b.member_id} name={b.display_name} isYou={isYou} size={36} />
                    <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">
                      {isYou ? 'You' : b.display_name}
                      {b.left_at ? <span className="ml-2 text-[12px] text-text-muted">left</span> : null}
                    </p>
                    <p className="text-right text-[14px] font-semibold">
                      <span className="text-text-muted">{inr0(Number(b.paid_minor))} paid · </span>
                      <span className={net < 0 ? 'text-signal' : 'text-slate'}>
                        {net === 0 ? 'square' : `${net > 0 ? '+' : '−'}${inr0(Math.abs(net))}`}
                      </span>
                    </p>
                  </div>
                  <div className="mt-2">
                    <ProgressBar
                      value={Number(b.paid_minor) / maxPaid}
                      tone={isYou ? 'signal' : 'slate'}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[12px] text-text-muted">
              + means others owe them; − means they owe. Bars show how much each person paid.
            </p>
          </div>
        )}

        <SectionHeader title="Settle up" />
        <SettleSection
          spaceId={space.id}
          spaceName={space.name}
          myMemberId={me?.id ?? null}
          transfers={transfers}
          inProgress={inProgress}
        />

        <SectionHeader title="Add an expense" />
        {me && active.length > 0 ? (
          <AddExpenseForm
            spaceId={space.id}
            myMemberId={me.id}
            categories={categories}
            members={active.map((m) => ({
              id: m.id,
              name: m.display_name,
              isYou: m.id === me.id,
            }))}
          />
        ) : (
          <EmptyState title="You are not an active member of this space">
            Only active members can add expenses.
          </EmptyState>
        )}

        <SectionHeader title="Expenses" />
        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet">Add the first one above.</EmptyState>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-[24px] border border-hairline bg-white">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{e.title}</p>
                  <p className="truncate text-[13px] text-text-muted">
                    {e.paid_by_member
                      ? `${e.paid_by_member === me?.id ? 'You' : nameOf(e.paid_by_member)} paid`
                      : 'Paid'}{' '}
                    · {shortDate(e.occurred_at)}
                  </p>
                </div>
                <p className="text-[16px] font-bold tabular-nums">{inr2(Number(e.total_minor))}</p>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
