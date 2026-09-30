import { buildUpiUri, isValidVpa } from '@paymind/core';
import { createAnonClient } from './supabase/anon';
import type { PayLink } from './types';

export interface ResolvedPayLink extends PayLink {
  uri: string | null;
}

/** Resolve a public pay-link token. Returns null for invalid/expired tokens or when the lookup fails. */
export async function resolvePayLink(token: string): Promise<ResolvedPayLink | null> {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(token)) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc('get_pay_link', { p_token: token });
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) return null;

    const amount = Number(row.amount_minor);
    const vpa = String(row.upi_vpa ?? '');
    const name = String(row.payee_name ?? row.name ?? row.payee ?? '').trim();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !name) return null;

    const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
    const items = rawItems.map((i) => ({
      space: String(i.space ?? ''),
      description: String(i.description ?? ''),
      amount_minor: Number(i.amount_minor) || 0,
    }));
    const noteRef = row.note_ref ? String(row.note_ref) : null;

    let uri: string | null = null;
    if (isValidVpa(vpa)) {
      try {
        uri = buildUpiUri({
          pa: vpa,
          pn: name,
          am: amount,
          ...(noteRef ? { tn: noteRef, tr: noteRef.slice(0, 35) } : {}),
        });
      } catch {
        uri = null;
      }
    }
    return { payee_name: name, upi_vpa: vpa, amount_minor: amount, note_ref: noteRef, items, uri };
  } catch {
    return null;
  }
}
