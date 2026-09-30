/**
 * Supabase/Postgres errors from PayMind RPCs are raised as '<code>: detail' (docs/schema.md,
 * "Error codes"). `errorCodeOf` extracts the code; `friendlyError` turns any thrown value into
 * UI copy. Shared by the web and mobile apps.
 */

export const DB_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  not_authenticated: 'Please sign in again to continue.',
  not_space_member: "You're not a member of that space.",
  not_a_settlement_party: 'Only the people involved (or a space owner) can do that.',
  expense_not_found_or_forbidden: "That expense doesn't exist or you can't change it.",
  settlement_not_found_or_forbidden: "That payment doesn't exist or you can't change it.",
  captured_txn_not_found_or_forbidden: "That transaction doesn't exist or isn't yours.",
  only_space_owner_can_change_role: 'Only a space owner can change roles.',
  invalid_payload: 'Something in that form looks off. Please check it and try again.',
  invalid_total: 'The amount must be more than zero.',
  invalid_amount: 'That amount is not valid.',
  invalid_members: 'Please check the member list.',
  member_display_name_required: 'Every member needs a name.',
  paid_by_member_required: 'Choose who paid.',
  paid_by_member_not_allowed_on_personal_expense: "Personal expenses don't have a payer.",
  payer_not_in_space: "The person who paid isn't in this space.",
  shares_required: 'Choose how to split this expense.',
  shares_not_allowed_on_personal_expense: "Personal expenses can't be split.",
  invalid_share: 'One of the shares is not valid.',
  duplicate_share_member: 'A person appears twice in the split.',
  shares_sum_mismatch: "The split doesn't add up to the total.",
  share_member_not_in_space: "Someone in the split isn't in this space.",
  items_sum_mismatch: "The items don't add up to the total.",
  invalid_item_share: 'One of the item shares is not valid.',
  item_shares_sum_mismatch: "An item's split doesn't add up.",
  item_shares_not_allowed_on_personal_expense: "Personal expenses can't have item shares.",
  item_shares_member_mismatch: "The item shares don't match the overall split.",
  illegal_initial_settlement_status: "That payment can't start in that state.",
  illegal_settlement_transition: "That payment can't be moved to that state.",
  settlement_amount_locked: "The amount can't be changed any more.",
  correction_requires_new_amount: 'Enter the corrected amount.',
  settlement_member_not_in_space: "Someone in that payment isn't in the space.",
  settlement_parties_immutable: "The people in a payment can't be changed.",
  captured_txn_not_in_inbox: 'That transaction was already handled.',
  invalid_token: 'That link is not valid any more.',
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

function messageOf(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

function sqlStateOf(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

/** The token before the first ':' when it looks like one of our snake_case codes. */
export function errorCodeOf(err: unknown): string | null {
  const m = /^\s*([a-z][a-z0-9_]+)\s*:/.exec(messageOf(err));
  return m?.[1] ?? null;
}

/** UI copy for any thrown value: known RPC code, then transport/auth errors, then SQLSTATE. */
export function friendlyError(err: unknown): string {
  const code = errorCodeOf(err) ?? messageOf(err).trim();
  const known = DB_ERROR_MESSAGES[code];
  if (known) return known;

  const lower = messageOf(err).toLowerCase();
  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return "Can't reach PayMind. Check your connection and try again.";
  }
  if (lower.includes('invalid login credentials')) return 'Wrong email or password.';
  if (lower.includes('user already registered')) return 'That email already has an account. Try signing in.';
  if (lower.includes('email not confirmed')) return 'Confirm your email first, then sign in.';
  if (lower.includes('password should be at least')) return 'Choose a longer password (at least 6 characters).';
  if (lower.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';

  const state = sqlStateOf(err);
  if (state === '42501') return "You don't have permission to do that.";
  if (state === '23514') return "That doesn't add up. Please check the amounts.";
  if (state === '22023') return 'Something in that form looks off. Please check it and try again.';
  return GENERIC_ERROR;
}
