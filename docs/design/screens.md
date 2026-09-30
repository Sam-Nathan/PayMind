# PayMind — Screen specs (pages 3–26 of `design/PayMind.pdf`)

Builders: implement from this file plus `components.md`. You do not need the PDF.

## 0. Conventions used in every section

**Reference frame.** The PDF phone frames are 292.5pt wide = a **390 px** phone (pt ÷ 0.75 = px). All sizes below are in px on that 390-wide frame. "≈" = measured/estimated from the render, not a spec value. Scale with `width/390` only if you need to; otherwise use them as dp.

**Tokens** (full table in `components.md` §1). Brand: `oxblood #6E1F1B`, `signal #B3261E`, `ink #232833`, `steel #BCCCD6`, `clay #E3A06F`, `paper #F7F5F0`, `white #FFF`, `muted #6A6459` (secondary text). Derived neutrals/tints used by the design but not on the palette page: `sand #EDE7DB` (tracks, segmented bg, neutral chips), `peach #F6E3D5` (clay tint), `mist #EDF3F6` (steel tint info box), `blush #FAEBE7` (signal tint), `slate #2F4A5D` (dark steel: "on track" text, Rahul avatar, credit amounts), `rust #994516` (dark clay: warnings, Priya avatar), `plum #5B4A78` (Arjun/Sneha avatar), `inkSoft #2E3442` (inner rows on ink cards), `stone #CBC2B3` (toggle-off track, "Shopping/Other" bars).

**Type.** `Doto` only for the hero numbers listed in each screen; `Onest` for everything else. Onest scale used: overline 11–12 px / 600 / tracking ≈1.3 px UPPERCASE; caption 12; body 13–15; row title 15–16 / 500–600; card title 17–19 / 600; screen title (tab roots: Spaces, Money, Ask) 28 / 700; sub-screen title (centred in header) 18 / 600; amounts in rows 16–17 / 700; big Onest amounts 25–38 / 700.

**Money formatting.** ₹ prefix, Indian digit grouping (`1,20,000`), integer rupees in summaries (`₹5,493`), **two decimals** on bill/split/settlement-math screens (`₹2,091.00`, `₹699.51`). Stored as paise (`bigint`); round only at display. Negative = `−₹` (true minus). Credits shown `+₹` in slate.

**Page shell.** Background `paper`. Horizontal gutter 16 px. Cards: `white`, 1 px hairline border ≈ `#E9E4DA`, radius ≈ 24–28, padding 16–18, no shadow (only the scan button and Home "owed" card carry a soft shadow). Vertical gap between cards 12–16. Sub-screens start with the **ScreenHeader**: 44×44 back button (radius ≈ 14, `sand`, chevron-left icon 20 ink) at x=16,y≈52; centred title 18 px 600; optional right action = 44 px-high sand pill (radius ≈ 14, label 14 px 600) e.g. "History", "Report", or a 44×44 icon button (search, share, +).

**Hero header** (Home, Pay, Voice, Family, Money safe-to-spend card, Trip): `oxblood`/`ink` surface with a dot texture (white dots ≈ 1 px radius on an 8 px grid at ≈ 8–10 % opacity) — see `HeroHeader`/`DotTexture`. Hero bottom corners radius ≈ 40.

**Bottom tab bar** (`BottomTabBar`): Home · Spaces · [raised Scan] · Ask · Money. Design shows it on Home, Add bill, Settle up, Ask, Spaces, Trip space, Couple space, Roommates space, Money, Insights, Goals, Timeline. It is **not** shown on Understand, Split, Pay, Verify, Voice, Search, Afford, Trip report, Recurring, Family space, Reminders, Privacy (full-screen flows). *Ambiguity:* Family space and Recurring lack the bar while siblings have it; recommendation = show the bar on every space variant, hide on flows.

**Demo data in the design** (use as seed): user Sunny; today Tue 14 Oct 2026; spaces Goa Trip, Flat 402, Ananya & me, Home · Hubli, Friends, Sneha's birthday; people Rahul, Priya, Arjun, Meera, Karthik, Neel, Ananya, Appa, Amma, Sneha.

**Chrome icons** (line icons, 1.75 px stroke, 22–24 px; Lucide/Phosphor equivalents fine): home, users, scan-frame (corner brackets with a dash), sparkles (4-point star, big + small), bar-chart (3 uneven verticals on a baseline), bell, sliders/filter, receipt, mic, arrow-left-right (swap), chevron-left/right, search, share, plus, camera, image, zap (flash), shield, calendar, house, rings (couple), users-round (family).

Route tree → `apps/mobile/app/`: `(tabs)/index|spaces|ask|money`, plus stack routes listed per screen.

---

## 1. Home — route `(tabs)/index` (page 3)

**Purpose:** Daily dashboard — what's safe to spend, who owes whom, what's coming, nudges. **Features:** 34 personal dashboard, 14 safe-to-spend, 17 nudges, 29 AI insights, 11 auto-capture (inbox count), 22 recurring (Coming up), 4/26/19 spaces shortcuts, 28 goal, 32 "remind all", 44 end-to-end loop.

**Layout, top → bottom**
1. **Hero (oxblood + dot texture, bottom radius ≈ 40, height ≈ 400 incl. the 70 px the stat cards overlap).**
   - Row y≈52: left "Hello, **Sunny**" 18 px, paper (regular "Hello, " + 700 name ← `profiles.name`, first name). Right: bell button 44×44 radius ≈ 14, bg white@12 % (≈ `#8C2B24`), bell icon paper, with a **clay dot** (≈ 8 px, top-right) when unread notifications exist; filter/sliders button 44×44, bg `#F3ECE2`, ink icon (opens no screen in the design → placeholder sheet "Customise home"; low priority).
   - Centred pill: clay dot 8 px + "SAFE TO SPEND TODAY" 12 px 600 tracking ≈1.5, paper on darker oxblood (`#571916`), h ≈ 38, radius full, px 18. y≈122.
   - **Hero number** `₹` + `1,166` ← *safe-to-spend per day* (computed). **Doto**, paper, digit height ≈ 52 (font ≈ 80), centred; the `₹` is small (≈ 26 px Onest 600) top-aligned to the digits' left.
   - Caption 13 px paper@85 %, centred, 2 lines: "a day for the next **18 days** — after bills, EMIs, goal savings and a **₹5,000** buffer. **How is this worked out?**" (18 ← days left until next salary/month-end; 5,000 ← buffer setting). "How is this worked out?" is a tappable phrase (underline-less, semibold).
2. **Stat cards row** (overlaps hero bottom; cards top-aligned staggered, bottom-aligned at y≈480). Gap 10, radius ≈ 28, padding 16. Overline 12 px 600 tracking ≈1.
   - **Owed to you** — `steel` bg, ≈ 138×172, soft shadow. Overline "OWED TO YOU" ink; amount `₹5,493` Onest 700 ≈ 32 ink ← Σ positive balances across spaces; meta "4 people · 2 spaces" 12 px ← distinct debtor count · spaces count; meta "Remind all in one tap" 12 px (tappable).
   - **You owe** — `signal` bg, ≈ 110×149. "YOU OWE" paper; `₹1,240` 700 ≈ 25 white ← Σ negative balances; meta "Karthik · Flat 402" (largest creditor · space).
   - **Oct budget** — `clay` bg, ≈ 88×127. "OCT BUDGET" (overline, 2 lines, dark brown); `55%` 700 ≈ 23 dark brown ← monthly budget used %; meta "used · day 14" (day of month).
3. **Quick actions** — container `sand`, radius ≈ 28, padding ≈ 14, h ≈ 104; 4 equal tiles (≈ 76×76, white, radius ≈ 18, gap 8): icon 22 in oxblood/signal over a 13 px 600 ink label: receipt **Scan bill**, sparkles **Ask**, mic **Say it**, swap arrows **Settle**.
4. **Insight card "PAYMIND NOTICED"** — `ink` card radius ≈ 28 padding 18. Sparkle icon + overline "PAYMIND NOTICED" (13 px, steel). Headline 19–20 px 600 paper: "Dining is running well ahead of your usual pace." Body 15 px paper@80 %: "₹6,240 spent on food so far vs ₹3,360 by this date in September. At this pace food ends near ₹13,400 against an ₹8,000 budget." (all numbers ← AI insight payload: spent, same-day-last-month, forecast, budget). Buttons (h ≈ 44, radius ≈ 18): primary "See why" (paper bg, ink text), secondary "Try a scenario" (transparent, 1 px paper@25 % border, paper text).
5. **Inbox row card** — white card radius ≈ 24 padding 16: 40×40 radius ≈ 12 `peach` badge with count `3` (rust 16 px 700); title "New transactions to confirm" 16 px 600; sub "Picked up from UPI alerts · 1 looks recurring" 13 px muted (wraps to 2 lines); chevron-right muted. ← `captured_txns where status='inbox'` (count; "looks recurring" = any with a recurring flag).
6. **"Coming up"** section title 18 px 600 + right link "All recurring" (14 px signal 600). White card (radius ≈ 24) with 3 rows (divider hairline, row h ≈ 64): DateBadge (day 16–17 px 700 over month 12 px muted `OCT`, width ≈ 48, centred) · name 15 px · right amount 17 px 700. Row 3 has a sub line 12 px **rust** 600: "Price up ₹150 since August". Rows: 18 OCT Credit card bill ₹8,450; 22 OCT Bike EMI ₹4,200; 27 OCT Flix+ Premium ₹649 ← next 3 `recurring_series` by `next_due`.
7. **"Your spaces"** title + right link "See all" (signal). Horizontal row of 3 SpaceMiniCards (≈ 176×185 incl. gaps; radius ≈ 24, padding ≈ 16): title 14–15 px 600 top-left, bottom block:
   - Goa Trip — `ink` card, white title; "₹68,400 total" 13 / "1 of 4 settled" 12 (paper@70 %) ← trip total, settlements completed/total.
   - Flat 402 — white card; "You owe" 12 px signal 600 / "₹1,240" 13 px signal 700.
   - "Ananya & me" (2 lines) — white; "All square" 12 px slate 600 / "60 / 40" 13 px slate 700 (couple ratio).
8. **Goal card** — white, radius ≈ 24, padding 16: title "Kashmir trip · with Ananya" 15 px 600 + right "38%" 15 px muted; ProgressBar (h ≈ 10, track `sand`, fill `signal`, radius full); text 13 px muted: "₹46,000 of ₹1,20,000 · on track for March 2027 at ₹14,800/month" (values ← goals + goal_contributions; projected date and monthly ← goal calc).
9. **BottomTabBar**, Home active.

**Interactions**
- Bell → notifications list (not designed; route to `timeline` filtered "Alerts").
- "How is this worked out?" → `(tabs)/money` (safe-to-spend breakdown card).
- Owed-to-you card / "Remind all in one tap" → `reminders`; You-owe card → `settle`; Budget card → `(tabs)/money`.
- Quick actions: Scan bill → `add-bill`; Ask → `(tabs)/ask`; Say it → `voice`; Settle → `settle`.
- See why → `insights`; Try a scenario → `afford`.
- Inbox row → `add-bill` scrolled to "Picked up automatically".
- Coming-up rows → `recurring`; "All recurring" → `recurring`.
- Space cards → `space/[id]`; "See all" → `(tabs)/spaces`. Goal card → `goals`.
- Centre scan → `add-bill`.

**Data needed:** `profiles`, **safe-to-spend** (computed: (AA balance − dues before next salary − goal contribution − buffer) ÷ days left; falls back to budget-based if no balance consent), `balances` view, `budgets` (monthly), `captured_txns`, `recurring_series`, `spaces`+`balances`, `goals`+`goal_contributions`, latest `ai_proposals`/insight.

**Empty/loading:** skeleton blocks in the same geometry. No balance consent → hero shows `—` and caption "Connect your bank balance to see what's safe to spend" with a button to `privacy`. No debts → stat cards show `₹0` ("Nobody owes you"). No inbox → hide row. No recurring → hide "Coming up". No spaces → single "Start a space" card linking `(tabs)/spaces`. No goal → hide.

---

## 2. Add a bill / auto-capture inbox — route `add-bill` (page 4)

**Purpose:** Capture a bill (camera / upload / e-bill) and confirm auto-captured transactions. **Features:** 1 bill scanning, 23 Bill Detective (live detection), 10 (input entry), 11 automatic capture, 41 merchant recognition.

**Layout**
1. ScreenHeader: back + title "Add a bill" (no right action).
2. **SegmentedControl** full width: `Camera` (selected: white pill, ink 14 px 600) · `Upload` · `E-bill` (muted 600). Track `sand`, radius ≈ 20, h ≈ 50, inner pill radius ≈ 16.
3. **Viewfinder card** — `ink` with dot texture, radius ≈ 36, height ≈ 470 (≈ 358×470). Top-centre status pill "Bill detected · hold steady" (13 px 600 paper on `#1B1F29`, radius full, h ≈ 34; shows "Looking for a bill…" before detection). Inside: a **clay 2 px rounded rectangle** (radius ≈ 20) framing the live bill; the detected receipt is tilted ≈ −3°. The mock receipt (for demos) is paper-white, monospaced (TANDOOR HOUSE / Hubli · 13/10/26 21:42 / 1 Paneer Tikka 320.00 / 1 Butter Chicken 420.00 / 1 Dal Makhani 280.00 / 4 Butter Naan 240.00 / 1 Veg Biryani 340.00 / 3 Fresh Lime Soda 270.00 / **1 Fresh Lime Soda 90.00 highlighted blush** / SUBTOTAL 1960.00 / DISC COUPON −150.00 / SVC CHG 5% 90.50 / GST 5% 90.50 / TOTAL 1991.00) — the live camera replaces it; the blush highlight is the on-device preview of Bill Detective.
4. **Capture row**: gallery button (56×56, white, radius ≈ 18, hairline border, image icon) · **shutter** (≈ 84 px: outer ring `signal`@20 %, inner `signal` disc with 3 px white ring) · flash button (56×56 same style, zap icon).
5. Helper text 13–14 px muted centred 2 lines: "Works with printed bills, screenshots, PDFs and e-bills from email. Nothing is saved until you confirm."
6. **"Picked up automatically"** title 18 px 600 + right "3 to review" 14 px muted. A stack of **CapturedTxnCards** (white, radius ≈ 24, padding 16):
   - Row1: merchant 16 px 600 · right amount `₹240` 17 px 700. Row2 12 px muted: "UPI alert · today 9:12 AM · BREWSTREET@ybl". Row3 13 px **slate** 600: "Food · Café — personal".
   - Buttons row (h ≈ 44): **Confirm** (ink bg, paper text, flex 1, radius ≈ 16), **Edit** (white, hairline border), **Not mine** (white, hairline border).
   - Card 1: Brew Street Café ₹240 (UPI alert, Food · Café — personal). Card 2: Metro card recharge ₹500 (Bank SMS · yesterday, Transport — personal). Card 3: FitHub Gym ₹1,499, "Card · 29 Sep · same amount 4 months running", third line "Looks recurring  Subscriptions" (link-style, rust/slate) and **no Confirm** buttons shown in the crop (implied: Confirm as recurring / Edit / Not mine; build identical buttons with Confirm label "Add to subscriptions").
7. Tab bar (scan tab highlighted as the current flow).

**Interactions:** Camera/Upload/E-bill switch the capture source (Upload → image/PDF picker; E-bill → pick from connected email bills list, or paste/share-in). Shutter or auto-detect → upload to Storage → edge function creates an `ai_proposals` (kind `expense_from_bill`) → `understand/[id]`. Gallery = Upload shortcut. Flash toggles torch. Confirm → `captured_txns.status='confirmed'` + create `expenses` (personal, `source` upi_alert/sms); Edit → edit sheet (merchant, category, amount, space, personal/shared); Not mine → `status='not_mine'` (teaches merchant rule). Card 3 tap → `recurring`. Back → previous.

**Data needed:** `captured_txns` (raw, parsed{merchant, vpa, amount, source, when, category, recurring_hint}, status), `merchants`/`merchant_aliases` (canonical names), `categories`, consent `sms` from `privacy_settings`; new `ai_proposals` row for scan; Storage bucket for receipts.

**Empty/loading:** camera permission denied → card with "Allow camera" button + Upload still works. Inbox empty → "Nothing to review. Payment alerts you allow will show up here." (and link to `privacy` if alerts consent off). While analysing → status pill "Reading your bill…" with spinner over frozen frame.

---

## 3. Understand (Bill Detective) — route `understand/[id]` (page 5)

**Purpose:** Show the parsed bill, flag oddities, let the user fix items before splitting. **Features:** 1, 23, 12 smart categories, 41, 40 learns from corrections, 10.

**Layout**
1. Header row: back button (44×44 sand) + centred **StepPills**: `Understand` (active: ink bg, paper text, 13 px 600, pill h ≈ 34) · `Split · Settle` (muted, not pressed-looking; tap → `split/[id]`).
2. **Merchant card** (white, radius ≈ 24, padding 16): 56×56 oxblood avatar radius ≈ 16 with "TH" (16 px 700 paper, initials ← merchant name); title "Tandoor House" 18 px 600; sub "Restaurant · Hubli · Tue 13 Oct, 9:42 PM" 13 px muted; chip row (Chip: white bg, hairline border, radius full, 13 px 600, h ≈ 36): `Food · Dining` (category), `Paid by you · UPI`, `3 people`; explanatory line 12 px **slate**: "Last 4 times here you tagged Dining and split with Rahul and Priya, so that's pre-filled." (learned rule text ← `learned_rules`).
3. **Bill Detective card** — `ink`, radius ≈ 28, padding 16. Overline (search icon + "BILL DETECTIVE · 2 TO REVIEW", clay 13 px 600 tracking). Two **FlagCards** (bg `inkSoft`, radius ≈ 20, padding 16):
   - "Possible double entry: Fresh Lime Soda" 15 px 600 paper; body 13 px paper@85 %: "\"1 Fresh Lime Soda ₹90\" is printed right after \"3 Fresh Lime Soda\". With 3 people at the table, 4 sodas may be a repeat. It also explains why the printed subtotal (₹1,960) is ₹90 above what the other items add up to." Buttons: **Remove it** (plain text button, paper 600, left) · **We had 4** (outlined paper@25 %, radius ≈ 16, h ≈ 44).
   - "Service charge added (5%)" — body: "Service charge is usually optional. If you didn't agree to it, you can ask for it to come off. We're not saying it's wrong — just worth a look." Buttons: **Keep it** · **It was removed**.
   - Green-check line (check icon + 13 px paper@75 %): "Quantities × prices, GST rate and discount all check out."
   - Tone rule: explain, never accuse.
4. **Items card** (white, radius ≈ 24): header "Items" 17 px 600 + right "Tap any value to edit" 12 px muted. Rows (h ≈ 49, hairline dividers): qty `1×` 12–15 px muted, name 15 px, amount 16 px 600 right with two decimals. Rows: 1× Paneer Tikka ₹320.00; 1× Butter Chicken ₹420.00; 1× Dal Makhani ₹280.00; 4× Butter Naan ₹240.00; 1× Veg Biryani ₹340.00; 3× Fresh Lime Soda ₹270.00; 1× **Fresh Lime Soda (repeat?)** ₹90.00 (row bg `blush`). Below: dashed-border button (radius ≈ 16, h ≈ 48) "+ Add a missed item". Qty/name/amount are inline-editable (tap).
5. **Totals card** (white, radius ≈ 24, padding 16; rows 15 px label muted-ink left, 16 px amount right): Subtotal ₹1,960.00 · Discount · coupon **−₹150.00** (slate) · Service charge 5% ₹90.50 · GST 5% ₹90.50 · Tip (not on bill, added by you) ₹100.00 (label "(not on bill, added by you)" 12 px muted). Divider. "Total you paid" 17 px 600 + **₹2,091.00** Onest 700 ≈ 27. Footnote 13 px muted: "Matches the printed bill. Resolve the flags to finalise." (becomes a warning state when subtotal ≠ Σ items).
6. **Bottom action bar** (sticky): `Just me` (white outlined, h ≈ 52) · **`Split with Rahul & Priya`** (signal, white 16 px 600, flex 1.6) — names ← suggested participants from learned rule.

**Interactions:** Remove it → removes item (`expense_items` row deleted; totals recalc: service/GST recompute to 5 % of the discounted subtotal → see Split page totals ₹1,992.00), flag `resolution='removed'`. We had 4 → keep item, clear flag (`resolution='confirmed'`). Keep it / It was removed → service charge flag resolution (`kept` / `removed` → service line removed). Flags reopen if user edits items. Every correction is written to `learned_rules` (only if `privacy_settings.learn_from_corrections`). Tap any amount/name/qty → inline edit; + Add → new `expense_items`. Category/chip taps → pickers. "Just me" → saves as personal expense, exits. "Split with …" → `split/[id]`. Step pills navigate between steps (Split/Settle enabled once flags resolved).

**Data needed:** `ai_proposals` (kind `bill_parse`, payload: merchant, datetime, items[], subtotal, discounts, service, tax, tip, printed_total), `expenses` (status `proposed`), `expense_items` (kind item/discount/service/tax/tip), `bill_flags` (type, reason, resolution), `merchants`, `categories`, `learned_rules`, `space_members` (participants).

**Empty/loading:** parsing skeleton ("Reading your bill…"); parse failure → "Couldn't read this bill" with "Try again" / "Enter manually" (manual = the editable items card with + Add). No flags → Detective card collapses to a single green-check line "Nothing odd found".

---

## 4. Split — route `split/[id]` (page 6)

**Purpose:** AI fair split by item, quantity, share or rule; tap names to adjust; approve and request. **Features:** 2 item-level splitting, 3 AI fair split, 5 (net), 40.

**Layout**
1. Header: back + StepPills (`Understand` muted · `Split` **active ink** · `Settle` muted).
2. **Suggestion card** — `oxblood` + dot texture, radius ≈ 28, padding 18. Overline "FAIR SPLIT · SUGGESTED" 13 px 600 tracking, `#F2C4B5`-ish light peach. Line 14–15 px paper: "Tandoor House · **₹1,992.00** paid by you". Bullets (14–15 px paper, "· " prefix): "Starter shared by all three" · "Naan by count: 2 for you, 1 each for Rahul and Priya" · "One soda each, mains to whoever ordered" · "Coupon, service, GST and tip spread by what each person ordered". Footer 12 px peach: "Tap a name on any item to change who had it." (bullets are AI-generated rationale text.)
3. **Participant strip** (horizontal, gap 8): MemberChips (white, hairline border, radius full, h ≈ 44, avatar 32 px letter circle + name 14 px 600): `S You` (signal), `R Rahul` (slate), `P Priya` (rust), plus a dashed 44×44 circle "+" (add participant/space member).
4. **Item cards** (one white card containing rows, radius ≈ 24; rows separated by hairline; padding 16). Each row: name 15–16 px 600 (+ " · starter" suffix when tagged) left, amount 16 px 600 right (2 decimals); below, **person toggles** (h ≈ 36, radius full, 13 px 600): *on* = filled with that person's colour + white text; *off* = white + hairline border + muted text. Then helper 12 px muted.
   - Paneer Tikka · starter ₹320.00 — You/Rahul/Priya all on. Shows a **SegmentedControl** (`Equal` selected | `Custom %` | `Custom ₹`) and helper "Shared equally by 3 · ₹106.67 each".
   - Butter Chicken ₹420.00 — only Rahul on. "Only Rahul had this".
   - Dal Makhani ₹280.00 — only Priya on. "Only Priya had this".
   - Butter Naan × 4 ₹240.00 — toggles show counts: `You × 2`, `Rahul × 1`, `Priya × 1` (tap to increment, cycles 0..qty). Helper "By quantity · ₹60 per naan · tap a name to change count".
   - Veg Biryani ₹340.00 — only You. "Only You had this".
   - Fresh Lime Soda × 3 ₹270.00 — all on. "Shared equally by 3 · ₹90.00 each".
5. **Extras card** (white, radius ≈ 24): "Coupon, service, GST & tip" 15 px 600 + right `+ ₹122.00` (net of −150 + 86 + 86 + 100; sign shown); SegmentedControl `In proportion to items` (selected) | `Equally`.
6. **Each person's share** — `ink` card, radius ≈ 28, padding 16. Overline "EACH PERSON'S SHARE" (steel) + right "Adds up to ₹1,992.00" 13 px steel. Three rows: label 15–16 px 600 paper ("You (paid)", "Rahul owes you", "Priya owes you") + amount 21 px 700 paper (₹699.51 / ₹720.81 / ₹571.68) + 6 px-high bar (track `inkSoft`, fill coral `#E27261` for You, steel for Rahul, clay for Priya; width = share ÷ total) + 12–13 px steel sub "Items ₹656.67 + extras ₹42.84" / "Items ₹676.67 + extras ₹44.15" / "Items ₹536.67 + extras ₹35.01".
7. **CTA** full-width `signal`, h ≈ 56, radius ≈ 18, white 17 px 600: "Approve & request ₹1,292.49" (= Σ others' shares; the ₹ figure is weight 700). Footnote 13 px muted centred: "Adds to Friends · updates everyone's balance · Rahul and Priya get a UPI link" (space name ← selected space).

**Interactions:** person toggle → adds/removes `item_shares` (units/pct/amount); `Custom %`/`Custom ₹` open inline numeric inputs per person (validate sum = 100 %/amount); tap "+" → member picker (non-app members allowed: name only). Extras segmented → `proportional|equal`. Everything recalculates live via `packages/core` split engine (remainder paise assigned deterministically; Σ shares must equal total to the paisa). **Approve & request** → confirms proposal: `expenses.status='confirmed'`, writes `expense_shares`, `balances` update, creates payment-request links (reminder row / `paymind.link/pay/…` for non-app members) → go to `settle` (or back to space). Step pill "Settle" = same destination. Destination space defaults to learned space (here "Friends") — show as tappable text in the footnote to change.

**Data needed:** `expenses`, `expense_items`, `item_shares`, `expense_shares`, `space_members` (+ `share_weight`), `split_rules`, `learned_rules`, `ai_proposals` (fair-split rationale bullets).

**Empty/loading:** if no participants besides you → "Just you" message and Approve disabled. Split total mismatch → red helper and disable Approve. AI suggestion loading → card shimmer; if AI off → use equal split and hide the rationale card.

---

## 5. Settle up — route `settle` (page 7)

**Purpose:** Net balances across spaces, fewest payments, one-tap settle/remind. **Features:** 5 debt simplification, 6 one-tap settlement, 7 UPI handoff entry, 32 combined reminders, 33 history entry.

**Layout**
1. Header: back · title "Settle up" · right sand pill "History".
2. Two summary cards side by side (radius ≈ 28, padding 16, h ≈ 112): **You owe** (`signal`; overline "YOU OWE" paper; `₹1,240` 700 ≈ 30 white; "1 person" 12 px) and **Owed to you** (`steel`; overline ink; `₹5,493` 700 ≈ 31 ink; "4 people · 2 spaces").
3. **"You pay"** section title 17–18 px 600. White card (radius ≈ 26, padding 16): Avatar 56 (slate "K") · "Karthik" 16 px 600 + sub 12 px muted "Flat 402 · Sept electricity + groceries" · amount `₹1,240` 19 px 700 right. Primary button full-width `signal` h ≈ 50 radius ≈ 16 "Pay ₹1,240 with your UPI app" (white 16 px 600). Two outlined buttons (white, hairline, h ≈ 46, radius ≈ 16, 14–15 px 600): "Paid in cash" · "Paid another way".
4. **"You get back"** title + right link "Remind all in one message" (13–14 px signal 600). White card list (rows h ≈ 76, hairline dividers): Avatar 56 · name+amount "Rahul · ₹2,571" 15–16 px 600 · sub 12 px muted "Goa Trip ₹1,850 · Tandoor House ₹721" · right outlined button "Remind" (h ≈ 40, radius ≈ 14, 13 px 600). Rows: Rahul (slate) ₹2,571; Arjun (plum) ₹2,300 · Goa Trip; Priya (rust) ₹572 · "Tandoor House · added just now"; Meera (oxblood) ₹50 · Goa Trip.
5. **Simplified card** — `ink`, radius ≈ 28, padding 18. Overline "GOA TRIP · SIMPLIFIED" (steel). Two stat lines with **Doto** numerals: `11` (paper, ≈ 46 px) "IOUs between 5 people"; `4` (clay, ≈ 46 px) "payments settle everything" (text 15 px paper@80 %). List rows (`inkSoft`, radius ≈ 14, h ≈ 44, padding 14): "Arjun → You ₹2,300", "Rahul → You ₹1,850", "Meera → Priya · paid 8 Oct ₹600" (row dimmed, amount struck through = already settled), "Meera → You ₹50". Footnote 13 px steel: "Net balances first (who is up, who is down), then the largest debts are matched to the largest credits. Nobody pays more than they owe overall."
6. Tab bar (no active tab highlighted; Home or none).

**Interactions:** History → `reminders` (history section). Pay with UPI → `pay/[id]` (id = pending `settlements` row created on tap, status `initiated`). Paid in cash / Paid another way → sheet: amount (editable → "CORRECTED"), method, optional note → `settlements.status='confirmed_manual'`. Remind → `reminders` pre-selected on that person; "Remind all in one message" → `reminders` (combined message per person). Simplified rows tap → `space/[id]` of that space. The simplified card is per space (Goa Trip shown; other spaces' cards follow). Design combines personal net across spaces: Rahul ₹2,571 = Goa ₹1,850 + Tandoor ₹721 (combined reminder).

**Data needed:** `balances` view (per member per space) → cross-space net per counterparty, **simplify-debts** (packages/core) per space, `settlements` (history incl. those already paid → struck-through), `profiles.upi_vpa`, `space_members`.

**Empty/loading:** all square → illustration-free centred text "You're all square. Nobody owes anything." and hide lists. Only "You pay" or only "You get back" → omit the other section.

---

## 6. Pay (UPI handoff) — route `pay/[id]` (page 8)

**Purpose:** Hand the payment to the user's own UPI app with payee/amount/note prefilled. **Feature:** 7.

**Layout**
1. **Oxblood hero** (dot texture, bottom radius ≈ 40, h ≈ 245): back button (44×44, white@12 % bg, paper chevron) + centred title "Pay Karthik" 16–17 px 600 paper; **Doto** `₹1,240` paper (digit height ≈ 50, font ≈ 79) centred; caption 13 px paper@80 %: "Your share · Flat 402 · September".
2. **Payee card** (white, radius ≈ 24, padding 16): row "To" 14 px muted — right "Karthik R" 15 px 700 + 12 px muted "karthikr@okbank · verified by UPI" (`profiles.upi_vpa`; "verified by UPI" after VPA validation). Divider. Label "Note that travels with the payment" 15 px muted; text field (bg `#FBF9F5`, hairline border, radius ≈ 14, h ≈ 48, 15 px) prefilled "PM-402-SEP · electricity + groceries" (`note_ref` token `PM-<space>-<period>` + editable text).
3. **"Open with"** 17 px 600; 2-column grid of **UpiAppTiles** (white, hairline border, radius ≈ 16, h ≈ 56; 34×34 radius ≈ 10 `sand` logo box with 2-letter oxblood label + name 14 px 600): `Pe PhonePe` (selected: 2 px `signal` border), `G Google Pay`, `Pt Paytm`, `B BHIM`, `… Other UPI app`. Use real app icons where installed (Android package query).
4. Checkbox row: 24×24 ink-filled checkbox radius ≈ 6 with white check; label 14 px "Always use this app".
5. **CTA** full width `signal` h ≈ 56 radius ≈ 18: "Continue in **PhonePe** ↗" (white 17 px 600, app name in 700, arrow-up-right icon).
6. **Disclosure box** (`mist` bg, radius ≈ 22, padding 16): shield icon slate + 13–14 px ink text: "PayMind isn't a bank or a wallet and never holds your money. We open your UPI app with the payee, amount and note filled in — you approve with your UPI PIN there, then come back here."

**Interactions:** tile → sets chosen app (`settlements.upi_app`); "Always use this app" → stores default in `profiles` prefs. Continue → creates/updates `settlements` (`initiated`, `note_ref`), opens `upi://pay?pa=&pn=&am=&tn=&tr=` (Android package-targeted intent; iOS app scheme; web shows QR) → when app returns → `verify/[id]`. Back → `settle`.

**Data needed:** `settlements` (id, amount_minor, upi_app, note_ref, status), payee `profiles.upi_vpa`/`space_members`, installed-app detection (native module), user default UPI app.

**Empty/loading:** payee has no VPA → replace "To" block with "Karthik hasn't added a UPI ID" + "Ask Karthik for UPI ID" / "Paid another way" buttons. No UPI apps found → only "Other UPI app" + "Show QR / copy UPI ID".

---

## 7. Verify payment — route `verify/[id]` (page 9)

**Purpose:** Reconcile a handoff the UPI app didn't confirm. **Feature:** 8 payment reconciliation.

**Layout**
1. Header: back · centred title "Back from PhonePe" (app name ← `settlements.upi_app`).
2. **Question card** (white, radius ≈ 28, padding 18): StatusPill-like label "NOT CONFIRMED YET" (peach bg, rust text, 12 px 700 tracking, radius full); headline "Did ₹1,240 reach Karthik?" 27 px 700; body 14–15 px muted-ink: "PhonePe didn't send a result back. That happens — tell us what you saw and we'll update Flat 402."
3. **Timeline card** (white, radius ≈ 24, padding 16): vertical list with 12 px dots (ink) joined by a 2 px `sand` line; last dot **clay** = unresolved. Items (title 15 px 600, sub 12 px muted): "Payment initiated" / "₹1,240 → karthikr@okbank · 10:14 AM"; "Opened PhonePe" / "Note PM-402-SEP attached"; "Returned to PayMind" / "10:15 AM"; "Not confirmed" / "No result from the UPI app".
4. **Answer buttons:** primary **Yes, it went through** (ink bg, paper 16 px 600, h ≈ 56, radius ≈ 18, full width); two outlined (white, hairline) **Still pending** · **It failed** (h ≈ 52, equal columns).
5. Label "Optional: UPI reference (UTR) from your app" 13 px muted; text input (white, hairline, radius ≈ 16, h ≈ 52) placeholder "12-digit reference" (numeric keypad).

**Interactions:** Yes → `settlements.status='completed'` (`confirmed_manual` if no automatic result), saves `utr` if given, recalculates `balances`, notifies payee, → back to `settle` with toast; Still pending → `pending` (reminder to re-check in N hours); It failed → `failed` then offer "Try again" (→ `pay/[id]`). Timeline rows append on each state change (initiated → opened → returned → result).

**Data needed:** `settlements` (status, utr, upi_app, note_ref, timestamps), event log for timeline (`settlement_events` or derived from status history).

**Empty/loading:** if app returned a definitive success/failure intent result, skip this screen (auto-update) and show a toast.

---

## 8. Ask PayMind — route `(tabs)/ask` (page 10)

**Purpose:** Chat assistant that proposes actions and waits for confirmation. **Features:** 9 AI assistant, 43 action-oriented AI, 10 text/voice entry.

**Layout**
1. Title row: "Ask PayMind" 28 px 700 (left, y≈56) with sub "Asks before changing anything" 14–15 px muted; right 44×44 sand button with search icon (→ `search`).
2. **Chat list.** User bubble right-aligned: `oxblood` bg, paper 16 px text, radius ≈ 22 (bottom-right corner ≈ 6), max-width ≈ 84 %: "I spent ₹850 on dinner with Rahul and Priya. I paid for everyone."
3. **ProposalCard** ("Needs your OK") — `ink` card radius ≈ 28, padding 16, full width. Header row: overline "CREATE EXPENSE + SPLIT" (clay 14 px 700 tracking) · right "Needs your OK" 14 px steel. 2×3 grid of FieldTiles (bg `inkSoft`, radius ≈ 16, padding 12; label 13 px steel uppercase-ish, value 16 px 700 paper): AMOUNT ₹850 · CATEGORY Food · Dining · DATE Today, 14 Oct · PAID BY You · UPI · SPLIT Equally · 3 · EACH OWES ₹283.33. Summary 14–15 px paper@85 %: "Rahul and Priya will each owe you ₹283.33 in Friends." Buttons: **Confirm** (paper bg `#F1EEE7`, ink 16 px 600, h ≈ 56, flex 1, radius ≈ 18) · **Edit** (transparent, 1 px steel@35 % border, paper text, w ≈ 100).
4. **Suggestion chips** (two rows, wrap, white + hairline, radius full, 15 px 600, h ≈ 46): "Who owes me money?" · "Goa trip cost?" · "Why is spending up?" · "Subscriptions total".
5. **Composer** (docked above the tab bar): input (white, hairline, radius ≈ 20, h ≈ 56, placeholder "Spent 300 on auto with Neel, split it…") + 56×56 `signal` mic button (radius ≈ 18, white mic icon).
6. Tab bar with **Ask** active.

**Interactions:** chips → send as the user's message; answer (read-only) renders as an answer bubble (white card, text, optional mini table/list) — e.g. Trip answer "Rahul still owes ₹1,850…". Free text → edge function (tool-use) returns either an answer or an `ai_proposals` row rendered as ProposalCard. **Confirm** → proposal `accepted`, creates the entity (expense+shares), bubble "Done — added ₹850 · Friends" with Undo; **Edit** → opens the same fields as editable sheet (`voice` field grid) then `edited`; dismiss swipe = `rejected`. Mic → `voice`. Search icon → `search`. Proposal kinds to support: create expense + split, settle/remind, create reminder, create goal/budget, rename/re-categorise (extend card title, e.g. "SEND REMINDER", "CREATE BUDGET").

**Data needed:** `ai_proposals` (kind, payload, status), chat history (`ai_messages` — not in the plan's table list; needed), `spaces`/`space_members` (who "Rahul and Priya" resolve to), `balances`, aggregated expense data for answers. AI disabled in `privacy_settings` → composer disabled with note.

**Empty/loading:** first-open state: greeting bubble "Ask me about your money, or tell me an expense." + the 4 chips. Typing indicator: three dots in a white bubble. Offline/AI off: banner "AI is off — manual entry and plain search only" with link to `privacy`.

---

## 9. Voice entry — route `voice` (page 11)

**Purpose:** Speak an expense in Hindi/Kannada/English; review parsed fields; save. **Features:** 10, 40 (learned route guess).

**Layout**
1. **Ink hero** (dot texture, bottom radius ≈ 40, h ≈ 440): back (44×44 white@12 %) + title "Say an expense" 16 px 600 paper (centred); **waveform** (≈ 28 vertical rounded bars 4 px wide, varying heights 12–56, colour `#545B6E` (≈ steel@35 %), centred ≈ 280 wide); transcript in quotes 22 px 500 paper centred, 2 lines: "\"Three hundred on auto with Neel yesterday, I paid cash, split it half\""; **record button** (≈ 120 px: outer ring `signal`@25 % pulsing, disc `signal` ≈ 96, white mic icon 30); helper 13 px steel: "Hindi, Kannada and English understood · tap to re-record".
2. Section row: "Here's what I heard" 18 px 600 + right "Tap to fix" 13 px muted.
3. **Field grid** 2 columns (FieldTile white variant: white, hairline border, radius ≈ 18, padding 14; label 13 px muted UPPERCASE-ish, value 17 px 700 ink): AMOUNT ₹300 · MERCHANT Auto-rickshaw · CATEGORY Transport · DATE Yesterday, 13 Oct · WITH Neel · PAID BY You · cash · SPLIT Half each · NOTE "Station → flat" with `clay` 1.5 px border and 12 px rust caption "Guessed from your usual route" (= AI-inferred field is visually flagged).
4. **Consequence box** (`mist`, radius ≈ 22, padding 16, 14 px): "Neel will owe you **₹150** in Flat 402. It'll be grouped with his other open items in the next reminder."
5. Buttons: **Type instead** (white, hairline, w ≈ 130, h ≈ 54, radius ≈ 18, 2-line wrap OK) · **Save expense** (`signal`, white 16 px 600, flex 1).

**Interactions:** Record → expo-av capture → STT (Hindi/Kannada/English) → transcript shown live → Claude parse → `ai_proposals` (kind `expense_voice`) → fields fill in. Tap any tile → inline editor (amount keypad, category picker, date picker, member picker, paid-by/method, split type). Inferred/low-confidence fields get the clay outline + reason. "Type instead" → swaps the hero for a text field (same parser). Save → create `expenses` + `expense_shares` (`source='voice'`), go back. **Manual add expense** (M1) reuses this field grid with no hero (see build-order).

**Data needed:** `ai_proposals`, `merchants`/`categories`, `space_members` (resolve "Neel" → Flat 402), `learned_rules` (note guess), `profiles.locale`.

**Empty/loading:** mic permission denied → message + "Type instead". Listening: waveform animates, transcript streams. "Didn't catch that — tap to try again" on empty transcript. Parse pending: field tiles shimmer.

---

## 10. Search — route `search` (page 12)

**Purpose:** Natural-language search over money with grouped merchants and reports. **Features:** 37 natural search, 38 AI reports, 41 merchant recognition.

**Layout**
1. Row: back (44×44 sand) + **search field** (white, **2 px ink border**, radius ≈ 20, h ≈ 52, 17 px text, truncated): "How much did I spend on Uber this year".
2. **Filter chips** (wrap): `Uber this year` (selected: ink bg, paper text), `Involving Rahul`, `Above ₹5,000`, `Family groceries · Aug` (white + hairline, 15 px 600, h ≈ 40). These are suggested/parsed filter chips.
3. **Result hero** — `oxblood` + dot texture, radius ≈ 28, padding 18: overline "UBER · JAN–OCT 2026" (peach 14 px 600 tracking); **Doto** `₹14,280` paper (digit height ≈ 38, font ≈ 60); caption 15 px paper@85 %: "63 rides, about ₹227 each. Up in July and August when you commuted to the new office." (AI summary).
4. **Merchant-grouping card** (white, radius ≈ 24, padding 16): "Grouped as one merchant: Uber" 16 px 700; alias chips (mono font, 13 px, bg `sand`, radius ≈ 12, h ≈ 36): `UBER *TRIP HELP.UBER`, `UBER INDIA SYSTEMS`, `uber.india@upi`, `UBERRIDES BLR` (← `merchant_aliases.raw_text/vpa`); helper 14 px muted: "Food deliveries from the same company are kept under Food. Wrong? Tap a label to regroup."
5. **Matches card** (white): header "Matches" 18 px 700 + "63 rides" 14 px muted. Rows (h ≈ 80, divider): title "Uber" 17 px 600 + amount 17 px 700 right; sub 14 px muted "13 Oct · Station → Vidyanagar" → ₹212; "9 Oct · Airport → home · split with Rahul" ₹388; "2 Oct · Goa Trip · shared with 4" ₹146; "28 Sep · Office" ₹198 (more rows below, paginated).
6. Buttons: **Make a report from this** (ink bg, paper 16 px 600, flex 1.6, h ≈ 50, radius ≈ 16) · **Ask a follow-up** (white outlined).

**Interactions:** typing → debounced NL query → structured filters (edge function: entity, date range, amount, people, space) rendered as chips; tap chip toggles. Alias chip tap → regroup sheet (move alias to another merchant → writes `merchant_aliases`/`learned_rules`). Row tap → expense detail (sheet). "Make a report from this" → AI report (saved PDF/CSV; same style as `trip-report`) — v1 = shareable summary. "Ask a follow-up" → `(tabs)/ask` with the query as context. Back → previous.

**Data needed:** `expenses`/`expense_shares` (owner + shared-visible), `merchants`, `merchant_aliases`, `categories`, `spaces`, NL-query → SQL filter builder (server-side, RLS-scoped), AI summary sentence.

**Empty/loading:** initial state = recent searches + 4 example chips ("Uber this year", "Involving Rahul", "Above ₹5,000", "Family groceries · Aug"). No matches → "Nothing matches. Try a wider date range." Loading skeleton on hero + rows.

---

## 11. Insights — route `insights` (page 13)

**Purpose:** Month-end forecast, why it changed, patterns, unusual spends, nudge settings. **Features:** 15 forecast, 16 pattern analysis, 36 anomaly review, 29 AI insights, 17 money nudges.

**Layout**
1. Header: back · title "Insights · October" (month ← selected month) · right pill "Report".
2. **Forecast card** — `ink`, radius ≈ 28, padding 18, overflow hidden. Overline "MONTH-END FORECAST" (steel 13 px 600). `₹61,800` Onest 700 ≈ 38 paper + **delta pill** "+12% vs Sep" (`signal` bg, white 13 px 700, radius ≈ 12, h ≈ 30). Sub 14–15 px paper@75 %: "₹34,100 spent so far · 18 days to go". **Chart** (h ≈ 170): 5 months Jun–Sep–Oct on x; smooth **paper 2.5 px line** for actuals (Jun→Sep), then a **clay dashed** segment to the forecast point; the current month column (Oct) is a full-height **steel** (`#AEBCC7`) bar band running to the card's bottom with a ink dot + ring at the forecast value; 3 horizontal gridlines `inkSoft`; x labels 12–13 px steel (Oct label ink on the band). Y axis unlabeled.
3. **"Why October is higher"** card (white): title 17 px 700; 3 driver rows: label 14 px + right value 15 px 700 + bar (h ≈ 10, track `sand`): "Eating out · 9 dinners vs 4" **+₹4,900** (signal full bar); "Goa trip costs landing in Oct" **+₹2,300** (clay ≈ 47 %); "Electricity share" **−₹600** in slate (slate ≈ 12 %). Footnote 13–14 px muted: "6 of the 9 dinners were Friday–Sunday. Weekday spending is flat." (bar length = |value| ÷ max|value|.)
4. **"Patterns"** title. 2×2 tiles (radius ≈ 24, padding 16): `23` 25 px 700 + "café & snack payments under ₹300 — ₹3,900 in total" on `steel`; `62%` + "of dining spend happens on weekends" on `sand`; `₹11.9k` + "locked in recurring payments each month" on `sand`; `1` + "large one-off this month: headphones, ₹6,990" on `peach`. Numbers 24–25 px 700 ink; text 13–14 px.
5. **Anomaly card** — white with **clay 2 px border**, radius ≈ 28, padding 16: overline "UNUSUAL · PLEASE REVIEW" (rust 14 px 700 tracking); title "₹4,860 at Coastline Grill" 19 px 700; body 15 px: "About 3× your usual restaurant bill (₹1,550), and a place you haven't paid before. Probably a group dinner — just checking." Buttons (h ≈ 52): **Looks right** (ink bg, paper) · **Split it** (white outlined) · **Don't know it** (white outlined, wraps to 2 lines).
6. **"Recent nudges"** title; white list card (rows padding 16, dividers): text 16 px ("You've spent more on dining this week than in any week since June." / "Only ₹680 left in your entertainment budget for the next 18 days." / "Home · Hubli electricity came in 12% lower than last month."), meta 13 px muted: "Food · Sunday", "Budget · Monday", "Family · Saturday" (category/space · weekday).
7. **Nudge frequency card** (`sand`, radius ≈ 28, padding 16): "How often should PayMind nudge you?" 17 px 700; SegmentedControl (white track) `As it happens` (selected ink) | `Daily digest` | `Weekly`; link "Choose categories and quiet hours" (signal 15 px 600) → `privacy` notifications section.
8. Tab bar, **Money** active.

**Interactions:** Report → export AI report (PDF). Chart point tap → tooltip. Anomaly: **Looks right** → `anomalies.resolution='ok'` (learn merchant), **Split it** → `split/[id]` for that expense (pre-filled group), **Don't know it** → `anomalies.resolution='unknown'` → offers "Dispute / block card" info (PayMind never blocks; show steps). Nudge rows tap → related screen (Money category / `space/[id]`). Nudge frequency → `notification_prefs.nudge_frequency`.

**Data needed:** **forecast** (computed: spent-to-date + projected from pace + known recurring/trip items), monthly totals for last 5 months, driver decomposition, pattern stats (computed), `anomalies` (+ `expenses`, `merchants`), nudge log (`notifications` — table not in plan; or `ai_proposals` kind `nudge`), `notification_prefs`.

**Empty/loading:** < 2 months history → forecast card shows "Needs a few more weeks of data" with a flat chart skeleton, hide drivers. No anomalies → hide card. No nudges → "No nudges yet".

---

## 12. Can I afford this? — route `afford` (page 14)

**Purpose:** Scenario planning against safe-to-spend. **Features:** 30 can I afford this?, 31 scenario planning, 14.

**Layout**
1. Header: back · title "Can I afford this?".
2. **Scenario card** (white, radius ≈ 28, padding 16): preset chips (h ≈ 44, radius ≈ 16, 15 px 600) `Spend ₹5k this week` · `₹12k trip` · `₹20k phone` (selected = ink bg, paper text; white + hairline otherwise). Below: "Spend this month" 16 px muted (left) + amount `₹20,000` Onest 700 ≈ 32 ink (right, tappable to type); **Slider** (track `sand`/`#E5E2DB` h ≈ 10 with inner hairline, fill `signal`, thumb 22 px signal circle with white 3 px ring; range ≈ ₹0–₹30k step 500). Toggle between "this week" and "this month" follows the preset.
3. **Verdict card** — colour by outcome: `signal` (shown: "NOT THIS MONTH"), clay = "TIGHT", slate/steel = "YES, COMFORTABLY". Verdict pill (white bg, signal text, 13 px 700 tracking, radius full, h ≈ 36) · headline 24–26 px 700 white: "You could, but it would squeeze everything else." · body 15 px white@90 %: "Only ₹992 would be left for 18 days (₹55/day). Waiting until your 1 Nov salary keeps your goals and bills safe." (992 ← free − purchase; 55 ← ÷ days left).
4. **"How it's worked out"** card (white, radius ≈ 24, padding 16): title 18 px 700; rows 16 px (hairline dividers, amounts right 16 px): Money in your account ₹52,380 · Bills, EMI & dues before 1 Nov **−₹16,388** · Kashmir goal contribution **−₹10,000** · Safety buffer **−₹5,000** · (2 px ink rule) **Free to spend ₹20,992** (bold) · This purchase −₹20,000 · (rule) **Left for 18 days ₹992** (bold).
5. **"What if…"** title 18 px 700. 3 **ScenarioToggleCards** (white, hairline border 1.5 px, radius ≈ 22, padding 14): 26×26 checkbox (2 px ink border, radius ≈ 8) · title 16 px 600 + sub 13 px muted · right delta `+₹10,000` slate 600 (sign on its own line when narrow). Items: "Skip this month's Kashmir saving" / "Goal moves from March to April 2027" / + ₹10,000; "Eat out 20% less" / "Lowers what you need for the rest of the month" / + ₹1,560; "Cancel Flix Lite and NewsDaily" / "Saves ₹4,776 a year" / +₹398. Checking adds the delta to Free-to-spend and recomputes the verdict live.
6. **Assumptions card** (`sand`, radius ≈ 22, padding 16): title "Assumptions" 15 px 700; body 14–15 px: "Balance is from your linked account as of 9:00 AM today. Salary of ₹85,000 lands 1 Nov and isn't counted. Your usual day-to-day spend is the median of the last 3 months. This is a guide, not financial advice."

**Interactions:** chips set amount+period; slider/edit changes amount; what-if toggles are cumulative; verdict recalculated client-side from `packages/core` forecast inputs. No persistence required (optional "Save as budget").

**Data needed:** **safe-to-spend / forecast inputs**: AA balance + timestamp, dues before next salary (`recurring_series` + `settlements` owed + card bill), goal contribution (`goals`), buffer (settings), salary date/amount (user-provided or detected), usual daily spend (median 3 mo), subscription list (Flix Lite, NewsDaily) for the cancel scenario.

**Empty/loading:** no balance consent → card "Connect your bank balance to check affordability" + fallback mode using budget left (labelled "based on your budget"). Skeleton while computing.

---

## 13. Spaces list — route `(tabs)/spaces` (page 15)

**Purpose:** All shared spaces + create new. **Features:** 4 groups, 25 event, 26 trip, 18 family, 19 couple, 20 roommates, 35 group dashboard.

**Layout**
1. Title "Spaces" 28 px 700 + sub "Everyone you share money with" 15 px muted (left); right **ink button "Settle all"** (h ≈ 44, radius ≈ 16, px 16, paper 15 px 600) → `settle`.
2. **Featured space card** (Goa Trip, ended/settling) — `ink` + dot texture, radius ≈ 28, padding 18, h ≈ 145. Overline "TRIP · 2–6 OCT · ENDED" (steel 13 px 600 tracking). Title "Goa Trip" 26 px 700 paper. Right-top **clay pill** "Settling · 1 of 4" (clay bg, ink 13 px 700, radius full). Bottom-left **overlapping MemberAvatars** (36 px, −8 overlap, 2 px ink ring): S R P A M in colours signal/slate/rust/plum/oxblood. Bottom-right `₹68,400` 22 px 700 paper + "you're owed ₹4,200" 13–14 px steel.
3. **SpaceRows** (white, radius ≈ 22, padding 14, h ≈ 76): 52×52 radius ≈ 16 icon tile + title 18 px 700 + sub 13–14 px muted + right status block (right-aligned, 2–3 lines):
   - Flat 402 — `mist` tile, house icon slate — "Roommates · 3 people · 6 rules" — right "**You owe** ₹1,240" signal 700 (16 px).
   - Ananya & me — `peach` tile, rings icon rust — "Couple · 60 / 40 · 1 shared goal" — right "All square" slate 700.
   - Home · Hubli — `sand` tile, family icon oxblood — "Family · 4 people · Oct ₹38,450 of ₹45,000" — right chevron-right (no status).
   - Friends — `blush` tile with letter "F" oxblood 20 px 700 — "6 people · dinners, movies, cabs" — right "Owed" slate 600 + "₹1,293" slate 700.
   - Sneha's birthday — **dashed border** row (upcoming), `ink` tile with clay calendar icon — "Event · 24 Oct · 8 people · budget ₹15,000" — right "Upcoming" muted 600.
4. **"Start a space"** card (`sand`, radius ≈ 28, padding 18): title 19 px 700; chip grid (white, hairline, radius full, h ≈ 40, 15 px 600): `Trip` (selected ink) · `Event` · `Couple` · `Family` · `Roommates` · `Friends` · `College` · `Office` · `Custom`. Explainer box (white, radius ≈ 18, padding 14): overline "TRIP SPACES COME WITH" (muted 13 px 600) + "Dates and a budget. Anything you add during the trip is tagged to it automatically, and you get a full cost report when it ends." 15 px. Button **Create trip space** (`signal`, white 16 px 700, h ≈ 50, radius ≈ 16; label = "Create <type> space").
5. Tab bar, **Spaces** active.

**Interactions:** row/card → `space/[id]` (variant by `spaces.type`); Settle all → `settle`; type chip → changes explainer text and CTA label (Trip: dates + budget, tagging, report; Event: date + budget; Couple: split ratio + shared goals; Family: members + household budget; Roommates: rent, bill rules; Friends/College/Office/Custom: name + members); Create → create-space sheet/route (name, dates, budget, members — **not designed**; build a simple modal, see build-order).

**Data needed:** `spaces` (type, name, starts_on, ends_on, budget_minor, status), `space_members`, `balances` per space for the current user, settlement progress (completed/total), expense sums for total & month-to-date, `split_rules` count, `goals` count.

**Empty/loading:** no spaces → only the "Start a space" card expanded, plus title "No spaces yet". Skeleton rows. Ended + fully settled trips collapse to normal rows (featured card only for the most relevant active/settling space).

---

## 14. Space detail — Trip — route `space/[id]` (trip variant) (page 16)

**Purpose:** Trip dashboard: total vs budget, ask the trip, who paid what, categories, activity, settle. **Features:** 26 trip mode, 25 event mode (same layout), 24 group memory, 35 group dashboard, 9 ask (scoped), 33.

**Layout**
1. **Ink hero** (dot texture, bottom radius ≈ 40, h ≈ 290): back button (44×44 white@10 %) · centred "Trip · 2–6 Oct · 5 people" 14–15 px steel · right **paper pill "Report"** (h ≈ 44 radius ≈ 14, ink 14 px 600). Title "Goa Trip" 26 px 700 paper. **Doto** `₹68,400` paper (digit height ≈ 38, font ≈ 65). Budget ProgressBar (h ≈ 10, track `inkSoft`, fill `clay`, 91 %); below: left "91% of ₹75,000 budget" 14 px paper@80 % · right "₹13,680 per person".
2. **"Ask this trip"** card (white, radius ≈ 28, padding 16): sparkle icon + overline "ASK THIS TRIP" (oxblood 14 px 700 tracking). Chips (wrap, h ≈ 46, 15 px 600, 2-line wrap OK): "Who spent the most?", "Food total?", "How much did I pay?", **"What does Rahul owe?" (selected, ink bg)**, "Cost per person?". Answer box (`paper` bg, radius ≈ 18, padding 14, 16 px): "Rahul still owes ₹1,850 for the trip — to you. He also owes ₹721 from Tandoor House, so a combined reminder would ask for ₹2,571." (scoped AI answer with numbers from DB).
3. **"Who paid what"** card (white, radius ≈ 28): title 18 px 700 + right "line = fair share" 13 px muted. Per member: name 16 px 600 (left) + right "₹17,880 paid · **+₹4,200**" (balance in slate if +, signal if −, 14–15 px 600); bar (h ≈ 10, track `sand`, fill = member colour, width = paid ÷ max) with a **2 px ink vertical tick** at the fair-share position (same x for everyone ≈ 79 % = ₹13,680 ÷ max-paid-scale). Rows: You ₹17,880 paid · +₹4,200 (signal bar, full); Priya ₹14,280 · +₹600 (rust); Meera ₹13,030 · −₹650 (oxblood); Rahul ₹11,830 · −₹1,850 (slate); Arjun ₹11,380 · −₹2,300 (plum).
4. **"Where it went"** card: stacked horizontal bar (h ≈ 18, segments with 2 px gaps, radius full on ends) + legend in 2 columns (12 px colour square radius ≈ 4 + name 16 px + right amount 16 px 700): Stay ₹24,000 (oxblood) · Travel ₹18,600 (slate) · Food ₹14,200 (clay) · Activities ₹6,800 (steel) · Local rides ₹3,100 (rust) · Shopping ₹1,700 (stone).
5. **"Activity"** title 18 px 700; white list card (rows padding 16, dividers): title 16 px + sub 13–14 px muted + right (status label 13 px 700 tracking uppercase or amount 16 px 700): "Meera paid Priya ₹600 via UPI" / "8 Oct · confirmed by both" / **SETTLED** (slate); "Trip ended · report generated" / "7 Oct · shared with 5 people" / **REPORT** (muted); "Arjun added Parasailing · ₹4,500" / "5 Oct · split equally between all 5" / ₹4,500.
6. Buttons: **Settle trip** (`signal`, white 16 px 700, h ≈ 54, flex 1, radius ≈ 18) · **+ Add to trip** (white outlined). 
7. Tab bar, Spaces active.

**Interactions:** Report → `trip-report/[id]`; Ask chips → scoped AI answer (chip selected state; free-text not in design — optionally "Ask anything" input); member row tap → member balance sheet; category legend tap → filtered expense list; Activity row tap → expense/settlement detail; Settle trip → `settle` filtered to this space; + Add to trip → `add-bill` with `space_id` preset (trip dates auto-tag anything added during the trip). Event variant (`space.type='event'`): same layout; hero overline shows "Event · 24 Oct · 8 people", budget bar vs `budget_minor`, before the event shows `₹0 / ₹15,000` and "Upcoming" state.

**Data needed:** `spaces` (dates, budget_minor, status), `space_members`, `expenses` (space-scoped, `paid_by_member`, `category_id`), `expense_shares`, `balances`, `settlements`, settlement progress, AI scoped answers (`ai_proposals`/chat), per-member paid totals and fair share (`total ÷ Σ share_weight`).

**Empty/loading:** new trip with no expenses → hero ₹0, "Add your first expense" CTA replaces Who-paid/Where-it-went; budget unset → hide progress bar. Skeletons per card.

---

## 15. Trip report — route `trip-report/[id]` (page 17)

**Purpose:** Shareable, print-style cost report. **Features:** 38 AI reports, 26, 5, 33.

**Layout** (page bg slightly lighter "report paper" `#FBFAF6`; white cards)
1. Header: back · centred "Generated 7 Oct · shared with 5" 14–15 px muted · right share icon button (44×44 sand).
2. Overline "TRIP REPORT" (signal 14 px 700 tracking). Title "Goa, 2–6 October" 34 px 700. Sub "Sunny, Rahul, Priya, Arjun, Meera · 38 expenses" 15 px muted.
3. **Total card** `ink`, radius ≈ 28, padding 18: "TOTAL" (steel 14 px, tracking) · **Doto** `₹68,400` paper (digit height ≈ 34, font ≈ 56) · "₹6,600 under the ₹75,000 budget" 14–15 px paper@80 %.
4. Two stat tiles (radius ≈ 22, padding 14): `steel` "Per person" / **₹13,680** 25 px 700; `sand` "Per person per day" / **₹2,736**.
5. **"Plan vs actual"** table card (white, radius ≈ 28, padding 16): title 18 px 700; header row (Category / Planned / Actual, 14 px muted); rows 17 px: Stay ₹25,000 → **₹24,000**; Travel ₹18,000 → **₹18,600** (signal = over plan); Food ₹12,000 → **₹14,200** (signal); Activities ₹8,000 → **₹6,800**; Local rides ₹3,000 → **₹3,100** (signal); Shopping & misc ₹9,000 → **₹1,700**. Planned column 17 px muted; Actual 17 px 700 ink (signal when over).
6. **"Contributions & balances"** card: header Person / Paid / Balance; rows: Sunny ₹17,880 **+₹4,200** (slate); Priya ₹14,280 **+₹600**; Meera ₹13,030 **−₹650** (signal); Rahul ₹11,830 **−₹1,850**; Arjun ₹11,380 **−₹2,300**. Status strip (`peach` bg, radius ≈ 16, padding 12): "**1 of 4** settlement payments done · ₹4,200 still open" (13–14 px).
7. **"WHAT STOOD OUT"** — `oxblood` + dot texture card, radius ≈ 28, padding 18: overline peach; 4 paragraphs 17 px paper: "Food ran 18% over plan — the seafood night on 4 Oct alone was ₹5,100." / "The villa was the best value: ₹1,200 per person per night." / "Sunny and Priya fronted 47% of all costs between them." / "Shopping came in ₹7,300 under — most of the trip's savings." (AI-generated from data.)
8. Buttons: **Close out the last 3 payments** (`signal`, full width, h ≈ 54, radius ≈ 18) · **Save as PDF** · **Share to group** (two white outlined, equal).
9. Footnote 14 px muted centred: "The shared version shows trip items and balances only — nobody's personal spending."

**Interactions:** Share icon / Share to group → OS share sheet with signed report link (web `paymind.link/report/…`); Save as PDF → render & save; Close out → `settle` (this trip's remaining payments). The report is read-only except AI sections regenerate on data change.

**Data needed:** everything from Trip space + planned budget per category (`budgets` scope `trip` with category rows), report snapshot (generated_at, shared_with), AI "stood out" bullets.

**Empty/loading:** generating → skeleton + "Writing your trip report…". Trip not ended → banner "Trip still going — report is a preview".

---

## 16. Space detail — Couple — route `space/[id]` (couple variant) (page 18)

**Purpose:** Shared money for two with configurable ratio and a shared goal. **Features:** 19 couple mode, 27 shared goals, 34/35 dashboard.

**Layout**
1. Header: back · centred "Ananya & me".
2. **Hero card** `clay`, radius ≈ 28, padding 18: overline "SHARED IN OCTOBER" (dark brown 13 px 700 tracking) · right "92% of ₹20,000" 14 px (2 lines); **Doto** `₹18,400` dark brown/ink (digit height ≈ 38); two inner tiles (`#F4C9A6` lighter clay, radius ≈ 18, padding 14): "You paid" / **₹11,040** 20 px 700, "Ananya paid" / **₹7,360**.
3. **"How you share"** card (white, radius ≈ 28, padding 16): title 18 px 700; SegmentedChips (h ≈ 46, radius ≈ 16, 16 px 600): `50 / 50` · **`60 / 40` (selected, ink)** · `70 / 30` · `Fixed ₹` · `By item`; split bar (h ≈ 12, radius full, `signal` left 60 % / `steel` right 40 %, 2 px white gap); under it "You · ₹11,040" (left) / "Ananya · ₹7,360" (right) 14 px muted; **status box** (`mist`, radius ≈ 18, padding 14, 17 px 600 slate-ink): "All square — nobody owes anything this month." (alternatives: "Ananya owes you ₹X" / "You owe Ananya ₹X"); helper 14 px muted: "Roughly in line with your incomes. Applies to everything in this space unless an item says otherwise." (changes per ratio).
4. **"This month together"** card (white): rows (dividers): "Weekend in Coorg" — "you paid" 14 px muted + **₹8,400**; "Dining out · 5 times" — "both" **₹6,200**; "Groceries & home bits" — "Ananya" **₹3,151**; "Flix+ Premium · recurring" — "Ananya" **₹649** (label = who paid; "both" = paid jointly).
5. **Shared goal card** `ink`, radius ≈ 28, padding 18: overline "SHARED GOAL" (steel) + right "by Mar 2027"; title "Kashmir trip · ₹1,20,000" 22 px 700 paper; **two-segment ProgressBar** (h ≈ 10, track `inkSoft`; segments: You coral `#E27261` ₹24,000 · Ananya steel ₹22,000); text "You ₹24,000 · Ananya ₹22,000" left, "₹74,000 to go" right, 14 px paper@80 %.
6. Tab bar, Spaces active.

**Interactions:** ratio chips → update `spaces.default_split` (+ `split_rules` for couple; "Fixed ₹" opens amount input; "By item" lets each new expense be split by item via `split`); goal card → `goals`; month rows → expense detail; header overflow → settle/rename.

**Data needed:** `spaces` (type couple, default_split ratio), `space_members` (2, `share_weight`), month `expenses` + `expense_shares`, `balances`, `goals` + `goal_contributions` (per member).

**Empty/loading:** no shared expenses → hero ₹0 and "Nothing shared this month yet"; no goal → dashed "+ Add a shared goal" row.

---

## 17. Space detail — Roommates — route `space/[id]` (roommates variant) (page 19)

**Purpose:** Household statement with a split rule per bill. **Features:** 20 roommate rules, 4, 22 (auto-added recurring bills).

**Layout**
1. Header: back · centred "Flat 402".
2. **Statement card** `steel`, radius ≈ 28, padding 18: overline "SEPTEMBER STATEMENT · YOUR SHARE" (ink 13 px 700 tracking); **Doto** `₹19,870` ink (digit height ≈ 38, font ≈ 60); inner white row (radius ≈ 18, padding 14): "You owe Karthik **₹1,240**" 17 px + sub 14 px muted "electricity ₹1,040 + groceries ₹200" · right **Pay** button (`signal`, white 16 px 700, w ≈ 84, h ≈ 44, radius ≈ 16).
3. Section row: "Each bill has its own rule" 18 px 700 + right "You · Karthik · Neel" 13 px muted.
4. **BillRuleCards** (white, radius ≈ 24, padding 16): header row bill name 17 px 700 + total 19 px 700; sub 14 px muted.
   - Rent ₹42,000 — "By room size · ₹16,000 · ₹14,000 · ₹12,000".
   - **Electricity ₹3,720 — expanded/selected (2 px ink border)**: SegmentedControl `Equally` | **`By usage`** (selected ink) | `By room`; three person tiles (`paper`, radius ≈ 16, padding 12; name 14 px muted, value 19 px 700): You ₹1,040 · Karthik ₹1,480 · Neel ₹1,200; helper 14 px muted "From the AC sub-meter readings you each log on the 1st. Common areas split equally."
   - Internet ₹1,050 — "Equally · ₹350 each · auto-added on the 25th".
   - Groceries ₹4,860 — "By item from scanned bills · staples like oil and rice split equally".
   - Cleaning & maintenance ₹3,000 — "Equally · ₹1,000 each".
   - Music family plan ₹180 — "Equally · ₹60 each · Neel pays, others reimburse".
   - Dashed button "+ Add a household bill".
5. Tab bar, Spaces active.

**Interactions:** Pay → `pay/[id]` for the Karthik settlement; bill card tap → expands (only one expanded) showing rule editor; rule segments: Equally / By usage (prompt for meter readings on the 1st) / By room (room-size weights) → writes `split_rules(space_id, bill_kind, method, params)`; "+ Add a household bill" → create bill (name, amount, rule, recurrence day e.g. "auto-added on the 25th" → `recurring_series`); person tile tap → per-person override; header overflow → members & rules (6 rules total per Spaces list).

**Data needed:** `split_rules` (per bill_kind: rent by_room, electricity by_usage/equal/by_room, internet equal, groceries by_item, cleaning equal, music fixed), `space_members` (+ `share_weight` = room size), `expenses` (month), `expense_shares`, meter readings (new table `usage_readings`), `recurring_series` (auto-added bills), `balances`.

**Empty/loading:** no bills → only "+ Add a household bill" + explainer "Each bill can have its own rule — rent by room, electricity by usage…"; statement `₹0`.

---

## 18. Space detail — Family — route `space/[id]` (family variant) (page 20)

**Purpose:** Household budget dashboard for family with "Just mine" privacy toggle. **Features:** 18 family space, 27 shared goals, 35 group dashboard, 22 (upcoming).

**Layout**
1. **Oxblood hero** (dot texture, bottom radius ≈ 40, h ≈ 300): back button (44×44 signal-tinted `#8C2B24`) · centred title "Home · Hubli"; **SegmentedControl on dark** (track `#5E1713` (oxblood darker), radius ≈ 20, h ≈ 50): `Household` (selected: paper bg `#FBF7F0`, oxblood 16 px 600) | `Just mine` (paper@80 % text); overline "HOUSEHOLD · OCTOBER" (peach 14 px 700 tracking); **Doto** `₹38,450` paper (digit height ≈ 38, font ≈ 60); caption 15 px paper@85 %: "85% of the ₹45,000 family budget · 4 members".
2. **"Who put in what"** card (white, radius ≈ 28): title 18 px 700; 4 columns: MemberAvatar 44 px (Appa slate "A", You signal "S", Amma rust "A", Sneha plum "S") + name 14 px muted + amount 16 px 700: ₹22,000, ₹12,000, ₹3,250, ₹1,200.
3. **"Household categories"** card: rows: name 16 px left; right "**₹12,000** / ₹12,000" (spent 700 ink + budget muted 16 px); ProgressBar (h ≈ 10, track `sand`): Education · Sneha ₹12,000/12,000 (plum, 100 %); Groceries ₹9,200/10,000 (clay); Household help ₹6,000/6,000 (slate 100 %); Utilities ₹4,860/6,000 (steel); Fuel & transport ₹3,400/5,000 (rust); Other ₹2,990/6,000 (stone). (Bar colours are per-category fixed.)
4. **"Coming up for the family"** title; white list (rows padding 16): "Household help" / "1 Nov · monthly" / ₹6,000; "Health insurance premium" / "2 Nov · yearly · Appa pays" / ₹18,600; "Sneha's semester fee" / "5 Dec · set aside ₹5,250/week to cover it" / ₹42,000 (AI sinking-fund suggestion).
5. **Household insight** `ink` card (radius ≈ 24, padding 16): overline "HOUSEHOLD INSIGHT" (steel); text 17 px paper: "Electricity came in at ₹1,860 — 12% lower than September, likely the cooler weeks. Groceries are on pace for the ₹10,000 budget."
6. **Goal card** (white, radius ≈ 24): "Family goal · Home repainting" 16 px 600 + right "45%" muted; ProgressBar (fill oxblood); "₹27,000 of ₹60,000 · target Diwali 2027" 14 px muted.

**Interactions:** `Household` ↔ `Just mine` (shows only the viewer's own contributions/spend within the family — never others' personal spending); member tap → that member's contribution detail (only what they put into shared); category row tap → filtered expenses; coming-up rows → `recurring`; goal → `goals`.

**Data needed:** `spaces` (family), `space_members`, `expenses` (space + month), `budgets` (scope group, per category limits), `recurring_series` (space-scoped), `goals`/`goal_contributions`, AI household insight.

**Empty/loading:** no budget → hero "₹X spent" without %; ask "Set a household budget". Just-mine view with no contributions → "You haven't put anything in yet".

---

## 19. Reminders & history — route `reminders` (page 21)

**Purpose:** Compose a combined reminder to one person; view settlement history. **Features:** 32 combined reminders, 33 settlement history.

**Layout**
1. Header: back · centred "Reminders & history".
2. **"Nudge someone"** card (white, radius ≈ 28, padding 16): title 19 px 700. **Person tiles** (3 across, h ≈ 56, radius ≈ 16, 1.5 px border; name 16 px 600 + amount 14 px muted): Rahul ₹2,571 (**selected: signal border**), Arjun ₹2,300, Priya ₹572. Label "TONE" (13 px 600 muted tracking) + SegmentedControl (`sand` track) `Friendly` (selected white) | `Neutral` | `Firm`. Label "REPEAT" + SegmentedControl `Just once` | **`Every 3 days`** (selected) | `Weekly`. **Message preview** (`ink` card, radius ≈ 20, padding 16, paper 16 px): "Hey Rahul! Quick one — 2 shared expenses add up to ₹2,571:\n• Goa Trip — ₹1,850\n• Tandoor House — ₹721\nNo rush, whenever you get a sec\npaymind.link/pay/…". Buttons: **Send to Rahul** (`signal`, white 17 px 700, h ≈ 54, flex 1, radius ≈ 18) · **Share…** (white outlined, w ≈ 100).
3. **"Settlement history"** title 19 px 700. White list card; each **SettlementRow**: title "You → Karthik" 17 px 600; right amount 17 px 700; sub 14 px muted "Today · Flat 402 · UPI (PhonePe)"; right **StatusPill**. Rows:
   - You → Karthik ₹1,240 · Today · Flat 402 · UPI (PhonePe) · **PENDING**
   - Rahul → You ₹450 · 12 Oct · Friends · bank transfer · **COMPLETED**
   - Meera → Priya ₹600 · 8 Oct · Goa Trip · UPI · **COMPLETED**
   - Arjun → You ₹2,300 · 8 Oct · Goa Trip · UPI · **FAILED**
   - You → Neel ₹180 → ₹160 · 2 Oct · Flat 402 · cash · amount fixed · **CORRECTED**
   - You → Karthik ₹1,180 · 3 Sep · Flat 402 · cash · **COMPLETED**
   - Priya → You ₹900 · 28 Aug · Friends · duplicate entry · **CANCELLED**

**Interactions:** person tile → reselects recipient, regenerates preview (tone changes wording: Friendly "Hey Rahul! Quick one…/No rush…", Neutral "Hi Rahul, you have 2 shared expenses totalling…", Firm "Reminder: ₹2,571 is pending…"); Send to Rahul → creates `reminders` row (`tone`, `repeat`, `next_at`, `link_token`) and delivers in-app push/WhatsApp-SMS deep link for app users, share sheet for non-app members; Share… → OS share with the same text. The link opens `paymind.link/pay/<token>` (web page with pay/QR). History row tap → settlement detail (events timeline; PENDING → `verify/[id]`; FAILED → retry pay). Also reachable via Settle "History" and Home "Remind all".

**Data needed:** `reminders`, `balances` (cross-space items per person → `items jsonb`), `settlements` (all statuses), `spaces` names.

**Empty/loading:** nobody owes you → tile area replaced by "Nobody owes you right now"; history empty → "No settlements yet".

---

## 20. Money — route `(tabs)/money` (page 22)

**Purpose:** Safe-to-spend breakdown, month progress and budgets. **Features:** 34 personal dashboard, 13 budget planner, 14 safe-to-spend, 15 forecast, 35.

**Layout**
1. Title "Money" 28 px 700 + sub "October · day 14 of 31" 15 px muted; right two sand pills "Timeline" · "Insights" (h ≈ 44, radius ≈ 14, 14 px 600).
2. **Safe-to-spend card** `oxblood` + dot texture, radius ≈ 28, padding 18: overline "SAFE TO SPEND" (peach 13 px 700 tracking) · right underlined link "Can I afford…?" (paper 14 px 600, 2 lines ok); **Doto** `₹1,166` paper (digit height ≈ 38, font ≈ 66) + "a day" 15 px paper@80 % on the baseline. Breakdown rows (14 px paper, amounts right 14 px paper): In your account ₹52,380 · "Card bill, EMI, internet, Karthik, 2 subscriptions" −₹16,388 · Kashmir goal −₹10,000 · Buffer −₹5,000 · (hairline paper@25 %) **Free until 1 Nov ÷ 18 days** ₹20,992 (bold).
3. **Three mini stats** (radius ≈ 20, padding 14): `SPENT` (white, hairline) **₹15,144** 17 px 700 + "55% of ₹27,500"; `LEFT` (white) **₹12,356** + "for 18 days"; `PROJECTED` (`peach`, rust-brown text) **₹32,075** + "₹4,575 over". Overline 11 px 600 tracking muted.
4. **"Category budgets"** title 18 px 700 + right "Tap one for details" 12 px muted. One grouped white card; each **BudgetRow** (padding 16, hairline dividers): name 15 px 600 · right "**₹6,240** / ₹8,000" (spent 700 ink 16 px + limit muted); bar (h ≈ 10, track `sand`, **even-pace tick** 2 px `#9A958A` at % of month elapsed = 14/31 ≈ 45 %); status text 13 px 600: "Heading ₹5,400 over" (signal) or "On track · ₹1,620 left" (slate). Bar colour: signal when heading over, slate when on track. Rows: Food & dining ₹6,240/8,000 (signal, **expanded**); Groceries ₹2,900/6,000 "Heading ₹100 over" (signal); Transport ₹1,380/3,000 "On track · ₹1,620 left"; Shopping ₹2,077/5,000 "On track · ₹2,923 left"; Entertainment ₹1,820/2,500 "Heading ₹1,000 over"; Subscriptions ₹727/3,000 "On track · ₹2,273 left".
   - **Expanded detail** (Food): row bg `#FBF8F2`; inside an `ink` panel (radius ≈ 18, padding 14; labels 13 px steel, values 14 px 700 paper): "Spending pace" **₹446/day vs ₹258 planned** · "Projected by 31 Oct" **₹13,400** · text 14–15 px paper@85 %: "Two more dinners out this week would use the rest. Cooking in on weekdays keeps you near ₹11,000."
   - Footnote 13 px muted: "The faint line marks where you'd be if spending were even across the month."
5. **"Other budgets"** title; 2×2 grid (radius ≈ 22, padding 14): `steel` "This week" / **₹3,120 / ₹4,500** 22 px 700 / "resets Monday"; `sand` "Sneha's birthday · event" / **₹0 / ₹15,000** / "24 Oct · 8 people"; `sand` "Flat 402 groceries · group" / **₹2,380 / ₹6,000** / "shared by 3"; `ink` "Kashmir · trip" / **Plan ₹1,20,000** (paper) / "March 2027". Below: dashed button "+ New budget · monthly, weekly, category, group, event or trip".
6. Two white link cards side by side (radius ≈ 22, h ≈ 56, 16 px 600 centred): **Recurring & subscriptions** → `recurring` · **Goals** → `goals`.
7. Tab bar, **Money** active.

**Interactions:** Timeline → `timeline`; Insights → `insights`; "Can I afford…?" → `afford`; budget row tap → expands/collapses (accordion) and long-press/edit → budget editor; "+ New budget" → budget creation sheet (scope monthly/weekly/category/group/event/trip, limit, period); other-budget tiles → filtered view / `space/[id]` for group/event/trip budgets.

**Data needed:** **safe-to-spend** (computed; components from AA balance, `recurring_series` dues, `settlements` owed, `goals` contribution, buffer), `budgets` (monthly total 27,500 + categories + weekly + group/event/trip), month spend by category (`expenses`), **forecast** (pace-based projection), even-pace fraction.

**Empty/loading:** no budgets → "Set your first budget" card replacing Category budgets (AI can propose from last 3 months via `ai_proposals`). No balance → safe-to-spend card shows budget-based fallback and "Connect bank balance". Skeleton states.

---

## 21. Recurring & subscriptions — route `recurring` (page 23)

**Purpose:** Subscription intelligence and all recurring payments. **Features:** 21 subscription intelligence, 22 recurring expenses.

**Layout**
1. Header: back · centred "Recurring".
2. **Total card** `ink`, radius ≈ 28, padding 18: overline "SUBSCRIPTIONS · 6 ACTIVE" (steel); **Doto** `₹2,875` paper (digit height ≈ 36, font ≈ 61) + "a month" 15 px steel; "₹34,500 a year · up ₹150/month since August" 15 px paper@80 %.
3. **"Worth a look"** title; 3 **InsightNoteCards** (white, radius ≈ 22, padding 14; 12 px colour dot + title 16 px 700 + body 14 px muted): signal dot "Flix+ Premium went up 30%" — "₹499 → ₹649 from the August bill. That's ₹1,800 more a year."; clay dot "Two video services" — "Flix+ Premium and Flix Lite overlap. Ananya also shares a Flix+ plan with you."; slate dot "Still using FitHub?" — "No gym-related spending since 2 Sep. If you've stopped going, cancelling saves ₹17,988 a year."
4. **"All subscriptions"** title + right "Tap to plan a cancel" 13 px muted. White list card (rows h ≈ 64): 52×52 `sand` radius ≈ 16 logo tile with 2-letter oxblood initials ("Fx", "Fl", "FH", "CV", "BM", "ND"); name 17 px 600; sub 13 px muted "Monthly · next 27 Oct · was ₹499"; right amount 17 px 700 + **flag label** (12 px 700 tracking): "PRICE UP" (signal), "OVERLAP" (rust), "UNUSED?" (slate). Rows: Flix+ Premium ₹649 PRICE UP; Flix Lite ₹199 (next 3 Nov) OVERLAP; FitHub Gym ₹1,499 (next 29 Oct) UNUSED?; CloudVault 200 GB ₹210 (8 Nov); Beat Music ₹119 (11 Nov); NewsDaily ₹199 (28 Oct).
5. **"Other recurring payments"** title + right "in your forecast" 13 px muted. White list (dividers): Rent · Flat 402 share — "1st · monthly" ₹16,000; Home · Hubli contribution — "1st · monthly" ₹12,000; Term insurance — "5th · monthly" ₹1,250; Credit card bill — "18th · amount varies" ₹8,450; Bike EMI — "22nd · 14 of 36 paid" ₹4,200; Internet · Flat 402 share — "25th · monthly" ₹350.
6. **Toggle row** (white, radius ≈ 22, padding 16): "Remind me 2 days before each" 17 px 600 + Switch (on: ink track 52×30, white thumb).

**Interactions:** subscription row tap → "plan a cancel" sheet (cancel steps/deep link, reminder date, marks intended-to-cancel, shows annual saving); insight cards tap → scroll/highlight row; other-recurring tap → edit series (amount, cadence, next due); switch → `notification_prefs` (lead time 2 days); Home "All recurring" lands here.

**Data needed:** `recurring_series` (kind subscription/emi/bill, cadence, expected_minor, next_due, flags: price_up/overlap/unused, previous_minor, installments paid/total), `merchants`, detection from `captured_txns`/`expenses` (same amount 4 months), monthly total & annualised, overlap groups (category video), usage signal (no related spend since).

**Empty/loading:** none detected → "No subscriptions found yet. We'll spot them as payments come in." Keep the "Other recurring" section if any.

---

## 22. Goals — route `goals` (page 24)

**Purpose:** Track personal and shared goals; plan monthly contribution. **Features:** 28 goal tracking, 27 shared goals.

**Layout**
1. Header: back · centred "Goals" · right **ink 44×44 "+"** button.
2. **GoalCards** (radius ≈ 28, padding 16): title 19 px 700 + right tag overline 13 px 700 tracking ("SHARED · COUPLE", "PERSONAL"); ProgressBar h ≈ 10; meta row 15 px ("₹46,000 of ₹1,20,000" left, "by Mar 2027" right).
   - Kashmir trip — **`ink` card** (selected/featured), bar fill `clay`, track `inkSoft`, tag steel, text paper.
   - Emergency fund — white, bar `signal`, ₹1,12,000 of ₹2,00,000 · by Dec 2027.
   - New laptop — white, bar `signal`, ₹31,500 of ₹85,000 · by Jan 2027.
3. **Planner card** (white, radius ≈ 28, padding 16): "Kashmir trip" 19 px 700 + right "₹74,000 to go" 14 px muted; row "Together, per month" 16 px muted + **₹14,800** 29 px 700; **Slider** (monthly contribution; thumb at 45 %); two tiles (`paper`, radius ≈ 18, padding 12): "You'd finish" / **Mar 2027** 22 px 700; "Needed for Mar 2027" / **₹14,800/mo**; status box (`mist`, radius ≈ 16, 17 px 600): "Right on target." (other states: "Finish Jun 2027 — ₹2,000 more a month gets you to March"); "Contributions so far" 15 px 700 + rows (`paper` bg, radius ≈ 14, padding 12): "You" — **₹24,000 · 60% of each deposit**; "Ananya" — **₹22,000 · 40%**.
4. Tab bar, Money active.

**Interactions:** "+" → new goal sheet (name, target, date, personal/shared with space, split ratio); card tap selects it and swaps the planner below; slider → what-if monthly amount (client-side; "Save" to set planned monthly → `goals`), finish date recomputed; contribution rows → contribution history; "Deposit" action implied (Add contribution) — design has none; provide "+ Add contribution" in planner footer.

**Data needed:** `goals` (owner/space, name, target_minor, target_date), `goal_contributions` (member, amount, date), goal calc (projected finish at given monthly), space ratio for shared goals.

**Empty/loading:** no goals → centred "What are you saving for?" + "Add a goal". Planner hidden until a goal exists.

---

## 23. Timeline — route `timeline` (page 25)

**Purpose:** One chronological feed of everything. **Feature:** 42 unified timeline (plus 44).

**Layout**
1. Header: back · centred "Timeline" · right search icon button (44×44 sand → `search`).
2. **Filter chips** (wrap, h ≈ 40): `All` (selected ink) · `Expenses` · `Shared` · `Payments` · `Bills` · `Alerts` · `Goals` (white + hairline, 15 px 600).
3. **Day groups**: overline label (13 px 600 tracking muted, hairline under): "TODAY · 14 OCT", "YESTERDAY · 13 OCT", "12 OCT". Each group = one white card, rows (padding 14, h ≈ 70–90, dividers): **TypeBadge** 44×44 radius ≈ 14 with 11 px 700 label; title 17 px 600; sub 14 px muted (up to 2 lines); right amount 17 px 700 (signed).
   - Badge colours: `PAID` ink bg/paper text; `ALERT` signal bg/white text; `EXP` sand/oxblood; `BDGT` `#F1EDE6`/ink; `SPLIT` steel/ink; `GOAL` clay/ink; `BILL` peach/rust.
   - Today: PAID "Paid Karthik via UPI" · "Flat 402 · 10:17 · waiting for confirmation" · −₹1,240; ALERT "Coastline Grill flagged for review" · "₹4,860 · about 3× your usual" (no amount); EXP "Brew Street Café" · "Auto-captured from UPI alert · 09:12" · −₹240; BDGT "Food & dining passed 75%" · "₹6,240 of ₹8,000 · 08:00".
   - Yesterday: SPLIT "Tandoor House, split 3 ways" · "You paid ₹1,992 · Rahul and Priya owe ₹1,293" · −₹699 (your share); SPLIT "Auto with Neel" · "Added by voice · Neel owes ₹150" · −₹150; GOAL "Kashmir trip" · "Monthly deposit · 60% yours" · ₹5,000.
   - 12 Oct: PAID "Rahul paid you back" · "Movie night · bank transfer, recorded by you" · **+₹450** (slate); BILL "Beat Music renewed" · "Subscription · same price as last month" · −₹119; BILL "Electricity · Flat 402" · "Added by Karthik · split by usage" · ₹3,720.
4. Tab bar, Money active.

**Interactions:** chip filters (Expenses = personal+shared expenses; Shared = space items; Payments = settlements; Bills = recurring/bill events; Alerts = anomalies/budget alerts; Goals). Row tap → relevant detail: PAID → `verify/[id]` (if pending) else settlement detail; ALERT → `insights` anomaly; EXP → edit; BDGT → `(tabs)/money`; SPLIT → expense detail; GOAL → `goals`; BILL → `recurring`. Infinite scroll by day.

**Data needed:** `timeline_events` view (union of `expenses`, `settlements`, `budgets` alerts, `goals` contributions, `anomalies`, `recurring_series` renewals) with `kind`, `title`, `subtitle`, `amount_minor`, `sign`, `occurred_at`, `ref_id`; RLS ensures shared events show only shared data.

**Empty/loading:** skeleton rows; empty → "Your money story starts here. Add a bill or connect alerts." with `add-bill` button.

---

## 24. Privacy & data — route `privacy` (page 26)

**Purpose:** Consent controls, sharing rules, notification prefs, learned rules, export/delete. **Features:** 39 privacy controls, 40 (review learned), 44.

**Layout**
1. Header: back · centred "Privacy & data".
2. **Promise card** `ink`, radius ≈ 28, padding 18: 21 px 600 paper "Your money data is yours. Every source is opt-in, and you can switch any of it off here."; 15 px steel "PayMind never sees your UPI PIN or card details, and never moves money on its own."
3. **Grouped sections**: overline header (13 px 700 tracking muted) above a white card; rows (padding 16, dividers): title 17 px 600 + desc 14 px muted (left, max ≈ 72 %) + **Switch** right (on: ink track 52×30/white thumb; off: `stone` track/white thumb).
   - **CONNECTED SOURCES:** UPI & bank alerts (on) "Reads payment notifications to suggest expenses. Nothing else on your phone." · Bank balance (on) "Via Account Aggregator consent, valid until Apr 2027. Used for safe-to-spend." · E-bills from email (**off**) "Only messages from billers you pick." · Keep receipt photos (on) "Off = we read the bill, then discard the image."
   - **WHAT PEOPLE IN YOUR SPACES SEE:** Items on shared bills (on) "Needed to split fairly. They never see your personal expenses." · My notes on shared expenses (**off**) "Private by default." · How I paid (**off**) "e.g. \"UPI\" or \"cash\" on settlements."
   - **AI:** Use AI to read bills and answer questions (on) "Off = manual entry and plain search only." · Learn from my corrections (on) "Improves categories, merchants and split suggestions — for you only."
   - **NOTIFICATIONS:** Budget alerts (on) "When a category is heading over." · Money nudges (on) "Patterns and tips, at most once a day." · Settlement reminders (on) "Who owes you, and what you owe." · Unusual activity (on) "Always shown for review — never auto-blocked." · Quiet hours 10 PM – 8 AM (on) "Hold everything except unusual activity." (tap title to edit hours).
   - **WHAT PAYMIND HAS LEARNED FROM YOUR FIXES:** white card with rows (left text 16 px, right 13 px muted): "Brew Street Café → Food · Café" / "was Shopping"; "Tandoor House → split with Rahul, Priya" / "4 times"; "\"UBERRIDES BLR\" → Uber" / "merchant"; "Couple items → 60 / 40, not 50 / 50" / "split rule". Below, outlined full-width button "Review or reset what it learned".
   - **YOUR DATA:** outlined buttons (white, hairline, radius ≈ 18, h ≈ 56, 17 px 600 centred): "Download everything (CSV + receipts)" · "Delete data from a date range" · **"Delete my account"** (signal text + 1.5 px signal border). Footnote 14–15 px muted: "Deleting your account removes your personal data. Shared expenses stay visible to the other people in them, with your name replaced by \"Former member\"."

**Interactions:** each Switch writes `privacy_settings`/`consents` immediately (Android: turning alerts on requests notification-listener/SMS permission; Bank balance → Account Aggregator consent flow (M6) — until then the row is hidden or marked "Coming soon"; turning off deletes derived data per row copy; receipts off → purge stored images). Learned rows tap → edit/remove single rule; "Review or reset" → list screen of `learned_rules` with delete-all. Download → export job (CSV + receipts zip) → share sheet. Date-range delete → date-range picker + confirm. Delete account → two-step confirm (type "DELETE") → sets `profiles.deleted_at`, anonymises shared rows to "Former member", wipes personal rows, signs out.

**Data needed:** `privacy_settings`, `consents` (aa, email, sms, keep_receipts, ai_enabled + learn_from_corrections), `notification_prefs` (incl. quiet_hours), `learned_rules`, export/delete Edge Functions.

**Empty/loading:** learned list empty → row "Nothing learned yet. Your corrections will show up here." and hide the button. Switches optimistic with rollback on error.
