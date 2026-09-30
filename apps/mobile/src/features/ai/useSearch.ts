import AsyncStorage from '@react-native-async-storage/async-storage';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toMinor } from '../../data/mappers.ts';
import { supabase } from '../../lib/supabase.ts';
import { useAuth } from '../../providers/AuthProvider.tsx';
import { termPatterns, type SearchFilter } from './searchQuery.ts';

export const PAGE_SIZE = 30;
const SUMMARY_CAP = 1000;

export interface SearchRow {
  id: string;
  title: string;
  totalMinor: number;
  occurredAt: string;
  spaceId: string | null;
}

export interface Alias {
  merchantId: string;
  text: string;
}

export interface MerchantMatch {
  merchantIds: string[];
  names: string[];
  aliases: Alias[];
}

const searchKeys = {
  merchants: (uid: string | undefined, term: string) => ['ai', 'search-merchants', uid, term] as const,
  members: (uid: string | undefined, names: string) => ['ai', 'search-members', uid, names] as const,
  summary: (uid: string | undefined, plan: string) => ['ai', 'search-summary', uid, plan] as const,
  rows: (uid: string | undefined, plan: string) => ['ai', 'search-rows', uid, plan] as const,
  people: (uid: string | undefined) => ['ai', 'search-people', uid] as const,
};

const localStart = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toISOString();
};

/** Display names of everyone in the user's spaces, for recognising "Rahul" in a query. */
export function usePeopleNames() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: searchKeys.people(uid),
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('space_members').select('display_name').limit(500);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.display_name).filter(Boolean)));
    },
  });
}

/** Merchants whose name or aliases (raw text or UPI id) match the search words. */
function useMerchantMatch(term: string) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const patterns = termPatterns(term);
  return useQuery({
    queryKey: searchKeys.merchants(uid, term),
    enabled: !!uid && patterns.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<MerchantMatch> => {
      const nameOr = patterns.map((p) => `canonical_name.ilike.*${p}*`).join(',');
      const aliasOr = patterns.flatMap((p) => [`raw_text.ilike.*${p}*`, `vpa.ilike.*${p}*`]).join(',');
      const [byName, byAlias] = await Promise.all([
        supabase.from('merchants').select('id, canonical_name').or(nameOr).limit(20),
        supabase.from('merchant_aliases').select('merchant_id, raw_text, vpa').or(aliasOr).limit(40),
      ]);
      if (byName.error) throw byName.error;
      if (byAlias.error) throw byAlias.error;
      const ids = new Set<string>();
      const names: string[] = [];
      for (const m of byName.data ?? []) {
        ids.add(m.id);
        names.push(m.canonical_name);
      }
      const aliases: Alias[] = [];
      for (const a of byAlias.data ?? []) {
        if (a.merchant_id) ids.add(a.merchant_id);
        const text = a.raw_text || a.vpa;
        if (a.merchant_id && text) aliases.push({ merchantId: a.merchant_id, text });
      }
      return { merchantIds: [...ids], names, aliases };
    },
  });
}

/** Member ids for the people named in the query (first-name prefix match). */
function useMemberIds(names: string[]) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = names.join('|').toLowerCase();
  return useQuery({
    queryKey: searchKeys.members(uid, key),
    enabled: !!uid && names.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const or = names.map((n) => `display_name.ilike.${n.replace(/[,()%*\\"':;]/g, ' ').trim()}*`).join(',');
      const { data, error } = await supabase.from('space_members').select('id').or(or).limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => r.id);
    },
  });
}

interface Plan {
  term: string;
  merchantIds: string[];
  filters: SearchFilter[];
  memberIds: string[] | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applyPlan(q: any, plan: Plan): any {
  let out = q.neq('status', 'void');
  for (const f of plan.filters) {
    if (f.kind === 'min') out = out.gte('total_minor', f.minMinor);
    else if (f.kind === 'max') out = out.lte('total_minor', f.maxMinor);
    else if (f.kind === 'period') out = out.gte('occurred_at', localStart(f.from)).lt('occurred_at', localStart(f.to));
    else if (f.kind === 'space') out = out.eq('space_id', f.spaceId);
  }
  if (plan.memberIds) out = out.in('expense_shares.member_id', plan.memberIds);
  const patterns = termPatterns(plan.term);
  if (patterns.length > 0) {
    const parts = patterns.map((p) => `title.ilike.*${p}*`);
    if (plan.merchantIds.length > 0) parts.push(`merchant_id.in.(${plan.merchantIds.join(',')})`);
    out = out.or(parts.join(','));
  }
  return out;
}

const selectFor = (plan: Plan, cols: string) => (plan.memberIds ? `${cols}, expense_shares!inner(member_id)` : cols);

export interface SearchSummary {
  totalMinor: number;
  count: number;
  averageMinor: number;
  capped: boolean;
}

/**
 * Text + filter search over the user's visible expenses (RLS decides visibility). Merchant
 * names, aliases and descriptions are matched with ilike; results are paged for a FlatList.
 */
export function useExpenseSearch(term: string, filters: SearchFilter[], enabled: boolean) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const merchants = useMerchantMatch(term);
  const personNames = filters.filter((f) => f.kind === 'person').map((f) => (f as { person: string }).person);
  const members = useMemberIds(personNames);
  const ready =
    enabled &&
    !!uid &&
    (termPatterns(term).length === 0 || !merchants.isPending) &&
    (personNames.length === 0 || !members.isPending);
  const noSuchPerson = personNames.length > 0 && members.isSuccess && members.data.length === 0;

  const plan: Plan = {
    term,
    merchantIds: merchants.data?.merchantIds ?? [],
    filters,
    memberIds: personNames.length > 0 ? (members.data ?? []) : null,
  };
  const planKey = JSON.stringify([plan.term, plan.merchantIds, plan.filters.map((f) => f.key), plan.memberIds]);

  const rows = useInfiniteQuery({
    queryKey: searchKeys.rows(uid, planKey),
    enabled: ready && !noSuchPerson,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<SearchRow[]> => {
      const base: any = supabase.from('expenses').select(selectFor(plan, 'id, title, total_minor, occurred_at, space_id'));
      const { data, error } = await applyPlan(base, plan)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        totalMinor: toMinor(r.total_minor),
        occurredAt: r.occurred_at,
        spaceId: r.space_id,
      }));
    },
    getNextPageParam: (last, all) => (last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE),
  });

  const summary = useQuery({
    queryKey: searchKeys.summary(uid, planKey),
    enabled: ready && !noSuchPerson,
    queryFn: async (): Promise<SearchSummary> => {
      const base: any = supabase.from('expenses').select(selectFor(plan, 'total_minor'));
      const { data, error } = await applyPlan(base, plan).limit(SUMMARY_CAP);
      if (error) throw error;
      const list = (data ?? []) as { total_minor: number | string }[];
      const totalMinor = list.reduce((a, r) => a + toMinor(r.total_minor), 0);
      return {
        totalMinor,
        count: list.length,
        averageMinor: list.length > 0 ? Math.round(totalMinor / list.length) : 0,
        capped: list.length >= SUMMARY_CAP,
      };
    },
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    rows,
    summary,
    merchants: merchants.data ?? null,
    noSuchPerson,
    flat: (rows.data?.pages ?? []).flat(),
  };
}

// ---------------------------------------------------------------------------
// Recent searches: a per-device convenience, so failures are silent.

const RECENT_KEY = 'paymind.search.recent';

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (v) setRecent(JSON.parse(v) as string[]);
      })
      .catch(() => {});
  }, []);
  const remember = useCallback((q: string) => {
    const text = q.trim();
    if (!text) return;
    setRecent((prev) => {
      const next = [text, ...prev.filter((p) => p.toLowerCase() !== text.toLowerCase())].slice(0, 6);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  return { recent, remember };
}
