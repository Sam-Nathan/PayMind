// Run: deno test supabase/functions/_shared/detective.test.ts
import { detectBillFlags } from './detective.ts';
import { BillParseResultSchema } from './schemas.ts';
import { z } from 'npm:zod@4';

const base = {
  merchant: 'Tandoor House',
  location: null,
  datetime: null,
  items: [
    { name: 'Butter Naan', qty: 4, unitPriceMinor: 6000, amountMinor: 24000 },
    { name: 'Butter Naan', qty: 1, unitPriceMinor: 6000, amountMinor: 6000 },
    { name: 'Paneer Tikka', qty: 1, unitPriceMinor: 30000, amountMinor: 30000 },
  ],
  subtotalMinor: 60000,
  discounts: [],
  serviceCharge: { label: 'Service charge', ratePct: 10, amountMinor: 6000 },
  tax: [{ label: 'GST', ratePct: 5, amountMinor: 3300 }],
  tipMinor: null,
  totalMinor: 69300,
  currency: 'INR' as const,
};

Deno.test('detective flags duplicate line and service charge, stays quiet on a clean total', () => {
  const bill = BillParseResultSchema.parse(base);
  const types = detectBillFlags(bill).map((f) => f.type);
  if (!types.includes('possible_duplicate_line')) throw new Error('missing duplicate flag');
  if (!types.includes('service_charge')) throw new Error('missing service charge flag');
  for (const t of ['total_mismatch', 'subtotal_mismatch', 'price_mismatch', 'tax_mismatch']) {
    if (types.includes(t as never)) throw new Error(`unexpected ${t}`);
  }
});

Deno.test('detective flags arithmetic problems', () => {
  const bill = BillParseResultSchema.parse({
    ...base,
    items: [{ name: 'Naan', qty: 4, unitPriceMinor: 6000, amountMinor: 30000 }],
    subtotalMinor: 24000,
    totalMinor: 99999,
    tax: [{ label: 'GST', ratePct: 7, amountMinor: 1680 }],
  });
  const types = detectBillFlags(bill).map((f) => f.type);
  for (const t of ['price_mismatch', 'subtotal_mismatch', 'total_mismatch', 'tax_mismatch']) {
    if (!types.includes(t as never)) throw new Error(`missing ${t}`);
  }
});

Deno.test('zod can produce JSON schemas for the AI outputs', () => {
  const s = z.toJSONSchema(BillParseResultSchema) as { properties?: Record<string, unknown> };
  if (!s.properties?.items) throw new Error('no items in schema');
});
