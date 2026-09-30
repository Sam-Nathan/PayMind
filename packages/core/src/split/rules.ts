/**
 * Rule-based splits for spaces (design pages 18-19): equal, ratio (couple 60/40),
 * weights (rent by room size), fixed amounts, and by usage (sub-meter readings with
 * common areas split equally). Every function returns a Record that sums exactly to
 * the total, rounding with the largest-remainder method in member order.
 */
import { allocate, allocateEqual, assertPaise, type Paise } from '../money.ts';
import type { MemberId } from './items.ts';
import { SplitError } from './items.ts';

export type Shares = Record<MemberId, Paise>;

function toRecord(members: readonly MemberId[], amounts: readonly Paise[]): Shares {
  const out: Shares = {};
  members.forEach((m, i) => (out[m] = amounts[i] as number));
  return out;
}

function checkMembers(members: readonly MemberId[]): void {
  if (members.length === 0) throw new SplitError('At least one member is required');
  if (new Set(members).size !== members.length) throw new SplitError('Duplicate member ids');
}

/** Equal split. splitEqual(105000, ['you','karthik','neel']) -> 35000 each. */
export function splitEqual(totalMinor: Paise, members: readonly MemberId[]): Shares {
  assertPaise(totalMinor, 'totalMinor');
  checkMembers(members);
  return toRecord(members, allocateEqual(totalMinor, members.length));
}

/**
 * Split by weights (room sizes, share weights, incomes...). Key order is the
 * tie-break order. splitWeights(4200000, {you:160, karthik:140, neel:120})
 * -> {you:1600000, karthik:1400000, neel:1200000}.
 */
export function splitWeights(totalMinor: Paise, weights: Record<MemberId, number>): Shares {
  assertPaise(totalMinor, 'totalMinor');
  const members = Object.keys(weights);
  checkMembers(members);
  return toRecord(members, allocate(totalMinor, members.map((m) => weights[m] as number)));
}

/** Ratio split, e.g. couple 60/40: splitRatio(1840000, {you:60, ananya:40}). Same maths as weights. */
export function splitRatio(totalMinor: Paise, ratio: Record<MemberId, number>): Shares {
  return splitWeights(totalMinor, ratio);
}

/** Fixed amounts; they must add up exactly to the total. */
export function splitFixed(totalMinor: Paise, amounts: Record<MemberId, Paise>): Shares {
  assertPaise(totalMinor, 'totalMinor');
  const members = Object.keys(amounts);
  checkMembers(members);
  let s = 0;
  for (const m of members) {
    assertPaise(amounts[m] as number, `amount for ${m}`);
    s += amounts[m] as number;
  }
  if (s !== totalMinor) throw new SplitError(`Fixed amounts add up to ${s}, expected ${totalMinor}`);
  return { ...amounts };
}

/** How the common (non-metered) part of a usage bill is determined. */
export type UsageCommon =
  /** Common part is this amount; the rest of the bill is split by usage. */
  | { type: 'amount'; amountMinor: Paise }
  /** Each metered unit costs this much; whatever is left of the bill is common. */
  | { type: 'rate'; ratePerUnitMinor: number }
  /** This fraction (0..1) of the bill is common; the rest is split by usage. */
  | { type: 'fraction'; fraction: number };

export interface UsageSplitInput {
  totalMinor: Paise;
  /** Metered units per member (e.g. AC sub-meter kWh). Key order breaks ties. */
  usage: Record<MemberId, number>;
  /** Common areas, split equally among all members in `usage`. Default: nothing common. */
  common?: UsageCommon;
}

export interface UsageSplitResult {
  shares: Shares;
  commonMinor: Paise;
  usageMinor: Paise;
  commonShares: Shares;
  usageShares: Shares;
}

/**
 * Split a metered bill: usage part by readings, common part equally (design page 19,
 * Flat 402 electricity ₹3,720 -> You ₹1,040 · Karthik ₹1,480 · Neel ₹1,200).
 */
export function splitByUsage(input: UsageSplitInput): UsageSplitResult {
  const { totalMinor, usage } = input;
  assertPaise(totalMinor, 'totalMinor');
  const members = Object.keys(usage);
  checkMembers(members);
  const units = members.map((m) => {
    const u = usage[m] as number;
    if (!Number.isFinite(u) || u < 0) throw new SplitError(`Invalid usage for ${m}: ${u}`);
    return u;
  });
  const unitSum = units.reduce((a, b) => a + b, 0);

  let usageAmounts: Paise[];
  let commonMinor: Paise;
  const common = input.common;
  if (!common) {
    if (unitSum === 0) throw new SplitError('Usage readings must not all be zero');
    usageAmounts = allocate(totalMinor, units);
    commonMinor = 0;
  } else if (common.type === 'rate') {
    const rate = common.ratePerUnitMinor;
    if (!Number.isFinite(rate) || rate < 0) throw new SplitError(`Invalid rate: ${rate}`);
    // units × rate may be fractional paise; round each person's metered cost to whole paise.
    usageAmounts = units.map((u) => Math.round(u * rate));
    const metered = usageAmounts.reduce((a, b) => a + b, 0);
    commonMinor = totalMinor - metered;
    if (commonMinor < 0) throw new SplitError('Metered usage costs more than the whole bill');
  } else {
    if (common.type === 'amount') {
      assertPaise(common.amountMinor, 'common amount');
      commonMinor = common.amountMinor;
    } else {
      const f = common.fraction;
      if (!Number.isFinite(f) || f < 0 || f > 1) throw new SplitError(`Invalid common fraction: ${f}`);
      commonMinor = allocate(totalMinor, [f, 1 - f])[0] as number;
    }
    if (Math.sign(commonMinor) * Math.sign(totalMinor) < 0 || Math.abs(commonMinor) > Math.abs(totalMinor)) {
      throw new SplitError('Common part cannot exceed the bill');
    }
    const rest = totalMinor - commonMinor;
    if (rest !== 0 && unitSum === 0) throw new SplitError('Usage readings must not all be zero');
    usageAmounts = rest === 0 ? members.map(() => 0) : allocate(rest, units);
  }
  const commonAmounts = allocateEqual(commonMinor, members.length);
  const usageMinor = totalMinor - commonMinor;
  return {
    shares: toRecord(
      members,
      members.map((_, i) => (usageAmounts[i] as number) + (commonAmounts[i] as number)),
    ),
    commonMinor,
    usageMinor,
    commonShares: toRecord(members, commonAmounts),
    usageShares: toRecord(members, usageAmounts),
  };
}

/** A stored split rule (mirrors `split_rules.method` + `params`). */
export type SplitRule =
  | { method: 'equal'; members: MemberId[] }
  | { method: 'ratio'; ratio: Record<MemberId, number> }
  | { method: 'by_room'; weights: Record<MemberId, number> }
  | { method: 'weights'; weights: Record<MemberId, number> }
  | { method: 'fixed'; amounts: Record<MemberId, Paise> }
  | { method: 'by_usage'; usage: Record<MemberId, number>; common?: UsageCommon };

/**
 * Apply a stored rule to a bill total. ('by_item' bills go through `splitItems`.)
 */
export function applySplitRule(totalMinor: Paise, rule: SplitRule): Shares {
  switch (rule.method) {
    case 'equal':
      return splitEqual(totalMinor, rule.members);
    case 'ratio':
      return splitRatio(totalMinor, rule.ratio);
    case 'by_room':
    case 'weights':
      return splitWeights(totalMinor, rule.weights);
    case 'fixed':
      return splitFixed(totalMinor, rule.amounts);
    case 'by_usage':
      return splitByUsage(rule.common ? { totalMinor, usage: rule.usage, common: rule.common } : { totalMinor, usage: rule.usage }).shares;
    default: {
      const never: never = rule;
      throw new SplitError(`Unknown split rule ${JSON.stringify(never)}`);
    }
  }
}
