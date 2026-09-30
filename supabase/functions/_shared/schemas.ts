// GENERATED from packages/core/src/schemas.ts by scripts/sync-edge-shared.mjs - keep in sync, do not edit here.
/**
 * Zod schemas for API payloads and AI structured outputs. Field names are camelCase;
 * amounts are integer paise (`...Minor`). DB columns are snake_case — map at the edge.
 */
import { z } from 'npm:zod@4';

// ---------------------------------------------------------------------------
// Primitives

export const MinorSchema = z
  .number()
  .int()
  .refine((n) => Number.isSafeInteger(n), { message: 'Amount must be a safe integer (paise)' });
export const NonNegMinorSchema = MinorSchema.refine((n) => n >= 0, { message: 'Amount must be >= 0' });
export const PositiveMinorSchema = MinorSchema.refine((n) => n > 0, { message: 'Amount must be > 0' });

export const UuidSchema = z.uuid();
/** Client-side ids for rows created in the same request (items referenced by item shares). */
export const ClientIdSchema = z.string().min(1).max(64);
export const IsoDateSchema = z.iso.date();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true, local: true });
export const CurrencySchema = z.literal('INR');

export const SpaceTypeSchema = z.enum(['trip', 'event', 'couple', 'family', 'roommates', 'friends', 'college', 'office', 'custom']);
export const ExpenseSourceSchema = z.enum(['scan', 'voice', 'text', 'upi_alert', 'sms', 'ebill', 'manual']);
export const VisibilitySchema = z.enum(['personal', 'shared']);
export const PaidViaSchema = z.enum(['upi', 'cash', 'card', 'bank', 'wallet', 'other']);
export const ItemKindSchema = z.enum(['item', 'discount', 'service', 'tax', 'tip']);
export const SplitMethodSchema = z.enum(['equal', 'ratio', 'by_room', 'by_usage', 'by_item', 'fixed']);
export const SettlementStatusSchema = z.enum(['initiated', 'pending', 'completed', 'failed', 'confirmed_manual', 'corrected', 'cancelled']);

const MemberWeightsSchema = z.record(z.string().min(1), z.number().nonnegative());

// ---------------------------------------------------------------------------
// Splits

export const ItemAssignmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equal'), members: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('units'), units: MemberWeightsSchema }),
  z.object({ type: z.literal('percent'), pct: MemberWeightsSchema }),
  z.object({ type: z.literal('fixed'), amounts: z.record(z.string().min(1), MinorSchema) }),
]);

export const UsageCommonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('amount'), amountMinor: MinorSchema }),
  z.object({ type: z.literal('rate'), ratePerUnitMinor: z.number().nonnegative() }),
  z.object({ type: z.literal('fraction'), fraction: z.number().min(0).max(1) }),
]);

/** Mirrors `SplitRule` in split/rules.ts (stored as split_rules.method + params / spaces.default_split). */
export const SplitRuleSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('equal'), members: z.array(z.string().min(1)).min(1) }),
  z.object({ method: z.literal('ratio'), ratio: MemberWeightsSchema }),
  z.object({ method: z.literal('by_room'), weights: MemberWeightsSchema }),
  z.object({ method: z.literal('weights'), weights: MemberWeightsSchema }),
  z.object({ method: z.literal('fixed'), amounts: z.record(z.string().min(1), MinorSchema) }),
  z.object({ method: z.literal('by_usage'), usage: MemberWeightsSchema, common: UsageCommonSchema.optional() }),
]);

// ---------------------------------------------------------------------------
// CreateExpenseInput

export const ExpenseItemInputSchema = z.object({
  /** Client id so item shares can reference the item before it has a DB id. */
  clientId: ClientIdSchema,
  name: z.string().min(1).max(200),
  qty: z.number().positive().default(1),
  /** Line amount; discounts are negative. */
  amountMinor: MinorSchema,
  kind: ItemKindSchema.default('item'),
});

/** One row of item_shares: exactly one of units / pct / amountMinor. */
export const ItemShareInputSchema = z
  .object({
    itemClientId: ClientIdSchema,
    memberId: UuidSchema,
    units: z.number().nonnegative().optional(),
    pct: z.number().min(0).max(100).optional(),
    amountMinor: MinorSchema.optional(),
  })
  .refine((s) => [s.units, s.pct, s.amountMinor].filter((v) => v !== undefined).length === 1, {
    message: 'Exactly one of units, pct or amountMinor is required',
  });

export const MemberShareInputSchema = z.object({
  memberId: UuidSchema,
  owedMinor: MinorSchema,
});

export const CreateExpenseInputSchema = z
  .object({
    spaceId: UuidSchema.nullable().default(null),
    merchantId: UuidSchema.nullable().optional(),
    merchantName: z.string().max(200).nullable().optional(),
    categoryId: UuidSchema.nullable().optional(),
    totalMinor: PositiveMinorSchema,
    currency: CurrencySchema.default('INR'),
    /** space_members.id of the payer. */
    paidByMember: UuidSchema,
    paidVia: PaidViaSchema,
    occurredAt: IsoDateTimeSchema,
    source: ExpenseSourceSchema,
    visibility: VisibilitySchema,
    notePrivate: z.string().max(2000).nullable().optional(),
    /** Id of the AI proposal this confirms, if any. */
    proposalId: UuidSchema.nullable().optional(),
    items: z.array(ExpenseItemInputSchema).default([]),
    itemShares: z.array(ItemShareInputSchema).default([]),
    /** Materialised split result (expense_shares). Required for shared expenses; must sum to totalMinor. */
    memberShares: z.array(MemberShareInputSchema).default([]),
  })
  .superRefine((e, ctx) => {
    const sharesSum = e.memberShares.reduce((a, s) => a + s.owedMinor, 0);
    if (e.visibility === 'shared' && e.memberShares.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['memberShares'], message: 'Shared expenses need member shares' });
    } else if (e.memberShares.length > 0 && sharesSum !== e.totalMinor) {
      ctx.addIssue({ code: 'custom', path: ['memberShares'], message: `Member shares add up to ${sharesSum}, expected ${e.totalMinor}` });
    }
    const memberIds = e.memberShares.map((s) => s.memberId);
    if (new Set(memberIds).size !== memberIds.length) {
      ctx.addIssue({ code: 'custom', path: ['memberShares'], message: 'Duplicate member in memberShares' });
    }
    if (e.items.length > 0) {
      const itemsSum = e.items.reduce((a, i) => a + i.amountMinor, 0);
      if (itemsSum !== e.totalMinor) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: `Items add up to ${itemsSum}, expected ${e.totalMinor}` });
      }
      const ids = new Set(e.items.map((i) => i.clientId));
      if (ids.size !== e.items.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Duplicate item clientId' });
      e.itemShares.forEach((s, i) => {
        if (!ids.has(s.itemClientId)) {
          ctx.addIssue({ code: 'custom', path: ['itemShares', i, 'itemClientId'], message: 'Unknown item' });
        }
      });
    } else if (e.itemShares.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['itemShares'], message: 'itemShares given without items' });
    }
    if (e.visibility === 'shared' && !e.spaceId) {
      ctx.addIssue({ code: 'custom', path: ['spaceId'], message: 'Shared expenses need a space' });
    }
  });

// ---------------------------------------------------------------------------
// CreateSpaceInput

export const SpaceMemberInputSchema = z.object({
  /** null for people not on PayMind yet. */
  userId: UuidSchema.nullable().default(null),
  displayName: z.string().min(1).max(80),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
  shareWeight: z.number().positive().default(1),
  upiVpa: z.string().max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
});

export const CreateSpaceInputSchema = z
  .object({
    type: SpaceTypeSchema,
    name: z.string().min(1).max(80),
    startsOn: IsoDateSchema.nullable().optional(),
    endsOn: IsoDateSchema.nullable().optional(),
    budgetMinor: NonNegMinorSchema.nullable().optional(),
    currency: CurrencySchema.default('INR'),
    defaultSplit: SplitRuleSchema.nullable().optional(),
    /** Other members; the creator is added as owner by the server. */
    members: z.array(SpaceMemberInputSchema).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.startsOn && s.endsOn && s.endsOn < s.startsOn) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'endsOn is before startsOn' });
    }
  });

// ---------------------------------------------------------------------------
// AI: bill parser output (Claude vision -> structured output)
// Nullable rather than optional so the JSON schema has every key (friendlier to structured outputs).

export const BillLineSchema = z.object({
  name: z.string(),
  qty: z.number().positive(),
  unitPriceMinor: MinorSchema.nullable(),
  amountMinor: MinorSchema,
});

export const BillChargeSchema = z.object({
  label: z.string(),
  /** Percent as printed (5 for "5%"), if printed. */
  ratePct: z.number().nullable(),
  /** Positive number; the sign is implied by the field (discounts reduce the total). */
  amountMinor: NonNegMinorSchema,
});

export const BillParseResultSchema = z.object({
  merchant: z.string().nullable(),
  location: z.string().nullable(),
  /** Local date-time as printed, ISO 8601 without offset (e.g. "2026-10-13T21:42:00"). */
  datetime: z.string().nullable(),
  items: z.array(BillLineSchema),
  subtotalMinor: MinorSchema.nullable(),
  discounts: z.array(BillChargeSchema),
  serviceCharge: BillChargeSchema.nullable(),
  tax: z.array(BillChargeSchema),
  tipMinor: NonNegMinorSchema.nullable(),
  totalMinor: MinorSchema,
  currency: CurrencySchema,
});

// ---------------------------------------------------------------------------
// AI: text / voice expense parser output

export const ExpenseSplitProposalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('equal') }),
  /** Names map to weights, "me" for the user: {"me": 1, "Neel": 1}. */
  z.object({ type: z.literal('ratio'), ratio: z.record(z.string(), z.number().nonnegative()) }),
  z.object({ type: z.literal('fixed'), amounts: z.record(z.string(), MinorSchema) }),
]);

export const ExpenseParseResultSchema = z.object({
  amountMinor: PositiveMinorSchema,
  merchant: z.string().nullable(),
  category: z.string().nullable(),
  /** "YYYY-MM-DD", resolved from words like "yesterday". */
  date: IsoDateSchema.nullable(),
  /** Names of the other people involved, as spoken. */
  with: z.array(z.string()),
  /** "me" or a name from `with`. */
  paidBy: z.string(),
  paidVia: PaidViaSchema.nullable(),
  split: ExpenseSplitProposalSchema,
  note: z.string().nullable(),
  /** Space the user named or implied ("Flat 402"), if any. */
  spaceHint: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Bill Detective

export const BillFlagTypeSchema = z.enum([
  'possible_duplicate_line',
  'service_charge',
  'subtotal_mismatch',
  'tax_mismatch',
  'total_mismatch',
  'price_mismatch',
  'unusual_amount',
  'other',
]);

export const BillFlagResolutionSchema = z.enum(['kept', 'removed', 'corrected', 'dismissed']);

export const BillFlagSchema = z.object({
  type: BillFlagTypeSchema,
  /** Plain-language explanation shown to the user ("explain, don't accuse"). */
  reason: z.string().min(1),
  /** Index into BillParseResult.items, when the flag is about a line. */
  lineIndex: z.number().int().nonnegative().nullable(),
  amountMinor: MinorSchema.nullable(),
  resolution: BillFlagResolutionSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Captured transactions (capture/parse.ts output)

export const ParsedTxnSchema = z.object({
  direction: z.enum(['debit', 'credit']),
  amountMinor: PositiveMinorSchema,
  payee: z.string().optional(),
  vpa: z.string().optional(),
  bank: z.string().optional(),
  account_last4: z.string().regex(/^\d{3,4}$/).optional(),
  ref: z.string().optional(),
  occurredAt: z.string().optional(),
  app: z.enum(['phonepe', 'gpay', 'paytm', 'bhim']).optional(),
});

// ---------------------------------------------------------------------------
// Types

export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;
export type ExpenseItemInput = z.infer<typeof ExpenseItemInputSchema>;
export type ItemShareInput = z.infer<typeof ItemShareInputSchema>;
export type MemberShareInput = z.infer<typeof MemberShareInputSchema>;
export type CreateSpaceInput = z.infer<typeof CreateSpaceInputSchema>;
export type SpaceMemberInput = z.infer<typeof SpaceMemberInputSchema>;
export type BillParseResult = z.infer<typeof BillParseResultSchema>;
export type BillLine = z.infer<typeof BillLineSchema>;
export type BillCharge = z.infer<typeof BillChargeSchema>;
export type ExpenseParseResult = z.infer<typeof ExpenseParseResultSchema>;
export type ExpenseSplitProposal = z.infer<typeof ExpenseSplitProposalSchema>;
export type BillFlag = z.infer<typeof BillFlagSchema>;
export type BillFlagType = z.infer<typeof BillFlagTypeSchema>;
export type SplitRuleInput = z.infer<typeof SplitRuleSchema>;
export type ItemAssignmentInput = z.infer<typeof ItemAssignmentSchema>;
export type SpaceType = z.infer<typeof SpaceTypeSchema>;
export type ExpenseSource = z.infer<typeof ExpenseSourceSchema>;
export type PaidVia = z.infer<typeof PaidViaSchema>;
