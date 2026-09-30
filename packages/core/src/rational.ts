/**
 * Exact rational arithmetic on BigInt, used internally so that fair-split
 * maths never depends on floating point. Denominators are always positive.
 *
 * BigInt is available in Hermes (React Native >= 0.70), V8 and Deno.
 */

export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

function absBig(x: bigint): bigint {
  return x < ZERO ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  a = absBig(a);
  b = absBig(b);
  while (b !== ZERO) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function rat(n: bigint | number, d: bigint | number = 1): Rational {
  let nn = typeof n === 'bigint' ? n : BigInt(n);
  let dd = typeof d === 'bigint' ? d : BigInt(d);
  if (dd === ZERO) throw new RangeError('Rational with zero denominator');
  if (dd < ZERO) {
    nn = -nn;
    dd = -dd;
  }
  const g = gcd(nn, dd);
  if (g > ONE) {
    nn /= g;
    dd /= g;
  }
  return { n: nn, d: dd };
}

export const R0: Rational = { n: ZERO, d: ONE };

export function add(a: Rational, b: Rational): Rational {
  if (a.d === b.d) return rat(a.n + b.n, a.d);
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return add(a, { n: -b.n, d: b.d });
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === ZERO) throw new RangeError('Division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

export function sum(xs: readonly Rational[]): Rational {
  let acc = R0;
  for (const x of xs) acc = add(acc, x);
  return acc;
}

export function cmp(a: Rational, b: Rational): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function isZero(a: Rational): boolean {
  return a.n === ZERO;
}

export function sign(a: Rational): number {
  return a.n < ZERO ? -1 : a.n > ZERO ? 1 : 0;
}

/** Floor toward negative infinity. */
export function floor(a: Rational): bigint {
  const q = a.n / a.d; // truncates toward zero
  if (a.n < ZERO && q * a.d !== a.n) return q - ONE;
  return q;
}

/** Fractional part in [0, 1). */
export function frac(a: Rational): Rational {
  return sub(a, rat(floor(a)));
}

/**
 * Convert a finite JS number to an exact rational using its shortest decimal
 * representation (so 33.33 is exactly 3333/100, not the binary double).
 */
function pow10(e: number): bigint {
  let r = ONE;
  for (let i = 0; i < e; i++) r *= TEN;
  return r;
}

export function fromNumber(x: number): Rational {
  if (!Number.isFinite(x)) throw new RangeError(`Not a finite number: ${x}`);
  if (Number.isInteger(x) && Number.isSafeInteger(x)) return rat(x);
  const s = String(x).toLowerCase();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(s);
  if (!m) throw new RangeError(`Cannot convert ${x} to rational`);
  const neg = m[1] === '-';
  const intPart = m[2] ?? '0';
  const fracPart = m[3] ?? '';
  const exp = m[4] ? Number(m[4]) : 0;
  let n = BigInt(intPart + fracPart);
  let d = pow10(fracPart.length);
  if (exp > 0) n *= pow10(exp);
  else if (exp < 0) d *= pow10(-exp);
  return rat(neg ? -n : n, d);
}

export function toNumber(a: Rational): number {
  return Number(a.n) / Number(a.d);
}

/** Convert an integral BigInt back to a safe JS number, or throw. */
export function toSafeInt(x: bigint): number {
  const n = Number(x);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Amount out of safe integer range: ${x}`);
  return n;
}

/**
 * Largest-remainder rounding of exact rational shares whose sum is an integer.
 * Each result is floor(share) or floor(share)+1; ties in the fractional part
 * are broken by index (earlier index gets the extra unit). A negative total is
 * handled as the mirror image of the positive case.
 */
export function roundSharesLargestRemainder(shares: readonly Rational[]): number[] {
  const total = sum(shares);
  if (total.d !== ONE) throw new RangeError('Shares must sum to an integer amount');
  if (total.n < ZERO) {
    // Mirror so that negative totals (e.g. a pure discount) round symmetrically.
    return roundSharesLargestRemainder(shares.map((s) => ({ n: -s.n, d: s.d }))).map((v) => (v === 0 ? 0 : -v));
  }
  const floors = shares.map(floor);
  let assigned = ZERO;
  for (const f of floors) assigned += f;
  let leftover = total.n - assigned; // 0 <= leftover < shares.length
  const order = shares
    .map((s, i) => ({ i, r: frac(s) }))
    .sort((a, b) => {
      const c = cmp(b.r, a.r);
      return c !== 0 ? c : a.i - b.i;
    });
  const out = floors.slice();
  for (const { i } of order) {
    if (leftover <= ZERO) break;
    out[i] = (out[i] as bigint) + ONE;
    leftover -= ONE;
  }
  return out.map(toSafeInt);
}
