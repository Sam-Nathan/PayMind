// Bill Detective: deterministic checks on a parsed bill. "Explain, don't accuse": every flag
// states what we noticed and what the options are, never that someone did something wrong.
import type { BillFlag, BillParseResult } from './schemas.ts';

const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupees = (minor: number) => `₹${nf.format(minor / 100)}`;

/** Bills are rounded to the nearest rupee, so totals may differ by up to ₹1. */
const ROUND_OFF_TOLERANCE = 100;
/** Standard GST slabs, including the half-rates printed as CGST / SGST, and cess-free special rates. */
const GST_RATES = [0, 0.25, 1.5, 2.5, 3, 5, 6, 9, 12, 14, 18, 20, 28, 40];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-෿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3))));

export function detectBillFlags(bill: BillParseResult): BillFlag[] {
  const flags: BillFlag[] = [];
  const add = (f: Omit<BillFlag, 'resolution'>) => flags.push({ ...f, resolution: null });
  const items = bill.items;

  // 1. qty x price vs printed line amount
  items.forEach((it, i) => {
    if (it.unitPriceMinor == null) return;
    const expected = Math.round(it.qty * it.unitPriceMinor);
    if (Math.abs(expected - it.amountMinor) > 1) {
      add({
        type: 'price_mismatch',
        lineIndex: i,
        amountMinor: it.amountMinor - expected,
        reason:
          `${it.name}: ${qtyText(it.qty)} × ${rupees(it.unitPriceMinor)} comes to ${rupees(expected)}, ` +
          `but the bill shows ${rupees(it.amountMinor)}. The price may have changed or the line may be misread, so please check it.`,
      });
    }
  });

  // 2. possible duplicate lines
  const seen = new Map<string, number>();
  items.forEach((it, i) => {
    const key = norm(it.name);
    if (!key) return;
    const prev = i > 0 && norm(items[i - 1].name) === key ? items[i - 1] : null;
    if (prev && prev.qty >= it.qty) {
      add({
        type: 'possible_duplicate_line',
        lineIndex: i,
        amountMinor: it.amountMinor,
        reason:
          `${it.name} appears twice in a row (${qtyText(prev.qty)}, then ${qtyText(it.qty)}). ` +
          `If you ordered ${qtyText(prev.qty + it.qty)} in total, keep both. If the second line is a double entry, remove it (${rupees(it.amountMinor)}).`,
      });
    } else {
      const j = seen.get(`${key}|${it.qty}|${it.amountMinor}`);
      if (j !== undefined && !(prev && prev.qty >= it.qty)) {
        add({
          type: 'possible_duplicate_line',
          lineIndex: i,
          amountMinor: it.amountMinor,
          reason: `${it.name} (${qtyText(it.qty)} for ${rupees(it.amountMinor)}) shows up more than once. You may have ordered it again, so please confirm.`,
        });
      }
    }
    seen.set(`${key}|${it.qty}|${it.amountMinor}`, i);
  });

  // 3. printed subtotal vs sum of items
  const itemsSum = items.reduce((a, it) => a + it.amountMinor, 0);
  if (bill.subtotalMinor != null && items.length > 0 && Math.abs(itemsSum - bill.subtotalMinor) > ROUND_OFF_TOLERANCE) {
    const diff = itemsSum - bill.subtotalMinor;
    add({
      type: 'subtotal_mismatch',
      lineIndex: null,
      amountMinor: diff,
      reason:
        `The items add up to ${rupees(itemsSum)}, but the bill's subtotal says ${rupees(bill.subtotalMinor)} ` +
        `(${rupees(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}). A line may be missing, extra or misread.`,
    });
  }
  const base = bill.subtotalMinor ?? itemsSum;
  const discountTotal = bill.discounts.reduce((a, d) => a + d.amountMinor, 0);

  // 4. service charge
  if (bill.serviceCharge && bill.serviceCharge.amountMinor > 0) {
    const sc = bill.serviceCharge;
    const pct = sc.ratePct != null ? ` (${sc.ratePct}%)` : '';
    add({
      type: 'service_charge',
      lineIndex: null,
      amountMinor: sc.amountMinor,
      reason:
        `A ${sc.label || 'service charge'}${pct} of ${rupees(sc.amountMinor)} was added. It is optional: you can ask the restaurant to remove it, ` +
        `or keep it. Tell us which, and we'll split the bill accordingly.`,
    });
  }

  // 5. GST sanity
  const taxBase = Math.max(0, base - discountTotal + (bill.serviceCharge?.amountMinor ?? 0));
  for (const t of bill.tax) {
    if (t.ratePct == null) continue;
    if (!GST_RATES.includes(t.ratePct)) {
      add({
        type: 'tax_mismatch',
        lineIndex: null,
        amountMinor: t.amountMinor,
        reason: `${t.label} is printed as ${t.ratePct}%, which is not one of the usual GST rates (5%, 18%, 40% or their CGST / SGST halves). It may be misread, so please check it.`,
      });
      continue;
    }
    const candidates = [
      Math.round((base - discountTotal) * t.ratePct / 100),
      Math.round(taxBase * t.ratePct / 100),
      Math.round(base * t.ratePct / 100),
    ];
    const closest = candidates.reduce((a, c) => (Math.abs(c - t.amountMinor) < Math.abs(a - t.amountMinor) ? c : a));
    if (Math.abs(closest - t.amountMinor) > Math.max(ROUND_OFF_TOLERANCE, closest * 0.02)) {
      add({
        type: 'tax_mismatch',
        lineIndex: null,
        amountMinor: t.amountMinor - closest,
        reason:
          `${t.label} at ${t.ratePct}% should be about ${rupees(closest)} on this bill, but ${rupees(t.amountMinor)} is charged. ` +
          `The rate or amount may have been misread, or other charges may be included.`,
      });
    }
  }

  // 6. total arithmetic
  const expectedTotal =
    base - discountTotal +
    (bill.serviceCharge?.amountMinor ?? 0) +
    bill.tax.reduce((a, t) => a + t.amountMinor, 0) +
    (bill.tipMinor ?? 0);
  if (items.length > 0 && Math.abs(expectedTotal - bill.totalMinor) > ROUND_OFF_TOLERANCE) {
    const diff = bill.totalMinor - expectedTotal;
    add({
      type: 'total_mismatch',
      lineIndex: null,
      amountMinor: diff,
      reason:
        `Items, charges and taxes add up to ${rupees(expectedTotal)}, but the bill total is ${rupees(bill.totalMinor)} ` +
        `(${rupees(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}). Something may be missing from what we read, so please compare with the paper bill.`,
    });
  }

  // 7. unusual lines
  items.forEach((it, i) => {
    if (it.qty >= 20) {
      add({
        type: 'unusual_amount',
        lineIndex: i,
        amountMinor: it.amountMinor,
        reason: `${it.name} shows a quantity of ${qtyText(it.qty)}. That is a lot for one line, so please check it was read correctly.`,
      });
    }
  });

  return flags;
}
