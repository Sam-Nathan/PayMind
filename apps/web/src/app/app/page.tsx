import { groupIndian, perDayDisplayRupees } from '@paymind/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BalanceForm } from '../../components/BalanceForm';
import { ChevronRightIcon } from '../../components/icons';
import { Container, EmptyState, Hero, SectionHeader } from '../../components/ui';
import { requireUser } from '../../lib/auth';
import { loadSafeToSpend } from '../../lib/balance';
import { firstName, inr0, inr2, shortDate } from '../../lib/format';
import { summariseDebts } from '../../lib/queries';
import { createClient } from '../../lib/supabase/server';
import type { BalanceRow, Expense, Profile, Space } from '../../lib/types';

export const metadata: Metadata = { title: 'Home' };

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const sts = await loadSafeToSpend();

  let loadError = false;
  let profile: Profile | null = null;
  let spaces: Space[] = [];
  let balances: BalanceRow[] = [];
  let expenses: Expense[] = [];

  try {
    // One round trip: RLS already limits balances to the viewer's spaces, so it doesn't need
    // the space ids first; archived spaces are dropped below.
    const [p, s, b, e] = await Promise.all([
      supabase.from('profiles').select('id,name,upi_vpa').eq('id', user.id).maybeSingle(),
      supabase
        .from('spaces')
        .select('id,type,name,starts_on,ends_on,budget_minor,currency,status,created_by,created_at')
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      supabase
        .from('balances')
        .select('space_id,member_id,user_id,display_name,left_at,paid_minor,owed_minor,settled_out_minor,settled_in_minor,net_minor'),
      supabase
        .from('expenses')
        .select('id,owner_id,space_id,title,total_minor,paid_by_member,occurred_at,status,category_id')
        .eq('status', 'confirmed')
        .order('occurred_at', { ascending: false })
        .limit(6),
    ]);
    if (p.error || s.error || b.error || e.error) loadError = true;
    profile = (p.data as Profile | null) ?? null;
    spaces = (s.data as Space[] | null) ?? [];
    const visible = new Set(spaces.map((x) => x.id));
    balances = ((b.data as BalanceRow[] | null) ?? []).filter((r) => visible.has(r.space_id));
    expenses = (e.data as Expense[] | null) ?? [];
  } catch {
    loadError = true;
  }

  const debts = summariseDebts(balances, user.id);
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const hero = sts.result ? groupIndian(String(perDayDisplayRupees(sts.result.perDayMinor))) : null;

  return (
    <>
      <Hero>
        <p className="text-[18px]">
          Hello, <span className="font-bold">{firstName(profile?.name, user.email)}</span>
        </p>

        <div className="mt-6 flex flex-col items-center text-center">
          <span className="rounded-full bg-oxblood-deep px-[18px] py-2 text-[12px] font-semibold uppercase tracking-[1.5px]">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-clay align-middle" />
            Safe to spend today
          </span>
          <p className="mt-4 flex items-start font-display text-[72px] font-bold leading-none md:text-[88px]">
            {hero !== null ? (
              <>
                <span className="mr-1 mt-2 font-sans text-[26px] font-semibold">₹</span>
                {hero}
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-paper/85">
            {sts.result ? (
              <>
                a day for the next <b>{sts.daysLeft} days</b>, after a <b>{inr0(sts.bufferMinor)}</b>{' '}
                buffer.{' '}
                <Link href="/app/money" className="font-semibold">
                  How is this worked out?
                </Link>
              </>
            ) : (
              <>Add your bank balance to see what is safe to spend each day until month-end.</>
            )}
          </p>
        </div>

        <div className="mx-auto mt-6 max-w-md">
          <BalanceForm view={sts} />
        </div>
      </Hero>

      <Container>
        {loadError ? (
          <p role="status" className="mt-4 rounded-[14px] bg-peach px-3.5 py-2.5 text-[14px] text-rust">
            Some data could not be loaded right now. Try again in a moment.
          </p>
        ) : null}

        <div className="-mt-6 grid grid-cols-2 gap-3">
          <Link
            href="/app/spaces"
            className="rounded-[28px] bg-steel p-4 shadow-[0_10px_24px_rgba(35,40,51,0.10)]"
          >
            <p className="overline text-ink">Owed to you</p>
            <p className="mt-2 text-[28px] font-bold leading-tight">{inr0(debts.owedToMeMinor)}</p>
            <p className="mt-1 text-[12px]">
              {debts.debtorCount > 0
                ? `${debts.debtorCount} ${debts.debtorCount === 1 ? 'person' : 'people'} · ${debts.creditSpaceCount} ${debts.creditSpaceCount === 1 ? 'space' : 'spaces'}`
                : 'Nobody owes you'}
            </p>
          </Link>
          <Link href="/app/spaces" className="rounded-[28px] bg-signal p-4 text-white">
            <p className="overline">You owe</p>
            <p className="mt-2 text-[28px] font-bold leading-tight">{inr0(debts.iOweMinor)}</p>
            <p className="mt-1 truncate text-[12px]">
              {debts.largestCreditor
                ? `${debts.largestCreditor.name} · ${spaceName.get(debts.largestCreditor.spaceId) ?? ''}`
                : 'You are all square'}
            </p>
          </Link>
        </div>

        <SectionHeader title="Your spaces" link={{ href: '/app/spaces', label: 'See all' }} />
        {spaces.length === 0 ? (
          <EmptyState
            title="Start a space"
            action={{ href: '/app/spaces/new', label: 'Create a space' }}
          >
            A trip, a flat, a couple, a family. Add expenses and PayMind keeps track of who owes whom.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {spaces.slice(0, 6).map((s) => {
              const net = debts.bySpace.get(s.id)?.netMinor ?? 0;
              return (
                <Link
                  key={s.id}
                  href={`/app/spaces/${s.id}`}
                  className="flex min-h-[112px] flex-col justify-between rounded-[24px] border border-hairline bg-white p-4"
                >
                  <p className="text-[15px] font-semibold leading-snug">{s.name}</p>
                  <div>
                    <p
                      className={`text-[12px] font-semibold ${net < 0 ? 'text-signal' : 'text-slate'}`}
                    >
                      {net < 0 ? 'You owe' : net > 0 ? 'You are owed' : 'All square'}
                    </p>
                    {net !== 0 ? (
                      <p className={`text-[14px] font-bold ${net < 0 ? 'text-signal' : 'text-slate'}`}>
                        {inr0(Math.abs(net))}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <SectionHeader title="Recent expenses" />
        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet">
            Add your first expense from a space and it will show up here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-[24px] border border-hairline bg-white">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={e.space_id ? `/app/spaces/${e.space_id}` : '/app/timeline'}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{e.title}</p>
                    <p className="truncate text-[13px] text-text-muted">
                      {e.space_id ? (spaceName.get(e.space_id) ?? 'Shared') : 'Personal'} ·{' '}
                      {shortDate(e.occurred_at)}
                    </p>
                  </div>
                  <p className="text-[16px] font-bold tabular-nums">{inr2(Number(e.total_minor))}</p>
                  <ChevronRightIcon width={18} height={18} className="shrink-0 text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
