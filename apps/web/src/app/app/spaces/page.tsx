import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRightIcon, PlusIcon } from '../../../components/icons';
import { Container, EmptyState, PageTitle } from '../../../components/ui';
import { requireUser } from '../../../lib/auth';
import { inr0 } from '../../../lib/format';
import { summariseDebts } from '../../../lib/queries';
import { TYPE_TILE, typeLabel } from '../../../lib/space-meta';
import { createClient } from '../../../lib/supabase/server';
import type { BalanceRow, Space } from '../../../lib/types';

export const metadata: Metadata = { title: 'Spaces' };

export default async function SpacesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  let spaces: Space[] = [];
  let balances: BalanceRow[] = [];
  let loadError = false;
  try {
    const s = await supabase
      .from('spaces')
      .select('id,type,name,starts_on,ends_on,budget_minor,currency,status,created_by,created_at')
      .order('created_at', { ascending: false });
    if (s.error) loadError = true;
    spaces = (s.data as Space[] | null) ?? [];
    if (spaces.length) {
      const b = await supabase
        .from('balances')
        .select('*')
        .in(
          'space_id',
          spaces.map((x) => x.id),
        );
      if (b.error) loadError = true;
      balances = (b.data as BalanceRow[] | null) ?? [];
    }
  } catch {
    loadError = true;
  }

  const debts = summariseDebts(balances, user.id);
  const memberCount = new Map<string, number>();
  for (const b of balances) {
    if (!b.left_at) memberCount.set(b.space_id, (memberCount.get(b.space_id) ?? 0) + 1);
  }

  return (
    <Container className="pt-6 md:pt-10">
      <PageTitle
        title="Spaces"
        sub="Everyone you share money with"
        right={
          <Link href="/app/spaces/new" className="btn-dark">
            <PlusIcon width={18} height={18} /> New space
          </Link>
        }
      />

      {loadError ? (
        <p role="status" className="mt-4 rounded-[14px] bg-peach px-3.5 py-2.5 text-[14px] text-rust">
          Some spaces could not be loaded. Try again in a moment.
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {spaces.length === 0 ? (
          <EmptyState
            title="No spaces yet"
            action={{ href: '/app/spaces/new', label: 'Start a space' }}
          >
            Create a space for a trip, your flat, a couple or a group of friends.
          </EmptyState>
        ) : (
          spaces.map((s) => {
            const net = debts.bySpace.get(s.id)?.netMinor ?? 0;
            const people = memberCount.get(s.id);
            return (
              <Link
                key={s.id}
                href={`/app/spaces/${s.id}`}
                className="flex items-center gap-3.5 rounded-[22px] border border-hairline bg-white p-3.5"
              >
                <span
                  className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] text-[20px] font-bold ${TYPE_TILE[s.type]}`}
                  aria-hidden="true"
                >
                  {s.name.trim()[0]?.toUpperCase() ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[18px] font-bold">{s.name}</p>
                  <p className="truncate text-[13.5px] text-text-muted">
                    {typeLabel(s.type)}
                    {people ? ` · ${people} ${people === 1 ? 'person' : 'people'}` : ''}
                    {s.status !== 'active' ? ` · ${s.status}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  {net < 0 ? (
                    <>
                      <p className="text-[12px] font-semibold text-signal">You owe</p>
                      <p className="text-[16px] font-bold text-signal">{inr0(-net)}</p>
                    </>
                  ) : net > 0 ? (
                    <>
                      <p className="text-[12px] font-semibold text-slate">Owed</p>
                      <p className="text-[16px] font-bold text-slate">{inr0(net)}</p>
                    </>
                  ) : (
                    <p className="text-[14px] font-bold text-slate">All square</p>
                  )}
                </div>
                <ChevronRightIcon width={18} height={18} className="shrink-0 text-text-muted" />
              </Link>
            );
          })
        )}
      </div>
    </Container>
  );
}
