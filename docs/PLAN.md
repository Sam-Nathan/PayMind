# PayMind — Build Plan

Source of truth for scope: `design/PayMind.pdf` (Product Concept V1: 26 pages, 44 capabilities).

## 1. What we're building (from the design)

PayMind is an AI money coordinator for people who share expenses: friends, couples, families,
roommates, trips and events. The market is India (₹, UPI; Hindi, Kannada and English).

The core loop is **Snap → Understand → Split → Settle → Pay → Verify → Track → Analyze.**

Principles that shape the backend:

| Principle in design | Backend consequence |
|---|---|
| *AI proposes, people confirm* | Every AI output is saved as a **proposal** row. It only becomes real data when the user confirms it. Nothing is auto-committed. |
| *A gateway, not a wallet* | PayMind never moves money. Payments go through **UPI intent links** that open the user's own UPI app. We store only settlement *state*: initiated → pending → completed / failed / confirmed-by-hand / corrected / cancelled. |
| *Explain, don't accuse* | Bill Detective and anomaly flags are stored with a `reason` and the user's `resolution`. |
| *Share the minimum* | Members of a space see only the shared items and balances. Personal spending is never visible to them. This is enforced in Postgres RLS, not in app code. |
| Delete account → "Former member" | Personal data is deleted, and shared rows are anonymised rather than removed. |

Screens in the design: Home, Add bill / auto-capture inbox, Understand (Bill Detective), Split,
Settle up, Pay (UPI handoff), Verify, Ask PayMind, Voice entry, Search, Insights, Can I afford
this?, Spaces list, Trip / Couple / Roommates / Family spaces, Trip report, Reminders & history,
Money (safe-to-spend + budgets), Recurring & subscriptions, Goals, Timeline, Privacy & data.

## 2. Architecture

```
 Android (Expo) ─┐
 iOS (Expo) ─────┼──► Supabase (Mumbai region, ap-south-1)
 Web (Next.js) ──┘     ├─ Postgres  ← single shared DB, RLS on every table
                       ├─ Auth      (phone OTP, Google, Apple)
                       ├─ Storage   (receipt images, optional; deleted after parse if user opts out)
                       ├─ Realtime  (balances, timeline, settlement status)
                       ├─ Edge Functions (Deno/TS, Hono router)
                       │    ├─ ai/parse-bill      → Claude vision
                       │    ├─ ai/parse-expense   → text/voice transcript → structured proposal
                       │    ├─ ai/assistant       → tool-use agent (read tools + propose-only write tools)
                       │    ├─ ai/insights|report → forecasts narration, trip reports
                       │    ├─ capture/ingest     → SMS/notification/e-bill parsing
                       │    ├─ aa/webhook         → Account Aggregator balance consent (later)
                       │    └─ reminders/send     → push + shareable pay links
                       └─ pg_cron → recurring detection, forecasts, nudges, reminder schedules
```

**Deterministic money logic lives in `packages/core` (pure TypeScript) and is never done by the
LLM.** This covers: fair-split maths (by item, quantity, %, fixed amount, rule), spreading tax and
tip, debt simplification (net balances, then greedy largest-debtor ↔ largest-creditor matching,
as described on page 7), safe-to-spend, budget pace, forecasts and goal ETA. The same code runs on
the client for instant previews and in Edge Functions / SQL for the saved result. The LLM only
extracts, categorises, explains and proposes.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Database / backend | **Supabase**: Postgres 16, Auth, RLS, Storage, Realtime, Edge Functions, pg_cron | One DB for all three clients. RLS enforces *share the minimum* for every client. Mumbai region for India data residency (DPDP Act). |
| Mobile | **Expo SDK (React Native, TS)**, Expo Router, NativeWind, TanStack Query, Reanimated, expo-camera, expo-av (voice), expo-notifications, expo-secure-store, expo-local-authentication | One codebase for Android and iOS. Custom native modules (SMS/notification reading, UPI app picker) are possible through Expo Modules. |
| Web | **Next.js (App Router)**, Tailwind, shadcn/ui, `@supabase/ssr`, Vercel | Full web app, plus the public `paymind.link/pay/…` landing pages used by reminders |
| Shared | pnpm + Turborepo; `packages/core` (split/settle/forecast maths + Zod schemas), `packages/db` (generated types), `packages/ui-tokens` | Money logic and types are written once and used everywhere |
| AI | **Claude API** via `@anthropic-ai/sdk` in Edge Functions. Default model `claude-opus-5-5`, with structured outputs for bill and expense parsing and tool use for the assistant. Keys stay server-side. | Vision reads bill line items, tax, discount and tip. Tool use powers "Ask PayMind". Structured outputs make proposals schema-valid. Cheaper tiers for high-volume categorisation can be evaluated later against real data. |
| Speech-to-text | Indian-language STT provider (e.g. Sarvam AI or Google Cloud STT) → transcript → Claude parse | Needed for Hindi and Kannada voice entry |
| Payments | UPI deep links (`upi://pay?pa=&pn=&am=&tn=&tr=`). Android uses package-targeted intents (PhonePe, GPay, Paytm, BHIM). iOS uses app URL schemes. Web shows a UPI QR code. | Matches *gateway, not a wallet*. No payments licence needed. Verification is done by the user ("did it reach?") plus an optional UTR. |
| Bank balance | Account Aggregator through a licensed FIU partner (Setu / Finvu), **later milestone** | Powers safe-to-spend. Needs regulatory onboarding. |
| Fonts / tokens | Doto (hero numbers only), Onest (everything else). Colors: Oxblood #6E1F1B, Signal #B3261E, Ink #232833, Steel #BCCCD6, Clay #E3A06F, Paper #F7F5F0 | Taken from the design's visual language page |
| Quality | TS strict, ESLint, Vitest, pgTAP (RLS tests), Playwright (web), Maestro (mobile), GitHub Actions | |

## 4. Data model (v1)

```
profiles(id→auth.users, name, phone, upi_vpa, locale, currency, deleted_at)
spaces(id, type[trip|event|couple|family|roommates|friends|college|office|custom],
       name, starts_on, ends_on, budget_minor, default_split jsonb, status)
space_members(space_id, user_id|null, display_name, role, share_weight, left_at)   -- supports non-app members
split_rules(space_id, bill_kind, method[equal|ratio|by_room|by_usage|by_item|fixed], params jsonb)
merchants(id, canonical_name, category_id) ; merchant_aliases(merchant_id, raw_text, vpa)
categories(id, parent_id, owner_id|null, name)
expenses(id, owner_id, space_id|null, merchant_id, category_id, total_minor, paid_by_member,
         paid_via, occurred_at, source[scan|voice|text|upi_alert|sms|ebill|manual],
         visibility[personal|shared], note_private, status[proposed|confirmed|void])
expense_items(expense_id, name, qty, amount_minor, kind[item|discount|service|tax|tip])
item_shares(item_id, member_id, units|pct|amount_minor)
expense_shares(expense_id, member_id, owed_minor)                 -- materialised result of the split
bill_flags(expense_id, type, reason, resolution)                   -- Bill Detective
captured_txns(id, user_id, raw, parsed jsonb, status[inbox|confirmed|not_mine])
settlements(id, space_id, from_member, to_member, amount_minor, method, upi_app, note_ref,
            utr, status[initiated|pending|completed|failed|confirmed_manual|corrected|cancelled])
balances  -- SQL view: net per member per space, derived from expense_shares − settlements
reminders(id, from_user, to_member, amount_minor, items jsonb, tone, repeat, next_at, link_token)
budgets(id, owner_id|space_id, scope[monthly|weekly|category|group|event|trip], category_id, limit_minor, period)
recurring_series(id, user_id, merchant_id, cadence, expected_minor, next_due, kind[subscription|emi|bill], flags)
goals(id, owner_id|space_id, name, target_minor, target_date) ; goal_contributions(goal_id, member_id, amount_minor)
ai_proposals(id, user_id, kind, payload jsonb, status[pending|accepted|edited|rejected])
learned_rules(user_id, kind[category|merchant|split], match jsonb, action jsonb)  -- "learns from corrections"
anomalies(id, user_id, expense_id, reason, resolution)
timeline_events  -- view/union over expenses, settlements, budgets, goals, alerts
notification_prefs, privacy_settings, consents(aa, email, sms, keep_receipts, ai_enabled)
```

Rules:
- Money is stored as `bigint` paise, never floats. Remainder paise from splits are assigned deterministically.
- RLS policies: personal rows are visible only to the owner. Shared rows are visible to members of
  their space, but `note_private` and payment method are hidden through column-level views.
- Indexes on `(owner_id, occurred_at desc)`, `(space_id, occurred_at desc)` and `merchant_aliases(raw_text)` (trigram).

## 5. Platform constraints to plan around

1. **Auto-capture from UPI/bank alerts (feature 11) is Android-only.** iOS does not allow reading
   SMS or other apps' notifications. On iOS we use e-bill email forwarding and Account Aggregator instead.
2. **Google Play restricts `READ_SMS`.** We use a `NotificationListenerService` (a custom Expo
   module) with a clear opt-in, as on the Privacy page, and expect a Play policy declaration.
3. **UPI apps often don't return a result** (page 9). The flow is designed around manual
   confirmation plus an optional UTR. That matches the design, so no fix is needed.
4. Account Aggregator needs an FIU partner agreement. Safe-to-spend works from manual balances until then.

## 6. Previewing on your Android phone

- **Weeks 1–2, Expo Go:** install Expo Go from the Play Store, run `pnpm --filter mobile start`
  and scan the QR code. Covers all pure-JS screens with live reload.
- **Once native modules are added (notification listener, UPI intents), EAS development build:**
  run `eas build -p android --profile development` once, install the APK, and it then loads live
  code like Expo Go.
- **Shareable test build:** `eas build -p android --profile preview` gives you an APK download
  link. `eas update --branch preview` pushes JS changes to it over the air, which also works from
  a cloud session with no local machine.
- **Web:** every PR gets a Vercel preview URL you can open on the phone.

## 7. Multi-agent workflow

Rule: **Opus decides and reviews, Sonnet builds.** Opus goes where a mistake is expensive (money
maths, RLS, AI safety of write actions, efficiency). Sonnet handles high-volume, well-specified work.

| # | Agent | Model | Owns | Why this model |
|---|---|---|---|---|
| 0 | **Orchestrator / integrator** | Opus | Plan, task breakdown, hand-off checks, merging worktrees, keeping clients consistent with `packages/core` | Needs the whole picture; the single point of consistency |
| 1 | **Architect** | Opus | Schema, RLS policies, balance view, settlement state machine, Edge Function contracts, Zod schemas | Every client depends on this. Schema/RLS mistakes leak private spending or corrupt balances. |
| 2 | **Money-logic engineer** | Opus | `packages/core`: fair split, rounding, extras distribution, debt simplification, safe-to-spend, forecast, goal ETA, and property-based tests | Correctness-critical maths. A paisa off breaks trust; needs careful reasoning about invariants. |
| 3 | **AI-features engineer** | Opus | Prompts and schemas for bill parsing, Bill Detective, voice/text expense parsing, the assistant's tool set (read tools + *propose-only* write tools), eval sets | Designing proposals safely and evaluating quality needs judgment |
| 4 | **Design extractor** | Sonnet | Screen inventory → routes, component list, `ui-tokens`, copy strings | Mechanical transcription from the PDF |
| 5 | **Scaffolder** | Sonnet | Monorepo, Expo + Next.js apps, lint/TS config, CI, EAS + Vercel config | Boilerplate |
| 6 | **Backend builder** | Sonnet | Migrations from the Architect's spec, Edge Function handlers, pg_cron jobs, seed data (the design's personas: Sunny, Rahul, Priya, Karthik, Ananya…) | Implementation against a precise contract |
| 7 | **Mobile builders ×2** (parallel worktrees) | Sonnet | A: Home, Capture, Understand, Split, Settle, Pay, Verify. B: Spaces, Money, Insights, Goals, Timeline, Privacy. | Large volume of UI work; parallel builders cut calendar time |
| 8 | **Web builder** | Sonnet | Next.js versions of the same flows, plus the public pay-link pages | Same patterns, different renderer |
| 9 | **Native-module builder** | Sonnet, with Opus review | Android notification listener, UPI app intents, iOS URL schemes | Well-documented APIs, but store-policy sensitive, so Opus reviews |
| 10 | **Test writer** | Sonnet | pgTAP RLS tests, Vitest, Playwright, Maestro flows for the core loop | Repetitive and spec-driven |
| 11 | **Security & privacy reviewer** | Opus | RLS leakage tests (can a roommate see my personal spend?), auth, secrets, AI prompt-injection via bill text or notifications, account deletion/anonymisation, DPDP consent | High-stakes; subtle cross-tenant issues |
| 12 | **Performance & code-quality reviewer** | Opus | Every milestone diff: N+1 queries, missing indexes, heavy RLS subqueries, balance-view cost, over-fetching, bundle size, list rendering, duplicated logic that belongs in `packages/core`, LLM token spend | Your "make sure everything is efficient" requirement |

**Loop per milestone:**
```
Architect + Money-logic spec (Opus)
  → Builders in parallel worktrees (Sonnet)
  → Test writer (Sonnet)
  → Security review ∥ Performance review (Opus)
  → Fixes (Sonnet)
  → Orchestrator merges + Android preview build (Opus)
```
Reviews run at the end of **every milestone**, not only at the end of the project.

## 8. Milestones

| M | Deliverable | Agents |
|---|---|---|
| M0 | Design inventory, tokens, monorepo, CI, Supabase project (Mumbai), **Android preview in Expo Go** with Home rendered from seed data | 0, 4, 5 |
| M1 | Schema v1 + RLS + auth (phone OTP/Google/Apple); Spaces & members; manual expense entry; balances | 1, 2, 6, 7, 8, 10, 11 |
| M2 | Split engine (item/quantity/rule) + Settle (debt simplification) + UPI Pay + Verify + settlement history + reminders | 2, 6, 7, 8, 9, 12 |
| M3 | AI: bill scan + Bill Detective, text/voice entry, Ask PayMind (propose-and-confirm), merchant recognition, learning from corrections | 3, 6, 7, 11, 12 |
| M4 | Money: budgets, safe-to-spend, recurring/subscriptions, goals, timeline, insights, forecast, Can I afford this?, anomalies, nudges | 2, 3, 6, 7, 8, 12 |
| M5 | Space modes (trip reports, couple ratios, roommate rules, family), Android auto-capture, privacy centre + data export/delete | 6, 7, 9, 11 |
| M6 | Account Aggregator, end-to-end tests, performance pass, Play Store internal testing track, TestFlight, web production | all reviewers |

## 9. Decisions needed
1. A Supabase project: create a new one in Mumbai, or use an existing one?
2. An Expo account (for EAS builds) and an Anthropic API key (for Edge Functions).
3. Speech-to-text vendor for Hindi/Kannada.
4. Whether Android auto-capture (notification reading) is in the first release, given the Play policy review it triggers.
