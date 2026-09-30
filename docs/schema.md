# PayMind database schema (v1)

This is the contract that clients and Edge Functions code against. The source of truth is
`supabase/migrations/20260930000001..05_init_*.sql` plus later migrations (`..07_perf.sql`). The tests are in `supabase/tests/*.test.sql`.
Run them with `supabase test db`, or run `supabase/scripts/test_local.sh` against a plain Postgres.

**Conventions:**
- Money is stored as `bigint` paise in `*_minor` columns. It is never a float. ₹1,992.00 is `199200`.
- Timestamps are `timestamptz` and dates are `date`. Primary keys are `uuid`.
- Every table has RLS enabled. `anon` has no access to anything.
- Money maths (splits, rounding, extras, debt simplification) is done in `packages/core`. The database only **validates** the results and stores them.

## Enums

| Type | Values |
|---|---|
| `space_type` | trip, event, couple, family, roommates, friends, college, office, custom |
| `space_status` | active, settling, settled, archived |
| `member_role` | owner, member |
| `split_method` | equal, ratio, by_room, by_usage, by_item, fixed |
| `expense_source` | scan, voice, text, upi_alert, sms, ebill, manual, recurring, assistant |
| `expense_status` | proposed, confirmed, void |
| `expense_visibility` | personal, shared (generated from `space_id`) |
| `payment_via` | upi, cash, card, bank, wallet, other |
| `item_kind` | item, discount, service, tax, tip |
| `capture_source` | upi_notification, sms, ebill, manual |
| `capture_status` | inbox, confirmed, not_mine |
| `settlement_status` | initiated, pending, completed, failed, confirmed_manual, corrected, cancelled |
| `settlement_method` | upi, cash, bank, other |
| `reminder_tone` / `reminder_repeat` / `reminder_status` | friendly, neutral, firm / once, every_3_days, weekly / active, done, cancelled |
| `budget_scope` / `budget_period` | monthly, weekly, category, group, event, trip / weekly, monthly, custom |
| `recurring_kind` / `recurring_cadence` / `recurring_status` | subscription, emi, bill, other / weekly, monthly, quarterly, half_yearly, yearly / active, paused, cancelled, ended |
| `goal_status` | active, achieved, archived |
| `proposal_status` | pending, accepted, edited, rejected |
| `learned_rule_kind` | category, merchant, split |
| `nudge_frequency` | as_it_happens, daily, weekly |
| `device_platform` | android, ios, web |

## Tables

Every table also has `created_at`. Mutable tables also have `updated_at`, which a trigger maintains. Columns marked (default uid) are filled with `auth.uid()` when you leave them out.

| Table | Key columns | Who can see it | Who can write it |
|---|---|---|---|
| `profiles` | id (=auth.users.id), name, phone, upi_vpa, locale (`en-IN`/`hi-IN`/`kn-IN`), currency, avatar_url, deleted_at | the user | the user. The row is auto-created at sign-up. |
| `spaces` | id, type, name, starts_on, ends_on, budget_minor, currency, default_split jsonb, status, created_by | active members and the creator | space owners (update/delete). Create it with `create_space`. |
| `space_members` | id, space_id, user_id (null = not on the app or a former member), display_name, upi_vpa, role, share_weight, joined_at, left_at | members of the space, and your own rows | owners: any row. Members: can add `member` rows. Anyone: can update their own row (e.g. set `left_at` to leave). `user_id` can't be changed, and only owners can change `role`. |
| `split_rules` | space_id, name, bill_kind, method, params jsonb | members | members |
| `categories` | id, parent_id, owner_id (null = system), slug (system rows), name, icon, sort_order | system rows plus your own | your own rows |
| `merchants` / `merchant_aliases` | canonical_name, category_id, owner_id / merchant_id, raw_text (trigram index), vpa (lower-case), owner_id | global rows plus your own | your own rows. Global rows are written by service_role. |
| `expenses` | id, owner_id (the creator; default uid), space_id (null = personal), visibility, title, merchant_id, category_id, total_minor, currency, paid_by_member, paid_via, occurred_at, source, status, captured_txn_id, proposal_id, recurring_series_id, receipt_path | personal: the owner only. Shared: active members of the space. | Create it with `create_expense`. Edit it with `update_expense`, or update it directly (e.g. `status='void'`). Allowed for the creator, the paying member, and space owners. |
| `expense_items` | expense_id, position, name, qty, unit_price_minor, amount_minor (≤0 only for `discount`), kind, category_id | same as the parent expense | same editors as the parent |
| `item_shares` | PK (item_id, member_id), expense_id, space_id, units, pct, amount_minor | members of the space | same editors as the parent |
| `expense_shares` | PK (expense_id, member_id), space_id, owed_minor ≥ 0 | members of the space | same editors as the parent |
| `expense_notes` | PK (expense_id, user_id), note | **the author only** | the author |
| `bill_flags` | expense_id, type, reason, item_id, resolution, resolved_by, resolved_at | same as the parent expense | same editors as the parent |
| `captured_txns` | user_id, source, raw, parsed jsonb, amount_minor, payee, vpa, occurred_at, status, dedupe_hash (unique per user), suggested_category_id, expense_id | the owner | the owner |
| `settlements` | id, space_id, from_member, to_member, amount_minor, status, note_ref, utr, corrected_from_minor (set by the trigger), created_by, completed_at | members of the space | Create it with `record_settlement`. Change it with `update_settlement_status`. Allowed for the parties, the creator, and space owners. No deletes: cancel instead. |
| `settlement_methods` | settlement_id (PK), method, upi_app, created_by | see the privacy model below | the recorder |
| `reminders` | from_user, to_member, amount_minor, items jsonb, tone, repeat, status, message, next_at, last_sent_at, link_token (unique, random) | the sender | the sender |
| `budgets` | owner_id **xor** space_id, scope, period, name, category_id, limit_minor, starts_on, ends_on | the owner, or members of the space | same as who can see it |
| `goals` / `goal_contributions` | owner_id xor space_id, name, target_minor, target_date, status / goal_id, member_id, user_id, amount_minor, contributed_at | the owner or members of the space / anyone who can see the goal | same as who can see it / the contributor |
| `recurring_series` | user_id, space_id?, merchant_id, category_id, name, kind, cadence, expected_minor, last_amount_minor, amount_varies, next_due, installments_total, installments_paid, flags jsonb, status, remind_days_before | the owner, plus the space if `space_id` is set | the owner |
| `ai_proposals` | user_id, space_id, kind, payload jsonb, status, result_ref, model, decided_at | the owner | the owner |
| `learned_rules` | user_id, kind, match jsonb, action jsonb, hits, last_applied_at | the owner | the owner |
| `anomalies` | user_id, expense_id, reason, resolution, resolved_at | the owner | the owner |
| `notification_prefs` | user_id PK, budget_alerts, money_nudges, settlement_reminders, unusual_activity, nudge_frequency, nudge_category_ids | the owner | the owner. The row is auto-created. |
| `privacy_settings` | user_id PK, capture_notifications, aa_balance, aa_consent_expires_at, ebills, ebill_senders, keep_receipts, ai_enabled, learn_from_corrections, share_payment_method, quiet_hours_enabled/start/end | the owner | the owner. The row is auto-created. Sources default to off (opt-in). AI defaults to on. |
| `devices` | user_id, expo_push_token (unique), platform, app_version, last_seen_at | the owner | register a device with `register_device` |

**System categories:** use their `slug` values: `food`, `food.dining`, `food.cafe`, `groceries`, `transport`, `transport.local_rides`, `transport.fuel`, `travel`, `stay`, `shopping`, `entertainment`, `subscriptions`, `utilities`, `rent`, `education`, `health`, `household_help`, `emi`, `insurance`, `activities`, `other`. Shared expenses should use system categories, because other members can't see your own categories.

## Views (all `security_invoker`, so RLS applies)

- **`balances`** has one row per space member: `space_id, member_id, user_id, display_name, left_at, paid_minor, owed_minor, settled_out_minor, settled_in_minor, net_minor`.
  - `net = paid (confirmed shared expenses) − owed (their shares) + settlements sent − settlements received`. Only settlements with status `completed`, `confirmed_manual` or `corrected` count.
  - `net > 0` means the member is owed money. `net < 0` means they owe. The nets in a space always add up to 0.
  - **Always filter by `space_id`** (or `user_id`).
- **`settlements_with_method`** is `settlements.*` plus `method` and `upi_app`. Those two are NULL when the viewer isn't allowed to see them.
- **`timeline_events`** has `event_type ('expense'|'payment'|'goal'|'alert'), ref_id, space_id, occurred_at, title, amount_minor, status, detail`.

## Privacy model ("share the minimum", enforced in RLS)

1. **Personal expenses** (`space_id IS NULL`) are visible only to `owner_id`. This includes their items and flags.
2. **Shared expenses** are visible to **active** members of the space (`left_at IS NULL`). A member who leaves loses access.
   - Shared expenses can never be `proposed`: AI drafts live in `ai_proposals` until a person confirms them.
3. **Private notes** are kept only in `expense_notes`, which only the author can see. The `note` field in the RPC payloads writes the *caller's* note.
4. **Payment method ("How I paid")** lives in `settlement_methods`, not in `settlements`. It is visible to:
   - the person who recorded the settlement,
   - the payer (`from_member`'s user),
   - everyone else in the space **only if** the payer has `privacy_settings.share_payment_method = true`.

   Read it through `settlements_with_method`. The UTR stays on `settlements` so that both parties can reconcile.
   - Note: `expenses.paid_via` (e.g. "Paid by you · UPI") **is** visible to space members.
5. **Profiles** (phone, name) are owner-only. Other members see only `space_members.display_name` and `upi_vpa`, which the payer needs.
6. **Account deletion**: see `delete_my_account` below.

**Implementation notes:**
- Policies use `(select auth.uid())`.
- Membership checks go through the `SECURITY DEFINER` helpers `private.my_space_ids()`, `my_owned_space_ids()` and `my_member_ids()`. They are evaluated once per query, and they avoid recursion on `space_members`.
- SELECT policies use the index-friendly form `space_id = any (array(select private.my_space_ids()))` (migration 07). The `in (select ...)` form is a hashed filter that forces a sequential scan of the whole table.
- The `private` schema is not exposed through the API.

## Money invariants (enforced by the database)

- For a `confirmed` shared expense, `sum(expense_shares.owed_minor) = total_minor`. A **deferred constraint trigger** checks this at COMMIT, so direct REST writes can't leave an unbalanced expense behind. Use the RPCs.
- Composite FKs guarantee that every `paid_by_member`, share member and settlement party belongs to the row's space.
- If `items` are sent, `sum(items.amount_minor) = total_minor`.
- The item shares of each item must add up to that item's amount.
- If **every** item has shares, then each member's item-share total must equal their `expense_shares.owed_minor`.

## Settlement state machine (trigger `private.guard_settlement`, applies to every writer)

```
initiated        -> pending | completed | failed | confirmed_manual | cancelled
pending          -> completed | failed | confirmed_manual | cancelled
failed           -> initiated (retry) | completed (UPI reversal: it did go through) | confirmed_manual | cancelled
completed        -> corrected | cancelled
confirmed_manual -> corrected | cancelled
corrected        -> cancelled        (a further correction stays 'corrected' with a new amount)
cancelled        -> terminal
```

- A new row starts as `initiated` (UPI hand-off) or `confirmed_manual` ("Paid in cash / another way", or recorded by the receiver).
- `amount_minor` can change only while the status is `initiated`, or together with a move to (or within) `corrected`. The previous amount is saved to `corrected_from_minor`.
- `space_id`, `from_member` and `to_member` can't be changed.
- `completed_at` is set when the status enters `completed` or `confirmed_manual`.
- UI mapping for the "Did it reach?" screen:
  - "Yes, it went through" → `completed`
  - "Still pending" → `pending`
  - "It failed" → `failed`
  - "Paid in cash" → `record_settlement(..., p_method => 'cash', p_status => 'confirmed_manual')`

## RPC functions (`supabase.rpc(name, args)`; all use `set search_path = ''`)

| Signature | Returns | Notes |
|---|---|---|
| `create_space(p_name text, p_type space_type, p_starts_on date = null, p_ends_on date = null, p_budget_minor bigint = null, p_members jsonb = '[]', p_default_split jsonb = null)` | `uuid` space id | `p_members`: `[{display_name, upi_vpa?, user_id?, share_weight?}]`. The caller is added as `owner` with `display_name = profiles.name` (or 'Me'). `default_split` defaults to `{"method":"equal"}`. Its shape is owned by `packages/core`. |
| `create_expense(p jsonb)` | `uuid` expense id | See the payload below. Runs atomically. It also writes the caller's note, and marks `proposal_id` as `accepted` (or `proposal_status`). |
| `update_expense(p_expense_id uuid, p jsonb)` | `uuid` | Same payload. Scalar keys that are **absent** keep their current value. `items` and `shares` are **always replaced**. Allowed for the creator, the payer member, or a space owner. |
| `record_settlement(p_space_id uuid, p_from_member uuid, p_to_member uuid, p_amount_minor bigint, p_method settlement_method = 'upi', p_status settlement_status = 'initiated', p_upi_app text = null, p_note_ref text = null, p_utr text = null)` | `uuid` | The caller must be a party (either member) or a space owner. `p_status` must be `initiated` or `confirmed_manual`. |
| `update_settlement_status(p_id uuid, p_status settlement_status, p_utr text = null, p_amount_minor bigint = null)` | `settlements` row | `p_amount_minor` is required for `corrected`. Passing the same status is allowed (e.g. to add a UTR). |
| `confirm_captured_txn(p_id uuid, p_category_id uuid = null, p_space_id uuid = null, p_shares jsonb = null)` | `uuid` expense id | The inbox item must be `inbox`. With no `p_space_id` it creates a personal expense. With `p_space_id` it needs `p_shares` (`[{member_id, owed_minor}]`), and the caller is the payer. It matches the merchant by `vpa`. `source` maps as follows: upi_notification→upi_alert, sms→sms, ebill→ebill, manual→manual. For "Not mine", update `status='not_mine'` directly. |
| `delete_my_account()` | `void` | `SECURITY DEFINER`, because it deletes the `auth.users` row. A trigger then deletes personal data (personal expenses, notes, inbox, proposals, rules, budgets, goals, devices, settings, profile) and anonymises shared rows: member rows become `display_name='Former member'`, `user_id=null`, `left_at=now()`, and shared expenses get `owner_id=null`. Balances stay intact. If the user was a space's last owner, the longest-standing active member is promoted. The same trigger also runs for deletions made from the dashboard or the admin API. **The Edge Function must delete Storage receipts first.** |
| `register_device(p_token text, p_platform device_platform, p_app_version text = null)` | `uuid` | `SECURITY DEFINER`, so it can move a token that another account registered on the same phone. |

**`create_expense` payload:**

```jsonc
{
  "space_id": "uuid | null",          // null = personal
  "title": "Tandoor House",
  "total_minor": 199200,               // required, > 0
  "occurred_at": "2026-10-13T21:42:00+05:30",   // default now()
  "category_id": "uuid", "merchant_id": "uuid",
  "paid_by_member": "uuid",            // required iff space_id; must be in the space
  "paid_via": "upi", "source": "scan", "status": "confirmed",  // 'proposed' only for personal
  "currency": "INR", "captured_txn_id": "uuid", "recurring_series_id": "uuid", "receipt_path": "text",
  "proposal_id": "uuid", "proposal_status": "accepted | edited",
  "note": "caller's private note",
  "items": [ { "name": "Butter Naan", "qty": 4, "unit_price_minor": 6000, "amount_minor": 24000,
               "kind": "item", "category_id": null,
               "shares": [ { "member_id": "uuid", "amount_minor": 12000, "units": 2, "pct": null } ] } ],
  "shares": [ { "member_id": "uuid", "owed_minor": 69951 } ]   // required iff space_id; sum = total_minor
}
```

## Error codes

Errors are raised as `'<code>: detail'`. Match on the code prefix.

- **`42501` (not authenticated or not allowed):** `not_authenticated`, `not_space_member`, `not_a_settlement_party`, `expense_not_found_or_forbidden`, `settlement_not_found_or_forbidden`, `captured_txn_not_found_or_forbidden`, `only_space_owner_can_change_role`.
- **`22023` (invalid input):** `invalid_payload`, `invalid_total`, `invalid_amount`, `invalid_members`, `member_display_name_required`, `paid_by_member_required`, `paid_by_member_not_allowed_on_personal_expense`, `payer_not_in_space`, `shares_required`, `shares_not_allowed_on_personal_expense`, `invalid_share`, `duplicate_share_member`, `shares_sum_mismatch`, `share_member_not_in_space`, `items_sum_mismatch`, `invalid_item_share`, `item_shares_sum_mismatch`, `item_shares_not_allowed_on_personal_expense`, `item_shares_member_mismatch`, `illegal_initial_settlement_status`, `illegal_settlement_transition`, `settlement_amount_locked`, `correction_requires_new_amount`, `settlement_member_not_in_space`, `settlement_parties_immutable`, `captured_txn_not_in_inbox`, `member_user_id_immutable`, `member_space_immutable`, `settlement_created_by_immutable`, `expense_owner_immutable`, `invalid_token`.
- **`23514`:** `shares_sum_mismatch` from the deferred commit check. The check constraint `expenses_proposed_personal_only` also uses this code.

## Realtime

The `supabase_realtime` publication includes `expenses`, `expense_shares`, `settlements` and `captured_txns`. RLS applies to what each subscriber receives.
