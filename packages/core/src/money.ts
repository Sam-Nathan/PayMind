/**
 * Money primitives. Every stored amount is an integer number of paise
 * (1 rupee = 100 paise) held in a JS `number` that is always a safe integer.
 */
import { fromNumber, rat, roundSharesLargestRemainder, sum, mul, div, type Rational } from './rational.ts';

/** Integer paise. A type alias for readability; always `Number.isSafeInteger`. */
export type Paise = number;

export const PAISE_PER_RUPEE = 100;

export function isPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Throw a RangeError unless `value` is a safe integer amount of paise. */
export function assertPaise(value: number, label = 'amount'): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of paise (got ${value})`);
  }
}

/**
 * Parse rupees into paise. Accepts numbers or strings such as "1,240", "₹1,20,000.50",
 * "Rs. 499", "INR 1,499.00", "-150". Rounds to the nearest paisa, half away from zero,
 * working on the decimal digits (so 1.005 -> 101, not 100).
 */
export function rupeesToPaise(value: string | number): Paise {
  let s: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Invalid rupee amount: ${value}`);
    s = String(value);
    if (/e/i.test(s)) {
      // Exponent notation: fall back to exact rational conversion.
      const r = fromNumber(value);
      const scaled = mul(r, rat(100));
      return roundHalfAwayFromZero(scaled);
    }
  } else {
    s = value;
  }
  const cleaned = s
    .trim()
    .replace(/^(?:₹|rs\.?|inr)\s*/i, '')
    .replace(/[\s, ]/g, '')
    .replace(/^([+-])(?:₹|rs\.?|inr)/i, '$1')
    .replace(/\/-$/, '');
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!m || ((m[2] ?? '') === '' && (m[3] ?? '') === '')) {
    throw new RangeError(`Invalid rupee amount: ${JSON.stringify(value)}`);
  }
  const negative = m[1] === '-';
  const whole = m[2] || '0';
  const fracDigits = m[3] ?? '';
  const first2 = (fracDigits + '00').slice(0, 2);
  const rest = fracDigits.slice(2);
  let paise = BigInt(whole) * BigInt(100) + BigInt(first2);
  if (rest.length > 0 && rest.charCodeAt(0) >= 53 /* '5' */) paise += BigInt(1);
  const n = Number(negative ? -paise : paise);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Rupee amount too large: ${String(value)}`);
  return n === 0 ? 0 : n;
}

function roundHalfAwayFromZero(r: Rational): Paise {
  const neg = r.n < BigInt(0);
  const absN = neg ? -r.n : r.n;
  const q = absN / r.d;
  const rem = absN - q * r.d;
  const rounded = rem * BigInt(2) >= r.d ? q + BigInt(1) : q;
  const n = Number(neg ? -rounded : rounded);
  if (!Number.isSafeInteger(n)) throw new RangeError('Amount out of range');
  return n === 0 ? 0 : n;
}

/** Paise to rupees as a JS number. For display/interop only; never store the result. */
export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / PAISE_PER_RUPEE;
}

/** Paise to a fixed 2-decimal rupee string without grouping, e.g. 124000 -> "1240.00". */
export function paiseToRupeeString(paise: Paise): string {
  assertPaise(paise);
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fr = abs % 100;
  return `${neg ? '-' : ''}${whole}.${fr < 10 ? '0' : ''}${fr}`;
}

/** Group an unsigned integer digit string the Indian way: 1234567 -> "12,34,567". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let head = digits.slice(0, -3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head.length) parts.unshift(head);
  return `${parts.join(',')},${last3}`;
}

export interface FormatINROptions {
  /**
   * 2 (default) always shows paise; 0 rounds to whole rupees (half away from zero);
   * 'auto' shows paise only when they are non-zero.
   */
  decimals?: 0 | 2 | 'auto';
  /** true (default) prefixes "₹"; false omits it; a string uses that prefix instead. */
  symbol?: boolean | string;
  /** Prefix positive amounts with "+" (e.g. "+₹4,200" on balances). Default false. */
  signed?: boolean;
}

/**
 * Format paise as Indian rupees with lakh/crore grouping.
 * formatINR(12000000) -> "₹1,20,000.00"; formatINR(123456789) -> "₹12,34,567.89".
 */
export function formatINR(paise: Paise, opts: FormatINROptions = {}): string {
  assertPaise(paise);
  const decimals = opts.decimals ?? 2;
  const symbol = opts.symbol === undefined || opts.symbol === true ? '₹' : opts.symbol === false ? '' : opts.symbol;
  const neg = paise < 0;
  let abs = Math.abs(paise);
  let body: string;
  if (decimals === 0) {
    const rupees = Math.floor(abs / 100) + (abs % 100 >= 50 ? 1 : 0);
    body = groupIndian(String(rupees));
    abs = rupees * 100;
  } else {
    const whole = Math.floor(abs / 100);
    const fr = abs % 100;
    body = groupIndian(String(whole));
    if (decimals === 2 || fr !== 0) body += `.${fr < 10 ? '0' : ''}${fr}`;
  }
  const signStr = neg && abs !== 0 ? '-' : opts.signed && abs !== 0 ? '+' : '';
  return `${signStr}${symbol}${body}`;
}

/** Floor paise to whole rupees (as a rupee integer). 116622 -> 1166. Negative values floor toward -inf. */
export function floorToRupees(paise: Paise): number {
  assertPaise(paise);
  return Math.floor(paise / 100);
}

/**
 * Split `total` paise in proportion to `weights` using the largest-remainder method.
 * The result always sums exactly to `total`. Each part is floor or ceil of its exact
 * share; ties go to the earlier index. Weights must be finite and >= 0 with a positive sum.
 * Negative totals are split as the mirror image of the positive case.
 *
 * allocate(100, [1, 1, 1]) -> [34, 33, 33]
 */
export function allocate(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total, 'total');
  if (weights.length === 0) throw new RangeError('allocate needs at least one weight');
  const ws = weights.map((w) => {
    if (!Number.isFinite(w) || w < 0) throw new RangeError(`Invalid weight: ${w}`);
    return fromNumber(w);
  });
  const wSum = sum(ws);
  if (wSum.n === BigInt(0)) throw new RangeError('Weights must not all be zero');
  const t = rat(total);
  const shares = ws.map((w) => div(mul(t, w), wSum));
  return roundSharesLargestRemainder(shares);
}

/** Split `total` equally across `n` parts (earlier parts get the extra paise). */
export function allocateEqual(total: Paise, n: number): Paise[] {
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`Invalid part count: ${n}`);
  return allocate(total, new Array<number>(n).fill(1));
}

/** Sum of paise amounts, asserting safe integers throughout. */
export function sumPaise(values: readonly Paise[]): Paise {
  let acc = 0;
  for (const v of values) {
    assertPaise(v);
    acc += v;
  }
  assertPaise(acc, 'sum');
  return acc;
}
