# PayMind Edge Functions

All functions are Deno, `verify_jwt = true` (a signed-in user's JWT in `Authorization: Bearer <access_token>` is
required), POST only, JSON in / JSON out. They use a **user-scoped** Supabase client, so RLS applies to every query.

Base URL: `https://nlkoxgbrhpkqwuzobjas.supabase.co/functions/v1/<name>`. With supabase-js:
`supabase.functions.invoke('ai-parse-bill', { body })`.

Errors always look like `{ "error": { "code": "...", "message": "human readable", "details"?: ... } }`.
Common codes: `401 not_authenticated`, `403 ai_disabled` (Privacy: AI off), `400 invalid_request`,
`413 payload_too_large`, `429 rate_limited`, `502 ai_unavailable | ai_bad_output`.

**Rate limits (per user, per hour; `consume_rate_limit`, migration 09):** `ai-parse-bill` 30, `ai-parse-expense` 60,
`ai-assistant` 60, `capture-ingest` 120, `send-reminder` 20. Body caps: `ai-parse-bill` 15 MB, `capture-ingest` 256 KB,
`ai-assistant` 200 KB, `send-reminder` 100 KB, `ai-parse-expense` 16 KB (enforced on the streamed bytes, not only Content-Length).

All money is integer paise (`...Minor`). AI outputs are validated with the zod schemas in
`packages/core/src/schemas.ts` (vendored to `_shared/schemas.ts`, see "Keeping shared code in sync").

## Environment variables (Project → Edge Functions → Secrets)

| Name | Required | Default | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | **yes** | none | Groq API key (never commit it) |
| `AI_PROVIDER` | no | `groq` | `groq`, `xai` (needs `XAI_API_KEY`) or `anthropic` (needs `ANTHROPIC_API_KEY`; `chatTools` not implemented) |
| `AI_MODEL_TEXT` | no | `openai/gpt-oss-120b` | text / tool-calling model |
| `AI_MODEL_VISION` | no | `qwen/qwen3.8-27b` | bill photo model (must accept images) |
| `PUBLIC_WEB_URL` | no | `https://paymind.vercel.app` | base of reminder pay links (`/pay/<token>`) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

**Model choice (checked against GroqDocs on 2026-09-30):** `llama-3.3-70b-versatile` and `llama-4-scout` (the old
defaults) were shut down in Jul/Aug 2026 and `qwen3.6-27b` on 14 Sep 2026. Text/tools: `openai/gpt-oss-120b` (production,
tool use + JSON schema output). Vision: `qwen/qwen3.8-27b` (production, natively multimodal; used in JSON-object mode with the
schema spelled out in the prompt). Override with the env vars above if Groq changes again.

## How the user adds the secret

1. Open the Supabase dashboard → project **PayMind** (`nlkoxgbrhpkqwuzobjas`).
2. Left menu → **Edge Functions** → **Secrets** (also reachable from Project Settings → Edge Functions).
3. **Add new secret**: name `GROQ_API_KEY`, value = your key from console.groq.com → **Save**. No redeploy needed.
4. Optional extra secrets: `AI_MODEL_TEXT`, `AI_MODEL_VISION`, `PUBLIC_WEB_URL`.

## Functions

### `ai-parse-bill`
Request: `{ "imageBase64": "<base64, no data: prefix>", "mimeType": "image/jpeg|image/png|image/webp" }` **or** `{ "text": "<e-bill text>" }`.
Images up to ~10 MB. Convert HEIC to JPEG on the client. The image is **discarded** unless `privacy_settings.keep_receipts` is on
(then it is stored at Storage `receipts/<uid>/<uuid>.<ext>`, private bucket).

Response:
```jsonc
{
  "proposalId": "uuid",              // ai_proposals row, kind 'bill_parse', status 'pending'
  "bill": BillParseResult,           // merchant, items[], subtotalMinor, discounts[], serviceCharge, tax[], tipMinor, totalMinor, ...
  "flags": BillFlag[],               // Bill Detective: { type, reason, lineIndex|null, amountMinor|null, resolution: null }
  "receiptPath": "uid/uuid.jpg" | null
}
```
Flags are deterministic (qty x price, subtotal vs items, duplicate line, service charge, GST rate/amount, total arithmetic) and
worded as explanations, not accusations. The proposal payload is `{ source: 'scan'|'ebill', bill, flags, receiptPath }`.

### `ai-parse-expense`
Request: `{ "text": "Spent 300 on auto with Neel yesterday", "locale": "en-IN|hi-IN|kn-IN" (default en-IN), "source": "text|voice" (default text), "today": "YYYY-MM-DD" (optional, client's local date) }`.
Speech-to-text happens on the device; send the transcript.

Response:
```jsonc
{
  "proposalId": "uuid",              // kind 'expense_parse'
  "expense": ExpenseParseResult,     // amountMinor, merchant, category (slug), date, with[], paidBy, paidVia, split, note, spaceHint
  "resolution": {
    "spaceId": "uuid|null", "spaceName": "string|null", "meMemberId": "uuid|null",
    "people": [{ "spoken": "Neel", "memberId": "uuid|null", "displayName": "...", "spaceId": "uuid|null",
                 "ambiguous": false, "candidates": [{ "memberId", "displayName", "spaceId", "spaceName" }] }]
  }
}
```
Names are matched against the caller's visible members (RLS). Only names, never amounts, go into the model prompt.

### `ai-assistant`
Request: `{ "messages": [{ "role": "user|assistant", "content": "Who owes me money?" }] }` (1 to 20 messages, last must be `user`).

Response: `{ "reply": "string", "proposals": [{ "id": "uuid", "kind": "create_expense|reminder", "payload": {...} }], "toolsUsed": ["get_balances"] }`.
Read tools: `get_balances`, `search_expenses`, `get_budget_status`, `get_space_summary`. Write tools are **propose-only**
(`propose_expense`, `propose_reminder` insert `ai_proposals` rows with status `pending`; the app shows a "Needs your OK" card).
The assistant can never commit data. Tool loop is capped at 5 iterations. Proposal payloads:
`create_expense`: `{ source: 'assistant', expense: { amountMinor, merchant?, category?, date?, spaceId?, paidByMemberId?, paidVia?, splitWithMemberIds?, note? } }`;
`reminder`: `{ memberId, memberName, spaceId, tone, repeat }` (confirm by calling `send-reminder`).

### `capture-ingest`
Called by the Android app after on-device parsing. Request: `{ "items": [{ "direction": "debit|credit", "amountMinor": 29900, "payee": "Brew Street", "vpa": "brew@okaxis", "occurredAt": "2026-10-14T10:15:00+05:30", "app": "phonepe|gpay|paytm|bhim" (optional), "dedupeHash": "..." }] }`
(1 to 50 items; `dedupe_hash` also accepted). Anything else (including raw notification text, or any string over 500 chars) is rejected per item.
Requires `privacy_settings.capture_notifications = true` (else `403 capture_disabled`).

Behaviour: `source` = `upi_notification` if `app` is present, else `sms`; `direction` (+ `app`, optional `recurring_hint: true`) is stored in
`captured_txns.parsed`; rows land as `inbox`; idempotent on `(user, dedupe_hash)`; category suggested from `learned_rules`
(match `{vpa|payee|raw}`, action `{category_id|category_slug}`) then known merchant VPAs; `recurring_hint` when the same payee/VPA with a similar amount was seen twice+ in 120 days.

Response: `{ "inserted": 2, "duplicates": 1, "rejected": [{ "index": 3, "reason": "unexpected_field: raw" }], "items": [{ "id", "dedupeHash", "suggestedCategoryId": "uuid|null", "recurringHint": false }] }`.

### `send-reminder`
Request: `{ "memberIds": ["uuid", ...] (or "memberId"), "tone": "friendly|neutral|firm", "repeat": "once|every_3_days|weekly", "items"?: [{ "memberId": "uuid", "amountMinor": 185000 }] }`.
`memberIds` are the member rows of one person across spaces (combined message). Amounts default to what each member owes the
caller from `balances` (min of the caller's credit and the member's debt in that space); pass `items` to override (e.g. from simplified debts).

Response: `{ "reminderId", "message": "Hey Rahul! Quick one ...\n<url>", "url": "<PUBLIC_WEB_URL>/pay/<token>", "token", "amountMinor", "items": [{ "spaceId", "spaceName", "amountMinor" }], "pushed": 1 }`.
Creates a `reminders` row (token is random, 24 chars; `note_ref` like `PM-7F3K2A`). Best-effort Expo push to recipients with devices
(respects `notification_prefs.settlement_reminders`). Errors: `nothing_owed`, `cannot_remind_self`, `member_not_found`.

## Not an Edge Function: database RPCs used by the apps

- `create_space_invite(p_space_id, p_member_id) -> text` (8-char code), `preview_space_invite(p_code) -> {space_name, member_name, invited_by, expires_at, usable}`,
  `accept_space_invite(p_code) -> {space_id, member_id}`. Invites are the only way to attach another real user to a space; `create_space` now rejects `members[].user_id`.
- `get_pay_link(p_token) -> {payee_name, payee_upi_vpa, amount_minor, note_ref, items: [{space_name, description, amount_minor}]} | null`: callable by `anon`
  (public `/pay/<token>` page). Nothing else is exposed.

## Layout, deploy and local checks

```
supabase/functions/
  _shared/        ai/ (types, openai_compat, groq, xai, anthropic, index), auth.ts, http.ts, detective.ts, schemas.ts
  ai-parse-bill/  ai-parse-expense/  ai-assistant/  capture-ingest/  send-reminder/   (index.ts + deno.json each)
```
- Type-check: `deno check --config ai-parse-bill/deno.json ai-parse-bill/index.ts` (same for each). Tests: `deno test --config ai-parse-bill/deno.json _shared/detective.test.ts`.
- Deploy: `supabase functions deploy <name>` from the repo root (or the Supabase MCP `deploy_edge_function`, passing `_shared/*` files with the function's files).
- The zod schemas are vendored: run `node scripts/sync-edge-shared.mjs` after editing `packages/core/src/schemas.ts`
  (it also rewrites the import to `npm:zod@4` and maps `bank_transfer` to `bank`).
- The deployed `_shared/schemas.ts` for the MCP-deployed versions is a trimmed subset (primitives + AI output schemas); redeploying with the CLI ships the full file.
