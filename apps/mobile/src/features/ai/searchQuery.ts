/**
 * Simple natural-language parsing for the Search screen: "Uber this year", "involving Rahul",
 * "above 5000", "groceries in Aug". Everything it can't recognise is left as the text to match
 * against merchant names, aliases and descriptions.
 */
import { formatINR, rupeesToPaise } from '@paymind/core';

export type SearchFilter =
  | { kind: 'min'; key: string; label: string; minMinor: number }
  | { kind: 'max'; key: string; label: string; maxMinor: number }
  | { kind: 'period'; key: string; label: string; from: string; to: string }
  | { kind: 'person'; key: string; label: string; person: string }
  | { kind: 'space'; key: string; label: string; spaceId: string };

export interface ParsedSearch {
  /** words to match on merchant / alias / description; may be empty */
  term: string;
  filters: SearchFilter[];
}

export interface SearchContext {
  now: Date;
  /** display names of people in the user's spaces */
  people?: readonly string[];
  spaces?: readonly { id: string; name: string }[];
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d\d))?/i;

const STOPWORDS = new Set([
  'how', 'much', 'did', 'do', 'i', 'my', 'me', 'we', 'spend', 'spent', 'spending', 'on', 'in', 'for', 'the', 'a', 'an', 'all',
  'show', 'find', 'search', 'expenses', 'expense', 'payments', 'payment', 'total', 'of', 'at', 'from', 'to', 'and', 'with',
  'what', 'was', 'were', 'is', 'are', 'involving', 'split', 'shared', 'than', 'more', 'less', 'above', 'below', 'over', 'under',
]);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d = 1) => `${y}-${pad(m + 1)}-${pad(d)}`;

function monthRange(year: number, month: number): { from: string; to: string } {
  const ny = month === 11 ? year + 1 : year;
  const nm = month === 11 ? 0 : month + 1;
  return { from: iso(year, month), to: iso(ny, nm) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseAmount(raw: string, unit: string | undefined): number | null {
  try {
    const n = rupeesToPaise(raw);
    const u = (unit ?? '').toLowerCase();
    const mult = u === 'k' ? 1000 : u === 'l' || u === 'lakh' || u === 'lakhs' ? 100000 : 1;
    const v = n * mult;
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function parseSearchQuery(query: string, ctx: SearchContext): ParsedSearch {
  let rest = ` ${query.replace(/[·|]/g, ' ')} `;
  const filters: SearchFilter[] = [];
  const now = ctx.now;
  const year = now.getFullYear();

  // Amounts: "above 5000", "over ₹5,000", "under 2k"
  const AMT = '(?:₹|rs\\.?|inr)?\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*(k|lakhs?|l)?\\b';
  const minRe = new RegExp(`\\b(?:above|over|more than|greater than|at least|min(?:imum)?)\\s*${AMT}|>\\s*${AMT}`, 'i');
  const maxRe = new RegExp(`\\b(?:below|under|less than|at most|max(?:imum)?|upto|up to)\\s*${AMT}|<\\s*${AMT}`, 'i');
  const minM = minRe.exec(rest);
  if (minM) {
    const v = parseAmount((minM[1] ?? minM[3]) as string, (minM[2] ?? minM[4]) as string | undefined);
    if (v) filters.push({ kind: 'min', key: 'min', label: `Above ${formatINR(v, { decimals: 0 })}`, minMinor: v });
    rest = rest.replace(minM[0], ' ');
  }
  const maxM = maxRe.exec(rest);
  if (maxM) {
    const v = parseAmount((maxM[1] ?? maxM[3]) as string, (maxM[2] ?? maxM[4]) as string | undefined);
    if (v) filters.push({ kind: 'max', key: 'max', label: `Under ${formatINR(v, { decimals: 0 })}`, maxMinor: v });
    rest = rest.replace(maxM[0], ' ');
  }

  // Periods
  const period = (label: string, from: string, to: string) => filters.push({ kind: 'period', key: 'period', label, from, to });
  if (/\bthis year\b/i.test(rest)) {
    period('This year', iso(year, 0), iso(year + 1, 0));
    rest = rest.replace(/\bthis year\b/i, ' ');
  } else if (/\blast year\b/i.test(rest)) {
    period('Last year', iso(year - 1, 0), iso(year, 0));
    rest = rest.replace(/\blast year\b/i, ' ');
  } else if (/\bthis month\b/i.test(rest)) {
    const r = monthRange(year, now.getMonth());
    period('This month', r.from, r.to);
    rest = rest.replace(/\bthis month\b/i, ' ');
  } else if (/\blast month\b/i.test(rest)) {
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const y = now.getMonth() === 0 ? year - 1 : year;
    const r = monthRange(y, m);
    period('Last month', r.from, r.to);
    rest = rest.replace(/\blast month\b/i, ' ');
  } else {
    const mm = MONTH_RE.exec(rest);
    if (mm) {
      const idx = MONTHS.findIndex((m) => m.startsWith((mm[1] as string).toLowerCase().slice(0, 3)));
      const y = mm[2] ? Number(mm[2]) : idx > now.getMonth() ? year - 1 : year;
      const r = monthRange(y, idx);
      period(`${cap((MONTHS[idx] as string).slice(0, 3))}${y !== year ? ` ${y}` : ''}`, r.from, r.to);
      rest = rest.replace(MONTH_RE, ' ');
    } else {
      const ym = /\b(?:in\s+)?(20\d\d)\b/.exec(rest);
      if (ym) {
        const y = Number(ym[1]);
        period(String(y), iso(y, 0), iso(y + 1, 0));
        rest = rest.replace(ym[0], ' ');
      }
    }
  }

  // Spaces the user named
  for (const s of ctx.spaces ?? []) {
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(s.name)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    if (s.name.length >= 3 && re.test(rest)) {
      filters.push({ kind: 'space', key: `space:${s.id}`, label: s.name, spaceId: s.id });
      rest = rest.replace(re, ' ');
    }
  }

  // People: known names, then "involving X" / "with X"
  const seen = new Set<string>();
  const addPerson = (name: string) => {
    const k = name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    filters.push({ kind: 'person', key: `person:${k}`, label: `Involving ${cap(name)}`, person: name });
  };
  const involving = /\b(?:involving|split with|shared with|with)\s+([A-Za-z][A-Za-z'’-]*)/gi;
  for (const m of rest.matchAll(involving)) addPerson(m[1] as string);
  rest = rest.replace(involving, ' ');
  for (const name of ctx.people ?? []) {
    const first = name.trim().split(/\s+/)[0] ?? '';
    if (first.length < 2) continue;
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(first)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    if (re.test(rest)) {
      addPerson(first);
      rest = rest.replace(re, ' ');
    }
  }

  const term = rest
    .split(/[^\p{L}\p{N}'&*.@-]+/u)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase()))
    .join(' ')
    .trim();
  return { term, filters };
}

/** Drop the filters the user switched off by tapping their chip. */
export function enabledFilters(p: ParsedSearch, disabled: ReadonlySet<string>): SearchFilter[] {
  return p.filters.filter((f) => !disabled.has(f.key));
}

/** Characters that would break a PostgREST `or=(...)` / ilike pattern are dropped. */
export function sanitizeTerm(s: string): string {
  return s.replace(/[,()%*\\"':;]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Words to OR together for the text match (whole phrase first, then each word of 3+ letters). */
export function termPatterns(term: string): string[] {
  const clean = sanitizeTerm(term);
  if (!clean) return [];
  const words = clean.split(' ').filter((w) => w.length >= 3);
  return Array.from(new Set([clean, ...words]));
}

export function periodText(filters: readonly SearchFilter[]): string | null {
  const p = filters.find((f) => f.kind === 'period');
  return p ? p.label : null;
}
