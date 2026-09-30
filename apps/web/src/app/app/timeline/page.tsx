import type { Metadata } from 'next';
import { Container, EmptyState, PageTitle } from '../../../components/ui';
import { requireUser } from '../../../lib/auth';
import { dayLabel, inr2, timeLabel } from '../../../lib/format';
import { createClient } from '../../../lib/supabase/server';
import type { TimelineEvent } from '../../../lib/types';

export const metadata: Metadata = { title: 'Timeline' };

const BADGE: Record<TimelineEvent['event_type'], { label: string; cls: string }> = {
  expense: { label: 'EXP', cls: 'bg-sand text-oxblood' },
  payment: { label: 'PAID', cls: 'bg-ink text-paper' },
  goal: { label: 'GOAL', cls: 'bg-clay text-ink' },
  alert: { label: 'ALERT', cls: 'bg-signal text-white' },
};

export default async function TimelinePage() {
  await requireUser();
  const supabase = await createClient();

  let events: TimelineEvent[] = [];
  let failed = false;
  try {
    const { data, error } = await supabase
      .from('timeline_events')
      .select('event_type,ref_id,space_id,occurred_at,title,amount_minor,status,detail')
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error) failed = true;
    events = (data as TimelineEvent[] | null) ?? [];
  } catch {
    failed = true;
  }

  const groups: { label: string; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const label = dayLabel(ev.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <Container className="pt-6 md:pt-10">
      <PageTitle title="Timeline" sub="Everything in one chronological feed" />

      {failed ? (
        <p role="status" className="mt-4 rounded-[14px] bg-peach px-3.5 py-2.5 text-[14px] text-rust">
          The timeline could not be loaded right now.
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        {groups.length === 0 && !failed ? (
          <EmptyState
            title="Your money story starts here"
            action={{ href: '/app/spaces', label: 'Go to spaces' }}
          >
            Add an expense in a space and it will appear in your timeline.
          </EmptyState>
        ) : null}
        {groups.map((g) => (
          <section key={g.label}>
            <h2 className="overline mb-2 border-b border-hairline pb-2 text-text-muted">{g.label}</h2>
            <ul className="divide-y divide-hairline overflow-hidden rounded-[24px] border border-hairline bg-white">
              {g.items.map((ev) => {
                const badge = BADGE[ev.event_type] ?? BADGE.expense;
                return (
                  <li key={`${ev.event_type}-${ev.ref_id}`} className="flex items-center gap-3 px-4 py-3.5">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[11px] font-bold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">{ev.title}</p>
                      <p className="truncate text-[13px] text-text-muted">
                        {[ev.detail, timeLabel(ev.occurred_at)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {ev.amount_minor !== null ? (
                      <p className="text-[16px] font-bold tabular-nums">{inr2(Number(ev.amount_minor))}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
