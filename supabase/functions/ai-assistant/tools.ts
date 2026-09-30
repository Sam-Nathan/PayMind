// Tools for "Ask PayMind". READ tools query through the caller's RLS-scoped client.
// WRITE tools are propose-only: they insert ai_proposals rows the user must confirm in the app.
import { z } from 'npm:zod@4';
import type { AuthedContext } from '../_shared/auth.ts';
import { saveProposal } from '../_shared/auth.ts';
import type { ToolDef } from '../_shared/ai/index.ts';
import { PaidViaSchema } from '../_shared/schemas.ts';

const Uuid = z.uuid();
const Limit = z.number().int().min(1).max(25).default(10);

const schemas = {
  get_balances: z.object({ spaceId: Uuid.optional() }),
  search_expenses: z.object({
    text: z.string().max(100).optional(),
    spaceId: Uuid.optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
    minAmountMinor: z.number().int().optional(),
    maxAmountMinor: z.number().int().optional(),
    personalOnly: z.boolean().optional(),
    limit: Limit.optional(),
  }),
  get_budget_status: z.object({}),
  get_space_summary: z.object({ spaceId: Uuid }),
  propose_expense: z.object({
    amountMinor: z.number().int().positive(),
    merchant: z.string().max(200).nullable().optional(),
    category: z.string().max(40).nullable().optional(),
    date: z.iso.date().nullable().optional(),
    spaceId: Uuid.nullable().optional(),
    paidByMemberId: Uuid.nullable().optional(),
    paidVia: PaidViaSchema.nullable().optional(),
    splitWithMemberIds: z.array(Uuid).max(30).optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  propose_reminder: z.object({
    memberId: Uuid,
    tone: z.enum(['friendly', 'neutral', 'firm']).default('friendly'),
    repeat: z.enum(['once', 'every_3_days', 'weekly']).default('once'),
  }),
} as const;

export type ToolName = keyof typeof schemas;

export const TOOL_DEFS: ToolDef[] = [
  { name: 'get_balances', description: 'Who owes whom: the caller\'s net balance and every member\'s net balance per space. Positive = is owed money, negative = owes money. Amounts are in paise.', parameters: z.toJSONSchema(schemas.get_balances) as Record<string, unknown> },
  { name: 'search_expenses', description: 'Search confirmed expenses the caller can see (their personal ones and shared ones). Filter by text in the title, space, date range (YYYY-MM-DD), amount range (paise).', parameters: z.toJSONSchema(schemas.search_expenses) as Record<string, unknown> },
  { name: 'get_budget_status', description: 'Budgets (personal and space) with the amount spent so far in the current period and what is left.', parameters: z.toJSONSchema(schemas.get_budget_status) as Record<string, unknown> },
  { name: 'get_space_summary', description: 'Summary of one space: members, total spent, spending by category, balances, latest expenses.', parameters: z.toJSONSchema(schemas.get_space_summary) as Record<string, unknown> },
  { name: 'propose_expense', description: 'PROPOSE adding an expense. Nothing is saved until the user taps Confirm in the app. Use member ids from tool results, never guess ids.', parameters: z.toJSONSchema(schemas.propose_expense) as Record<string, unknown> },
  { name: 'propose_reminder', description: 'PROPOSE sending a payment reminder to a member who owes the user money. Nothing is sent until the user confirms in the app.', parameters: z.toJSONSchema(schemas.propose_reminder) as Record<string, unknown> },
];

export interface ProposalOut {
  id: string;
  kind: string;
  payload: unknown;
}

/** Tool results go to the model (and can surface in its reply): never pass raw database errors. */
function lookupFailed(tool: string, detail: string) {
  console.error('tool lookup failed', tool, detail);
  return { error: 'Could not load that data right now' };
}

function monthBounds(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10);
  return { from, to };
}

export async function runTool(
  ctx: AuthedContext,
  name: string,
  rawArgs: unknown,
  proposals: ProposalOut[],
  model: string,
): Promise<unknown> {
  if (!(name in schemas)) return { error: `Unknown tool ${name}` };
  const parsed = schemas[name as ToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: 'Invalid arguments', issues: parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`) };
  const a = parsed.data as any;
  const db = ctx.supabase;

  switch (name as ToolName) {
    case 'get_balances': {
      let q = db.from('balances').select('space_id, member_id, user_id, display_name, net_minor, paid_minor, owed_minor').is('left_at', null);
      if (a.spaceId) q = q.eq('space_id', a.spaceId);
      const [{ data, error }, { data: spaces }] = await Promise.all([q, db.from('spaces').select('id, name')]);
      if (error) return lookupFailed(name, error.message);
      const names = new Map((spaces ?? []).map((s) => [s.id, s.name]));
      const bySpace = new Map<string, any>();
      for (const r of data ?? []) {
        const s = bySpace.get(r.space_id) ?? { spaceId: r.space_id, spaceName: names.get(r.space_id) ?? null, members: [], myNetMinor: 0 };
        s.members.push({ memberId: r.member_id, name: r.display_name, netMinor: r.net_minor, isMe: r.user_id === ctx.userId });
        if (r.user_id === ctx.userId) s.myNetMinor = r.net_minor;
        bySpace.set(r.space_id, s);
      }
      return { spaces: [...bySpace.values()] };
    }
    case 'search_expenses': {
      let q = db
        .from('expenses')
        .select('id, title, total_minor, occurred_at, space_id, category_id, paid_by_member, source')
        .eq('status', 'confirmed')
        .order('occurred_at', { ascending: false })
        .limit(a.limit ?? 10);
      if (a.text) q = q.ilike('title', `%${String(a.text).replace(/[%_,]/g, ' ')}%`);
      if (a.spaceId) q = q.eq('space_id', a.spaceId);
      if (a.personalOnly) q = q.is('space_id', null);
      if (a.fromDate) q = q.gte('occurred_at', a.fromDate);
      if (a.toDate) q = q.lt('occurred_at', `${a.toDate}T23:59:59.999+05:30`);
      if (a.minAmountMinor != null) q = q.gte('total_minor', a.minAmountMinor);
      if (a.maxAmountMinor != null) q = q.lte('total_minor', a.maxAmountMinor);
      const { data, error } = await q;
      if (error) return lookupFailed(name, error.message);
      const total = (data ?? []).reduce((s, e) => s + e.total_minor, 0);
      return { count: data?.length ?? 0, totalMinor: total, expenses: data ?? [] };
    }
    case 'get_budget_status': {
      const { data: budgets, error } = await db.from('budgets').select('id, owner_id, space_id, scope, period, name, category_id, limit_minor, starts_on, ends_on');
      if (error) return lookupFailed(name, error.message);
      const month = monthBounds();
      const out = [];
      for (const b of budgets ?? []) {
        const from = b.starts_on ?? month.from;
        const to = b.ends_on ?? month.to;
        let q = db.from('expenses').select('total_minor').eq('status', 'confirmed').gte('occurred_at', from).lt('occurred_at', to);
        q = b.space_id ? q.eq('space_id', b.space_id) : q.is('space_id', null);
        if (b.category_id) q = q.eq('category_id', b.category_id);
        const { data: ex } = await q;
        const spent = (ex ?? []).reduce((s, e) => s + e.total_minor, 0);
        out.push({ name: b.name, scope: b.scope, period: b.period, spaceId: b.space_id, limitMinor: b.limit_minor, spentMinor: spent, leftMinor: b.limit_minor - spent, from, to, note: b.space_id ? undefined : 'personal expenses only' });
      }
      return { budgets: out };
    }
    case 'get_space_summary': {
      const [space, members, bal, exp, cats] = await Promise.all([
        db.from('spaces').select('id, name, type, budget_minor, starts_on, ends_on, status').eq('id', a.spaceId).maybeSingle(),
        db.from('space_members').select('id, display_name, role, left_at').eq('space_id', a.spaceId),
        db.from('balances').select('member_id, display_name, net_minor, paid_minor, owed_minor').eq('space_id', a.spaceId),
        db.from('expenses').select('id, title, total_minor, occurred_at, category_id').eq('space_id', a.spaceId).eq('status', 'confirmed').order('occurred_at', { ascending: false }).limit(200),
        db.from('categories').select('id, name'),
      ]);
      if (!space.data) return { error: 'Space not found' };
      const catName = new Map((cats.data ?? []).map((c) => [c.id, c.name]));
      const byCat = new Map<string, number>();
      let total = 0;
      for (const e of exp.data ?? []) {
        total += e.total_minor;
        const k = e.category_id ? (catName.get(e.category_id) ?? 'Other') : 'Uncategorised';
        byCat.set(k, (byCat.get(k) ?? 0) + e.total_minor);
      }
      return {
        space: space.data,
        members: members.data ?? [],
        balances: bal.data ?? [],
        totalSpentMinor: total,
        expenseCount: exp.data?.length ?? 0,
        byCategory: [...byCat.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([category, totalMinor]) => ({ category, totalMinor })),
        latest: (exp.data ?? []).slice(0, 5),
      };
    }
    case 'propose_expense': {
      const payload = { source: 'assistant', expense: a };
      const id = await saveProposal(ctx, { kind: 'create_expense', spaceId: a.spaceId ?? null, payload, model });
      proposals.push({ id, kind: 'create_expense', payload });
      return { proposalId: id, status: 'pending_user_confirmation', note: 'Tell the user it needs their OK; it is not saved yet.' };
    }
    case 'propose_reminder': {
      const { data: m } = await db.from('space_members').select('id, space_id, display_name').eq('id', a.memberId).maybeSingle();
      if (!m) return { error: 'Member not found' };
      const payload = { memberId: a.memberId, memberName: m.display_name, spaceId: m.space_id, tone: a.tone, repeat: a.repeat };
      const id = await saveProposal(ctx, { kind: 'reminder', spaceId: m.space_id, payload, model });
      proposals.push({ id, kind: 'reminder', payload });
      return { proposalId: id, status: 'pending_user_confirmation', note: 'Tell the user it needs their OK; nothing is sent yet.' };
    }
  }
}
