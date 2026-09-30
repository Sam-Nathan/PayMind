/**
 * @paymind/core — deterministic money logic shared by the Expo app, the Next.js web
 * app and Supabase Edge Functions (Deno). Pure functions, integer paise, no I/O.
 */
export * from './money.ts';
export * from './split/items.ts';
export * from './split/rules.ts';
export * from './settle/simplify.ts';
export * from './settle/state.ts';
export * from './settle/standing.ts';
export * from './upi.ts';
export * from './capture/parse.ts';
export * from './plan/safeToSpend.ts';
export * from './plan/budget.ts';
export * from './plan/goals.ts';
export * from './recurring/detect.ts';
export * from './schemas.ts';
export * from './errors.ts';
