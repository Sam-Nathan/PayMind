# PayMind — UI build order

Groups the 24 designed screens (plus the un-designed glue they need) into the milestones of `docs/PLAN.md` §8. Screen numbers/sections refer to `screens.md`; component names to `components.md`.

Legend: **(D)** = designed in the PDF · **(N)** = not in the design, must be built (keep the same visual language) · routes are Expo Router paths under `apps/mobile/app/`.

---

## M0 (context, already scoped in PLAN) — tokens, shell, Home from seed data
- Tokens + fonts (Doto, Onest) → `packages/ui-tokens`; formatters (`formatINR`, Indian grouping) in `packages/core`.
- Primitives needed first: `Card`, `Button`, `Chip`, `SegmentedControl`, `AmountText`, `MemberAvatar`, `StatCard`, `QuickActionBar`, `InsightCard`, `InboxRow`, `ListRow`/`DateBadge`, `SpaceMiniCard`, `ProgressBar`, `SectionHeader`, `DotTexture`, `HeroHeader`, `BottomTabBar` + `ScanFab`.
- **Home `(tabs)/index` (D §1)** rendered from seed data only (static safe-to-spend, balances, coming-up, spaces, goal). Wire navigation targets as stubs.
- Tab shell: `(tabs)/index`, `(tabs)/spaces`, `(tabs)/ask` (placeholder), `(tabs)/money` (placeholder), centre ScanFab → `add-bill` (placeholder).

## M1 — Auth, spaces, manual expenses, balances
Screens:
1. **Auth (N)** — `(auth)/sign-in` (phone OTP, Google, Apple), `(auth)/otp`, onboarding `(auth)/profile` (name, UPI VPA). Use `paper` bg, oxblood `HeroHeader` with Doto "PayMind" wordmark (from PDF page 1 hero), `TextField`, primary `Button`.
2. **Home `(tabs)/index` (D §1)** — now live: greeting (`profiles.name`), OWED/OWE cards from the `balances` view, spaces row, Coming-up hidden until recurring exists, insight card hidden, safe-to-spend hero shows budget-based fallback or `—` (no balance consent yet), goal card hidden.
3. **Spaces list `(tabs)/spaces` (D §13)** — `FeaturedSpaceCard` (only when a trip is settling), `SpaceRow`, "Start a space" type chips + CTA.
4. **Create space (N)** — modal `space/new` from "Create <type> space": name, type (chips), dates + budget (trip/event), members (contacts / name-only non-app members), default split. Simple `Sheet`/stack page using `TextField`, `Chip`, `Button`.
5. **Space detail, basic `space/[id]` (D §14 layout, generic)** — ship the **Trip layout reduced** as the generic space detail: header hero (name, total, budget bar if any), "Who paid what" (`PaidBars`), Activity list, **+ Add expense**, Settle. Variant-specific content (couple/roommates/family) is M5; until then every space type renders this generic layout.
6. **Manual add expense (N)** — route `add-expense` (modal; not in the route list — **ambiguity**: design only has scan/voice/ask entry). Reuse the **Voice "Here's what I heard" 2-col `FieldTile` grid** (amount, merchant, category, date, with, paid-by, split, note) without the hero, plus `Save expense` button, and equal/by-percent split only. Entry points: `add-bill` "Type instead", space detail "+ Add to …", Home quick action. Writes `expenses` + `expense_shares`.
7. **Expense detail (N)** — bottom `Sheet` from any row (edit/void).
8. **Balances (D fragments)** — balances surface in Home stat cards, Spaces rows' right status (`You owe`/`Owed`/`All square`) and space detail `PaidBars`. No standalone screen; the read model is the `balances` view.

Components introduced: `ScreenHeader`, `IconButton`, `HeaderPill`, `TextField`, `Sheet`, `SpaceRow`, `FeaturedSpaceCard`, `AvatarStack`, `PaidBars`, `KeyValueRow`, `EmptyState`, `Skeleton`, `Toast`.

## M2 — Split, settle, pay, verify, reminders/history
Order (each needs the previous):
1. **Split `split/[id]` (D §4)** — works on any expense with items. Until scan exists (M3), items come from manual add (add an "Items" mode to `add-expense`: reuse the Understand **Items card** as an editable list — build `ItemRow` + totals `KeyValueRow` now, since `understand/[id]` (M3) reuses them). Build `PersonToggle`, `MemberChip`, `ItemSplitRow`, `ShareSummary`, `StepPills`; split engine in `packages/core` (item/quantity/rule; remainder paise deterministic). AI "FAIR SPLIT · SUGGESTED" card: render only when a proposal exists (M3); for M2 show a static rule-based rationale or hide.
2. **Settle `settle` (D §5)** — `StatCard` pair, "You pay" card, "You get back" list, `SimplifiedCard` with **simplify-debts** (`packages/core`), manual "Paid in cash/Paid another way" sheet → `settlements.status='confirmed_manual'` / `corrected`.
3. **Pay `pay/[id]` (D §6)** — UPI deep link builder, `UpiAppTile` grid (Android package-targeted intents via Expo module; iOS schemes; web QR), note_ref (`PM-<space>-<period>`), disclosure `StatusBox`.
4. **Verify `verify/[id]` (D §7)** — `VerifyTimeline`, answer buttons, optional UTR; status machine initiated → pending → completed/failed/confirmed_manual/corrected/cancelled.
5. **Reminders & history `reminders` (D §19)** — person tiles, tone/repeat `SegmentedControl`s, message preview, `SettlementRow` + `StatusPill` history; `reminders` table, combined-items message builder, `paymind.link/pay/<token>` link (web landing in Next.js).
6. Wire-ups: Home "Remind all in one tap" → `reminders`; Home You-owe card → `settle`; space detail "Settle" → `settle` (filtered); Spaces "Settle all" → `settle`; Timeline/Verify deep links later.

Components introduced: `PersonToggle`, `MemberChip`, `ItemRow`/`ItemSplitRow`, `ShareSummary`, `StepPills`, `DebtRow`/`SimplifiedCard`, `UpiAppTile`, `StatusBox`, `VerifyTimeline`, `StatusPill`, `SettlementRow`, `Checkbox`.

## M3 — AI: scan, understand, voice, ask, search
1. **Add bill `add-bill` (D §2, camera/upload/e-bill part)** — `Viewfinder`, `ShutterButton`, `SegmentedControl` (Camera/Upload/E-bill), upload to Storage, edge function → `ai_proposals` (kind `bill_parse`). *The "Picked up automatically" inbox section is M5.* E-bill tab can be a stub ("Coming soon") if email parsing isn't ready.
2. **Understand `understand/[id]` (D §3)** — merchant card, `DetectiveCard`/`FlagCard` (`bill_flags`), editable items + totals (reuse M2 components), bottom action bar ("Just me" / "Split with …"). Corrections → `learned_rules`.
3. **Voice `voice` (D §9)** — record (expo-av) → STT (Hindi/Kannada/English) → Claude parse → `FieldTile` light grid + consequence `StatusBox` → Save. Also becomes the editing surface for "Edit" on proposals.
4. **Ask `(tabs)/ask` (D §8)** — `ChatBubble`, `ProposalCard` ("Needs your OK"), `SuggestionChips`, `Composer`; tool-use edge function; proposals confirm/edit/reject. Scoped trip asks ("ASK THIS TRIP" chips on space detail) reuse the same function with `space_id`.
5. **Search `search` (D §10)** — NL query → filter chips, merchant-grouping card (`merchant_aliases`), matches list, "Make a report from this". Reached from Ask header and Timeline header.
6. Merchant recognition + smart categories surfaces (chips on Understand, alias regroup `Sheet`).

Components introduced: `Viewfinder`, `ShutterButton`, `RecordButton`, `Waveform`, `DetectiveCard`, `FlagCard`, `FieldTile`, `ProposalCard`, `ChatBubble`, `Composer`, `Chip (mono)`.

## M4 — Money: budgets, safe-to-spend, recurring, goals, timeline, insights, afford
1. **Money `(tabs)/money` (D §20)** — safe-to-spend card (computed; AA balance not yet available → manual balance entry or budget-based fallback, see ambiguity below), `MiniStat`s, `BudgetRow` accordion, "Other budgets" grid, "+ New budget" `Sheet`.
2. **Recurring `recurring` (D §21)** — total card, "Worth a look" `InsightNoteCard`s, subscriptions list with `FlagLabel`, other recurring list, reminder `Switch`; `recurring_series` detection job (same amount N months).
3. **Goals `goals` (D §22)** — `GoalCard`s, planner (`Slider`, finish-date calc), contributions; "+" new-goal `Sheet`. (Couple shared goal display lands in M5.)
4. **Timeline `timeline` (D §23)** — `timeline_events` view, filter `Chip`s, day groups with `TypeBadge` rows.
5. **Insights `insights` (D §11)** — `ForecastChart`, `DriverRow`s, pattern tiles, `AnomalyCard` (`anomalies`), nudge list + frequency `SegmentedControl`.
6. **Afford `afford` (D §12)** — presets, `Slider`, `VerdictCard`, worked-out rows, `ScenarioToggleCard`s, assumptions.
7. Home becomes fully live: safe-to-spend hero (computed), "Coming up", "PAYMIND NOTICED" `InsightCard`, goal card, budget card %.
8. Nudge engine (pg_cron + Edge Function) feeding Home insight and Insights "Recent nudges".

Components introduced: `ForecastChart`, `DriverRow`, `AnomalyCard`, `NudgeRow`, `BudgetRow`, `VerdictCard`, `ScenarioToggleCard`, `Slider`, `Switch`/`SettingRow`, `TypeBadge`, `GoalCard`, `InsightNoteCard`, `MiniStat`.

## M5 — Space modes, trip report, privacy, auto-capture
1. **Space variants `space/[id]`** (switch on `spaces.type`):
   - **Trip/Event (D §14)** — already the base layout (M1); add `ASK THIS TRIP`, "Where it went" `StackedBar`, Report button, event pre-state (`₹0 / budget`, Upcoming).
   - **Couple (D §16)** — clay hero, ratio `ChoiceChips`, split bar, "This month together", shared goal card.
   - **Roommates (D §17)** — statement card, `BillRuleCard`s (equal / by usage / by room), meter readings, auto-added recurring bills.
   - **Family (D §18)** — oxblood hero with Household / Just mine toggle, who put in what, household categories, coming up, household insight, family goal.
2. **Trip report `trip-report/[id]` (D §15)** — report layout, PDF export, share link/web page, AI "stood out".
3. **Privacy & data `privacy` (D §24)** — all `SettingRow` groups bound to `privacy_settings`/`consents`/`notification_prefs`, learned-rules list/reset, export CSV+receipts, date-range delete, account delete (anonymise to "Former member"). (Build the settings screen skeleton earlier if consent toggles are needed for M3/M4; the screen is listed M5.)
4. **Auto-capture inbox (D §2 bottom + Home InboxRow)** — `CapturedTxnCard` list at the bottom of `add-bill`, Home `InboxRow` with count; Android notification-listener/SMS native module (Expo module) → `captured_txns` → parse → Confirm/Edit/Not mine.
5. Android auto-capture consent flow tied to Privacy "UPI & bank alerts".

## Un-designed glue (build in the milestone shown, keep visual language)
| Surface | Milestone | Suggested design |
|---|---|---|
| Auth / onboarding | M1 | Oxblood hero + Doto wordmark, `TextField`, primary `Button` |
| Create space | M1 | Modal sheet; type `Chip`s; fields per type |
| Manual add expense | M1 | Voice field-grid (no hero) |
| Expense detail / edit | M1 | `Sheet` |
| Notifications list (Home bell) | M4 | Timeline filtered to Alerts |
| Notification/consent permission prompts | M3/M5 | `Sheet` with shield `StatusBox` |
| Budget / goal / subscription-cancel editors | M4 | `Sheet`s |
| Empty & loading states | each | `EmptyState`, `Skeleton` |
| Account Aggregator consent | M6 | Privacy row → AA redirect |

## Open design ambiguities (resolve with product owner; builders should pick the noted default)
1. **Tab bar visibility** differs per screen in the PDF (present on Spaces detail Trip/Couple/Roommates, Goals, Timeline, Insights, Add bill, Settle; absent on Family, Recurring, Reminders, flows). Default: show on all screens inside the four tabs and on `add-bill`/`settle`; hide on full-screen flows (`understand`, `split`, `pay`, `verify`, `voice`, `search`, `afford`, `trip-report`, `privacy`).
2. **Manual add-expense form** is not designed (only scan/voice/ask). Default: voice field grid.
3. **Create-space flow**, auth, and notifications list are not designed.
4. **Rounding**: summaries use whole rupees (₹572, ₹1,293) while split screens show paise (₹571.68, ₹1,292.49). Store paise; round only at display.
5. **Total before/after Remove it**: Understand shows the pre-fix total ₹2,091.00; Split shows ₹1,992.00 after the duplicate soda is removed and service charge/GST recompute to 5 % of the discounted subtotal (₹86.00 each). Implement tax/service as percentages of the (subtotal − discount) base so totals update when items change.
6. **Doto usage**: hero numbers only — the PDF uses Onest for Insights forecast (₹61,800), Afford amount (₹20,000), Goals (₹14,800), all row amounts. Do not use Doto there.
7. The design contains text overlap artefacts where labels wrap (e.g. "Butter Chicken" over the person toggles, "(paid)" over the bar). Treat as rendering glitches; allow 2-line wrapping and push content down.
8. Filter button on Home and the Ask `Message` label have no defined behaviour.
9. Safe-to-spend needs bank balance (Account Aggregator is M6). Until then use manual balance entry or a budget-based fallback, labelled accordingly.
