# PayMind — Build Plan

> Status: draft. The design file (`PayMind.pdf`) is on the owner's local machine and has not been
> added to the repo yet. Screen list, data model details and feature scope get locked once it is
> committed at `design/PayMind.pdf`.

## 1. Goal

One backend and one database shared by three clients:

| Client  | Tech |
|---------|------|
| Android | Expo (React Native) |
| iOS     | Expo (React Native), same codebase as Android |
| Web     | Next.js |

Android preview on a real phone is required from day one.

## 2. Tech stack

### Shared backend: Supabase
- **PostgreSQL**: the one database all three clients use.
- **Supabase Auth**: email/OTP, Google and Apple sign-in. The same user account works on every platform.
- **Row Level Security (RLS)**: access rules live in the database, so no client can read or write
  another user's data, whatever platform it runs on.
- **Edge Functions (Deno + Hono)**: logic that must not run on the client, such as payment
  webhooks, reconciliation, notifications and third-party API keys.
- **Storage**: receipts, avatars, attachments.
- **Realtime**: live balance and transaction updates across devices.
- **Migrations**: SQL files in `supabase/migrations`, applied with the Supabase CLI. Generated
  TypeScript types are shared with every client.

Why Supabase and not a custom Node/Express API: it gives managed Postgres, auth, storage and
realtime in one place. That removes a whole service to build, host and secure. Custom logic still
has somewhere to live (Edge Functions), and because it is plain Postgres, moving off it later
stays possible.

### Mobile (Android + iOS): Expo SDK (React Native, TypeScript)
- Expo Router (file-based navigation, shares its mental model with Next.js)
- NativeWind (Tailwind for React Native), so styling matches the web
- TanStack Query + supabase-js for data fetching, caching and offline behavior
- Expo SecureStore for session tokens; expo-local-authentication for biometrics
- EAS Build / EAS Update for store builds and over-the-air updates

### Web: Next.js (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- `@supabase/ssr` for server-side auth
- Hosted on Vercel

### Monorepo: pnpm + Turborepo
```
apps/
  mobile/        Expo app (Android + iOS)
  web/           Next.js app
packages/
  db/            generated Supabase types + query helpers
  core/          Zod schemas, business rules, formatting (shared by all clients)
  ui-tokens/     colors, spacing, typography from the design file
supabase/
  migrations/    SQL schema + RLS policies
  functions/     Edge Functions
  seed.sql
design/
  PayMind.pdf
```

### Payments (confirm against the design)
If PayMind moves money: Stripe (cards, Apple Pay, Google Pay) through Edge Functions and
webhooks. Card data never touches our database. If PayMind only tracks spending, Plaid or a
similar bank-feed service instead. The design file decides which one.

### Quality and tooling
- TypeScript strict, ESLint, Prettier
- Vitest (unit), pgTAP (RLS policy tests), Playwright (web end-to-end), Maestro (mobile end-to-end)
- GitHub Actions: lint, typecheck and test on every PR; check migrations on a Supabase branch

## 3. Previewing on your Android phone

1. Install **Expo Go** from the Play Store.
2. Run `pnpm --filter mobile start` (runs `expo start`) on your machine. Scan the QR code with
   Expo Go and the app loads live with hot reload.
3. Once we add native modules Expo Go can't host, switch to an **EAS development build**: EAS
   builds an APK in the cloud, you install it once, and it then loads live code the same way.
4. To share a build without a dev server, use `eas build -p android --profile preview`. It
   produces an installable APK link.
5. From a cloud session (no local machine), use `eas update --branch preview` and open the
   update in Expo Go or the dev build.

The web app can be previewed on the phone's browser from the Vercel preview URL on each PR.

## 4. Data model (initial; revised once the design is in)

- `profiles` (1:1 with `auth.users`): name, avatar, currency, locale
- `accounts`: user's wallets, cards or bank accounts
- `categories`: system and user-defined
- `transactions`: amount (integer minor units), currency, category, account, merchant, note, occurred_at
- `budgets`: per category, per period
- `payment_requests` / `transfers`: only if the design includes P2P payments
- `notifications`, `devices` (push tokens for Expo Notifications)

Rules: money stored as `bigint` minor units, never floats. Every table has RLS enabled with a
policy on `auth.uid()`. Indexes on `(user_id, occurred_at desc)` for feeds.

## 5. Multi-agent workflow

An orchestrator (Opus) owns the plan, splits the work, checks every hand-off and does final
integration. Grunt work goes to Sonnet. Design decisions, security and code review go to Opus,
where mistakes are expensive.

| # | Agent | Model | Tasks | Why this model |
|---|-------|-------|-------|----------------|
| 0 | **Orchestrator** | Opus | Reads the design, keeps this plan current, assigns tasks, reviews each agent's output before merge, resolves conflicts between agents | Needs the whole picture and judgment; it is the single point of consistency |
| 1 | **Architect** | Opus | Database schema, RLS policies, Edge Function API contracts, shared Zod schemas in `packages/core` | Schema and security mistakes spread into every client and are costly to migrate later |
| 2 | **Design extractor** | Sonnet | Turns the PDF into a screen inventory, user flows and design tokens (`packages/ui-tokens`) | Careful but mechanical reading and transcription |
| 3 | **Scaffolder** | Sonnet | Monorepo setup, Turborepo, Expo app, Next.js app, ESLint/Prettier/TS config, CI workflow | Boilerplate with well-known patterns |
| 4 | **Backend builder** | Sonnet | Writes migrations and Edge Functions from the Architect's spec, seed data, generates types | Implementation against a precise spec |
| 5 | **Mobile builder(s)** | Sonnet (1–2 in parallel, split by feature) | Expo screens, navigation, forms, queries, following the tokens | High-volume UI work; parallel worktrees keep them apart |
| 6 | **Web builder** | Sonnet | Next.js pages mirroring the mobile flows, responsive layout | Same as above |
| 7 | **Test writer** | Sonnet | Vitest units, pgTAP RLS tests, Playwright and Maestro flows | Repetitive, spec-driven |
| 8 | **Security reviewer** | Opus | Audits RLS, auth flows, payment webhooks, secret handling, input validation | Subtle, high-stakes issues that need deep reasoning |
| 9 | **Performance and code-quality reviewer** | Opus | Reviews every milestone diff for query efficiency (N+1, missing indexes, over-fetching), bundle size, render performance, duplicated logic that belongs in `packages/core` | You asked for heavy review focused on efficiency; this is where Opus pays off |

Parallelism: builders run in isolated git worktrees so they don't overwrite each other. The
Orchestrator merges. Reviewers run after each milestone, not only at the end, so problems are
caught while they are still cheap to fix.

Loop per milestone:
```
Architect spec (Opus) → Builders (Sonnet, parallel) → Tests (Sonnet)
  → Security + Performance review (Opus, parallel) → fixes (Sonnet) → Orchestrator merge (Opus)
```

## 6. Milestones

| M | Deliverable | Agents |
|---|-------------|--------|
| M0 | Design inventory + tokens; monorepo scaffold; CI green; Android preview via Expo Go | 2, 3 |
| M1 | Schema v1, RLS, auth (email/OTP + Google/Apple) on mobile + web | 1, 4, 5, 6, 8 |
| M2 | Core feature screens (from design): home/dashboard, transactions, accounts | 5, 6, 7, 9 |
| M3 | Payments / bank integration via Edge Functions + webhooks | 1, 4, 8 |
| M4 | Realtime, push notifications, offline caching | 4, 5, 9 |
| M5 | End-to-end tests, performance pass, EAS preview builds, Vercel production deploy | 7, 8, 9 |

## 7. Needed from you
1. **Commit `PayMind.pdf` to `design/`** (or paste the screens). The cloud session can't reach
   `C:\Users\...` on your PC.
2. Confirm: does PayMind move money (Stripe) or track it (bank feeds / manual entry)?
3. A Supabase project to use, or approval to create one (the Supabase connector is available in
   this session).
4. An Expo account (free) for EAS builds and updates.
