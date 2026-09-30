import { z } from 'npm:zod@4';
import { getPrivacy, requireUser } from '../_shared/auth.ts';
import { HttpError, json, readJson, serveJson } from '../_shared/http.ts';

// Parsing happens on-device (packages/core). Only these minimal fields are accepted;
// anything else (notably raw notification / SMS text) is rejected.
const ItemSchema = z
  .object({
    direction: z.enum(['debit', 'credit']),
    amountMinor: z.number().int().positive().max(10_000_000_000),
    payee: z.string().trim().max(120).nullish(),
    vpa: z.string().trim().max(100).nullish(),
    occurredAt: z.iso.datetime({ offset: true, local: true }),
    app: z.enum(['phonepe', 'gpay', 'paytm', 'bhim']).nullish(),
    dedupeHash: z.string().trim().min(8).max(128).optional(),
    dedupe_hash: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

const BodySchema = z.object({ items: z.array(z.unknown()).min(1).max(50) });

interface Rule {
  id: string;
  kind: string;
  match: Record<string, unknown>;
  action: Record<string, unknown>;
  hits: number;
}

const low = (s: string | null | undefined) => (s ?? '').toLowerCase();

function ruleMatches(rule: Rule, t: { payee: string | null; vpa: string | null }): boolean {
  const m = rule.match;
  const vpa = typeof m.vpa === 'string' ? m.vpa.toLowerCase() : null;
  const payee = typeof m.payee === 'string' ? m.payee.toLowerCase() : typeof m.raw === 'string' ? m.raw.toLowerCase() : null;
  if (vpa && low(t.vpa) === vpa) return true;
  if (payee && payee.length >= 3 && low(t.payee).includes(payee)) return true;
  return false;
}

Deno.serve(
  serveJson(async (req) => {
    const ctx = await requireUser(req);
    const body = BodySchema.safeParse(await readJson(req, 1_000_000));
    if (!body.success) throw new HttpError(400, 'invalid_request', 'Send {items: [...]} with 1 to 50 items');
    const privacy = await getPrivacy(ctx);
    if (!privacy.capture_notifications) {
      throw new HttpError(403, 'capture_disabled', 'Auto-capture is off in Privacy & data.');
    }

    const rejected: { index: number; reason: string }[] = [];
    const valid: { idx: number; hash: string; t: z.infer<typeof ItemSchema>; occurred: string }[] = [];
    const seenHashes = new Set<string>();
    let duplicates = 0;

    body.data.items.forEach((raw, idx) => {
      if (raw && typeof raw === 'object') {
        for (const v of Object.values(raw as Record<string, unknown>)) {
          if (typeof v === 'string' && v.length > 500) {
            rejected.push({ index: idx, reason: 'raw_text_not_allowed: send only parsed fields, never full notification text' });
            return;
          }
        }
      }
      const p = ItemSchema.safeParse(raw);
      if (!p.success) {
        const unknownKey = p.error.issues.find((i) => i.code === 'unrecognized_keys');
        rejected.push({ index: idx, reason: unknownKey ? `unexpected_field: ${(unknownKey as any).keys?.join(',')}` : `invalid_item: ${p.error.issues[0]?.path.join('.')} ${p.error.issues[0]?.message}` });
        return;
      }
      const hash = p.data.dedupeHash ?? p.data.dedupe_hash;
      if (!hash) {
        rejected.push({ index: idx, reason: 'invalid_item: dedupeHash is required' });
        return;
      }
      const occurred = new Date(p.data.occurredAt.match(/(Z|[+-]\d\d:?\d\d)$/) ? p.data.occurredAt : `${p.data.occurredAt}+05:30`);
      if (Number.isNaN(occurred.getTime())) {
        rejected.push({ index: idx, reason: 'invalid_item: occurredAt' });
        return;
      }
      if (seenHashes.has(hash)) {
        duplicates++;
        return;
      }
      seenHashes.add(hash);
      valid.push({ idx, hash, t: p.data, occurred: occurred.toISOString() });
    });

    if (valid.length === 0) return json({ inserted: 0, duplicates, rejected, items: [] });

    // Drop hashes we already have (notification + SMS for the same payment is normal).
    const { data: existing, error: exErr } = await ctx.supabase
      .from('captured_txns')
      .select('dedupe_hash')
      .eq('user_id', ctx.userId)
      .in('dedupe_hash', valid.map((v) => v.hash));
    if (exErr) throw new HttpError(500, 'lookup_failed', 'Could not check for duplicates');
    const have = new Set((existing ?? []).map((r) => r.dedupe_hash));
    const fresh = valid.filter((v) => {
      if (have.has(v.hash)) {
        duplicates++;
        return false;
      }
      return true;
    });
    if (fresh.length === 0) return json({ inserted: 0, duplicates, rejected, items: [] });

    // Learned rules + known merchants -> suggested category.
    const [rulesRes, catsRes, aliasRes] = await Promise.all([
      ctx.supabase.from('learned_rules').select('id, kind, match, action, hits').in('kind', ['category', 'merchant']),
      ctx.supabase.from('categories').select('id, slug'),
      (() => {
        const vpas = [...new Set(fresh.map((f) => low(f.t.vpa)).filter(Boolean))];
        return vpas.length
          ? ctx.supabase.from('merchant_aliases').select('vpa, merchants(category_id)').in('vpa', vpas)
          : Promise.resolve({ data: [] as any[] });
      })(),
    ]);
    const rules = (rulesRes.data ?? []) as unknown as Rule[];
    const slugToId = new Map((catsRes.data ?? []).map((c) => [c.slug, c.id]));
    const aliasCat = new Map<string, string>();
    for (const a of (aliasRes.data ?? []) as any[]) {
      const cid = a.merchants?.category_id;
      if (a.vpa && cid) aliasCat.set(String(a.vpa).toLowerCase(), cid);
    }

    // Recurring detection: same payee/vpa, similar amount, seen at least twice before, days apart.
    const payees = [...new Set(fresh.map((f) => f.t.payee).filter((x): x is string => !!x))];
    const vpaSet = [...new Set(fresh.map((f) => low(f.t.vpa)).filter(Boolean))];
    const since = new Date(Date.now() - 120 * 86400_000).toISOString();
    let history: { payee: string | null; vpa: string | null; amount_minor: number; occurred_at: string }[] = [];
    if (payees.length || vpaSet.length) {
      const ors = [
        ...(payees.length ? [`payee.in.(${payees.map((p) => `"${p.replace(/"/g, '')}"`).join(',')})`] : []),
        ...(vpaSet.length ? [`vpa.in.(${vpaSet.map((v) => `"${v.replace(/"/g, '')}"`).join(',')})`] : []),
      ].join(',');
      const { data } = await ctx.supabase
        .from('captured_txns')
        .select('payee, vpa, amount_minor, occurred_at')
        .gte('occurred_at', since)
        .or(ors)
        .limit(500);
      history = data ?? [];
    }

    const usedRules = new Map<string, number>();
    const rows = fresh.map((f) => {
      const t = { payee: f.t.payee ?? null, vpa: f.t.vpa ? f.t.vpa.toLowerCase() : null };
      let categoryId: string | null = null;
      if (f.t.direction === 'debit') {
        for (const r of rules) {
          if (!ruleMatches(r, t)) continue;
          const a = r.action;
          const id = typeof a.category_id === 'string' ? a.category_id : typeof a.category_slug === 'string' ? slugToId.get(a.category_slug) : undefined;
          if (id) {
            categoryId = id;
            usedRules.set(r.id, (usedRules.get(r.id) ?? 0) + 1);
            break;
          }
        }
        if (!categoryId && t.vpa) categoryId = aliasCat.get(t.vpa) ?? null;
      }
      let recurring = false;
      if (f.t.direction === 'debit') {
        const similar = history.filter(
          (h) =>
            ((t.vpa && low(h.vpa) === t.vpa) || (t.payee && h.payee === t.payee)) &&
            Math.abs(h.amount_minor - f.t.amountMinor) <= Math.max(100, f.t.amountMinor * 0.05),
        );
        const days = similar.map((h) => new Date(h.occurred_at).getTime());
        const spread = days.length >= 2 && Math.max(...days) - Math.min(...days) >= 6 * 86400_000;
        recurring = similar.length >= 2 && spread;
      }
      return {
        dedupeHash: f.hash,
        row: {
          user_id: ctx.userId,
          source: f.t.app ? ('upi_notification' as const) : ('sms' as const),
          parsed: { direction: f.t.direction, app: f.t.app ?? null, ...(recurring ? { recurring_hint: true } : {}) },
          amount_minor: f.t.amountMinor,
          payee: f.t.payee ?? null,
          vpa: t.vpa,
          occurred_at: f.occurred,
          status: 'inbox' as const,
          dedupe_hash: f.hash,
          suggested_category_id: categoryId,
        },
        recurring,
        categoryId,
      };
    });

    // Idempotent on (user_id, dedupe_hash): a concurrent duplicate is silently skipped.
    const { data: inserted, error: insErr } = await ctx.supabase
      .from('captured_txns')
      .upsert(rows.map((r) => r.row), { onConflict: 'user_id,dedupe_hash', ignoreDuplicates: true })
      .select('id, dedupe_hash');
    if (insErr) {
      console.error('insert failed', insErr.message);
      throw new HttpError(500, 'insert_failed', 'Could not save the captured transactions');
    }
    const idByHash = new Map((inserted ?? []).map((r) => [r.dedupe_hash, r.id]));
    duplicates += rows.length - idByHash.size;

    // Best-effort: count rule applications.
    const now = new Date().toISOString();
    await Promise.all(
      [...usedRules.entries()].map(([id, n]) => {
        const r = rules.find((x) => x.id === id)!;
        return ctx.supabase.from('learned_rules').update({ hits: r.hits + n, last_applied_at: now }).eq('id', id);
      }),
    ).catch(() => {});

    return json({
      inserted: idByHash.size,
      duplicates,
      rejected,
      items: rows
        .filter((r) => idByHash.has(r.dedupeHash))
        .map((r) => ({ id: idByHash.get(r.dedupeHash), dedupeHash: r.dedupeHash, suggestedCategoryId: r.categoryId, recurringHint: r.recurring })),
    });
  }),
);
