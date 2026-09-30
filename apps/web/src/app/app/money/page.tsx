import { groupIndian, perDayDisplayRupees } from '@paymind/core';
import type { Metadata } from 'next';
import { BalanceForm } from '../../../components/BalanceForm';
import { Container, EmptyState, PageTitle, SectionHeader } from '../../../components/ui';
import { requireUser } from '../../../lib/auth';
import { loadSafeToSpend } from '../../../lib/balance';
import { inr0 } from '../../../lib/format';
import { createClient } from '../../../lib/supabase/server';
import type { Budget } from '../../../lib/types';

export const metadata: Metadata = { title: 'Money' };

export default async function MoneyPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const sts = await loadSafeToSpend();

  let budgets: Budget[] = [];
  try {
    const { data } = await supabase
      .from('budgets')
      .select('id,name,scope,period,limit_minor,category_id,space_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    budgets = (data as Budget[] | null) ?? [];
  } catch {
    budgets = [];
  }

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  const r = sts.result;

  return (
    <Container className="pt-6 md:pt-10">
      <PageTitle title="Money" sub={`${monthName} · day ${sts.day} of ${sts.daysInMonth}`} />

      <section
        aria-label="Safe to spend"
        className="dots mt-6 rounded-[28px] bg-hero p-5 text-text-on-dark"
      >
        <p className="overline text-peach">Safe to spend</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[56px] font-bold leading-none md:text-[66px]">
            {r ? `₹${groupIndian(String(perDayDisplayRupees(r.perDayMinor)))}` : '—'}
          </span>
          {r ? <span className="text-[15px] text-paper/80">a day</span> : null}
        </p>

        {r ? (
          <dl className="mt-5 space-y-2 text-[14px]">
            <div className="flex justify-between gap-4">
              <dt>In your account</dt>
              <dd className="tabular-nums">{inr0(sts.balanceMinor ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Bills and dues before month-end</dt>
              <dd className="tabular-nums">−{inr0(0)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Goals set aside</dt>
              <dd className="tabular-nums">−{inr0(0)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Buffer</dt>
              <dd className="tabular-nums">−{inr0(sts.bufferMinor)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-paper/25 pt-2 font-bold">
              <dt>
                Free until month-end ÷ {sts.daysLeft} days
              </dt>
              <dd className="tabular-nums">{inr0(r.freeMinor)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-[14px] text-paper/85">
            Enter your bank balance below to see what is safe to spend each day.
          </p>
        )}

        <div className="mt-5">
          <BalanceForm view={sts} />
        </div>
      </section>
      <p className="mt-3 text-[13px] text-text-muted">
        Safe to spend = balance − upcoming bills − goal savings − buffer, divided by the days left
        this month. Bills and goals are not connected on the web yet.
      </p>

      <SectionHeader title="Budgets" />
      {budgets.length === 0 ? (
        <EmptyState title="No budgets yet">
          Budgets you set in the PayMind app appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-[24px] border border-hairline bg-white">
          {budgets.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{b.name ?? `${b.scope} budget`}</p>
                <p className="text-[13px] capitalize text-text-muted">
                  {b.scope} · {b.period}
                </p>
              </div>
              <p className="text-[16px] font-bold tabular-nums">{inr0(Number(b.limit_minor))}</p>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
