# PayMind — Component library spec

Derived from the repeated patterns in `design/PayMind.pdf`. Build these in `packages/ui` (RN + NativeWind; web reuses tokens only). Sizes are **px/dp on a 390-wide frame** (PDF pt ÷ 0.75); "≈" = measured from render. Screen-by-screen usage is in `screens.md` (section numbers `§n` below refer to it).

## 1. Design tokens (`packages/ui-tokens`)

### Colours
| Token | Hex | Role |
|---|---|---|
| `oxblood` | `#6E1F1B` | Primary hero surface, brand, avatar (Meera), goal bar (family) |
| `signal` | `#B3261E` | Primary action, active tab, "you owe"/negative/over-budget, scan FAB, selected-person borders |
| `ink` | `#232833` | Dark cards, dark buttons, selected chips, toggles-on, primary text buttons |
| `steel` | `#BCCCD6` | "Owed to you" cards, info highlights, Rahul bar in share card, chart band |
| `clay` | `#E3A06F` | Budget card, warning accents, forecast dashed line, trip budget bar, goal bar on ink |
| `paper` | `#F7F5F0` | App background; text on dark |
| `white` | `#FFFFFF` | Cards |
| `muted` | `#6A6459` | Secondary text, inactive tab |
| `text` | `#1B1B17` | Primary body text (measured `#191A15`; slightly darker than ink) |

Derived (present in the design, not on the palette page — treat as tokens):
| Token | Hex | Use |
|---|---|---|
| `sand` | `#EDE7DB` | Progress tracks, segmented-control tracks, quick-action container, back button bg, neutral chips/tiles, mono alias chips |
| `peach` | `#F6E3D5` | Clay tint: inbox badge, "NOT CONFIRMED" pill, PENDING pill, BILL badge, PROJECTED stat, status strip |
| `mist` | `#EDF3F6` | Steel tint: info/disclosure boxes, COMPLETED pill, "All square" status |
| `blush` | `#FAEBE7` | Signal tint: flagged item row, FAILED pill |
| `slate` | `#2F4A5D` | Dark steel: "On track" text, credit amounts (+), Rahul/Karthik avatar, travel category |
| `rust` | `#994516` | Dark clay: warnings (PRICE UP note), Priya/Amma avatar, PENDING text |
| `plum` | `#5B4A78` | Arjun/Sneha avatar, education category |
| `inkSoft` | `#2E3442` | Inner rows/tiles/tracks on `ink` cards |
| `coral` | `#E27261` | "You" bar on ink cards (share bar, shared goal) |
| `stone` | `#CBC2B3` | Switch-off track, Shopping/Other category bars |
| `hairline` | `#E9E4DA` | 1 px card borders and row dividers (dividers ≈ `#F2F0EA`) |
| `reportPaper` | `#FBFAF6` | Trip-report page bg only |
| `oxbloodDeep` | `#571916` | Safe-to-spend pill bg, dark segmented track on hero |

Light theme only in the design (no dark mode specified).

### Avatar / category colours
`avatarColor(member)`: **"You" is always `signal`**; others by stable hash of member id over `[slate, rust, plum, oxblood]` (design: Rahul slate, Priya rust, Arjun plum, Meera oxblood, Karthik slate, Appa slate, Amma rust, Sneha plum). Category bar colours (fixed per category): Stay oxblood · Travel slate · Food clay · Activities steel · Local rides rust · Shopping/Other stone · Education plum · Groceries clay · Household help slate · Utilities steel · Fuel rust.

### Type
Fonts: **Doto** (dot-matrix; hero numbers ONLY) and **Onest** (everything else; weights 400/500/600/700). Load both with `expo-font`; Doto never used for labels, names, list amounts.
| Style | Size / line / weight | Notes |
|---|---|---|
| `hero` (Doto) | 60–85 px, digit height ≈ 38–52 | Home 85 (≈ 80), Pay 79, Search/Couple/Roommates/Family/Money/Recurring ≈ 60–66, Trip ≈ 65, Report ≈ 56, Settle-simplified counts ≈ 46 |
| `screenTitle` | 28 / 34 / 700 | Tab roots: Spaces, Money, Ask |
| `headerTitle` | 18 / 24 / 600 | Centred in ScreenHeader |
| `cardTitle` | 17–19 / 24 / 600–700 | |
| `rowTitle` | 15–17 / 22 / 600 | |
| `body` | 13–15 / 19–22 / 400 | |
| `caption` | 12 / 16 / 400 | muted |
| `overline` | 11–13 / 16 / 600–700, UPPERCASE, tracking ≈ 1.2–1.5 px | |
| `amount` | 16–19 / 700 | list amounts; tabular numerals |
| `amountXL` | 25–38 / 700 | Onest big amounts (stat cards, forecast, afford, goals) |

### Shape / spacing / elevation
- Page gutter 16; card padding 16–18; vertical rhythm 12–16 between cards, 24 above section titles.
- Radius: card ≈ 24–28; hero bottom ≈ 40; button ≈ 16–18; chip/pill = full; icon tile ≈ 14–16; small tiles ≈ 14–18; back/icon button ≈ 14.
- Card: `white`, 1 px `hairline`, **no shadow**. Shadows only: scan FAB (`signal`@35 %, blur ≈ 24, y ≈ 10) and Home "Owed to you" card (`ink`@10 %, blur ≈ 24, y ≈ 10).
- Min touch target 44.

### Formatting helpers (`packages/core/format`)
- `formatINR(paise, {decimals?: 0|2, sign?: boolean})` → `₹1,20,000`, Indian grouping (3 then 2-digit groups), `−₹` for negatives, `+₹` if `sign`. Decimals: 0 in summaries, 2 on bill/split/settlement math.
- `formatCompactINR(paise)` → `₹11.9k`, `₹12k`.
- Dates: `13 Oct`, `Tue 13 Oct, 9:42 PM`, `TODAY · 14 OCT` (overline), `Yesterday, 13 Oct`.

---

## 2. Components

Convention: **Props** are TypeScript-ish. Every interactive component supports `disabled`, `testID`, accessibility label.

### 2.1 Surfaces & texture

**DotTexture** — absolute-fill overlay for hero surfaces. White dots, radius ≈ 1 px, 8 px grid, opacity ≈ 8–10 %. Implement as a tiled SVG/`ImageBackground` pattern (RN: pre-rendered 8×8 PNG repeated; web: CSS radial-gradient). Props: `opacity?: number`. Used on: oxblood/ink heroes (Home, Pay, Voice, Trip, Family), Add-bill viewfinder, Suggestion card (Split), Trip-report "stood out", Spaces featured card, Search result hero, Money safe-to-spend card.

**HeroHeader** — Props: `tone: 'oxblood' | 'ink'`, `children`, `overlap?: number` (px the next row overlaps, Home ≈ 70), `minHeight`. Spec: full-bleed, bottom-left/right radius ≈ 40, contains `DotTexture`, top padding = safe-area + 52 for header row (44 px controls), side padding 16–22. Variants: Home (greeting row, pill, hero number, caption), Pay (back+title, hero number, caption), Voice (ink, waveform), Trip (ink, title, hero number, budget bar), Family (oxblood, segmented control). Used: §1, §6, §9, §14, §18.

**Card** — Props: `tone?: 'white' | 'ink' | 'oxblood' | 'steel' | 'clay' | 'sand' | 'peach' | 'mist' | 'signal'`, `bordered?: boolean` (default true for white), `emphasis?: 'none' | 'ink2' | 'clay2'` (2 px ink border = selected/expanded; 2 px clay border = anomaly), `dashed?: boolean` (upcoming space / add-bill placeholders), `radius?: 20|24|28`, `padding?: 14|16|18`, `texture?: boolean`. Text colour auto-switches (paper on ink/oxblood/signal; ink otherwise).

**ListCard** — white Card (padding 0) whose children are **ListRow**s with 1 px divider; rows never have their own radius except at card edges.

### 2.2 Navigation chrome

**BottomTabBar** — 5 slots: Home (house), Spaces (users), **ScanFab** (centre), Ask (sparkles), Money (bar-chart). Bar: bg `#FAF7F6` (≈ white), top 1 px hairline, height ≈ 64 + safe-area bottom; icons 24 px, label 11 px 600; active = `signal` icon+label, inactive = `muted`. Props: `state` (expo-router `BottomTabBarProps`). **ScanFab**: 58×58 (≈ 58), radius ≈ 20, bg `signal`, white scan-frame icon 26, raised so its top sits ≈ 26 px above the bar, shadow (signal@35 %, blur 24, y 10); press → `add-bill` (does **not** switch tab, it pushes a route). Custom tab bar required.

**ScreenHeader** — Props: `title?: string`, `onBack?`, `right?: ReactNode`, `tone?: 'light'|'dark'`. Layout: row h 44 at safe-area top + ≈ 8; left **IconButton(back)**; centred `headerTitle` (true-centred regardless of right content); `right` slot. Used on every sub-screen. (Tab-root screens use a left-aligned `screenTitle` block instead: title 28/700 + sub 15 muted, right-side actions.)

**IconButton** — 44×44, radius ≈ 14, bg `sand` (`light`) / white@12 % (`dark`) / `ink` (primary "+") / `paper-ish #F3ECE2` (Home filter); 20–22 px icon. Props: `icon`, `tone`, `badgeDot?: boolean` (clay 8 px dot top-right, Home bell). Used: back, search, share, +, bell, filter.

**HeaderPill** — 44 px-high pill button for header right actions: radius ≈ 14, `sand` bg (or `paper` on dark hero: Trip "Report"), 14 px 600 label. Props: `label`, `onPress`, `tone`. Used: History, Report, Timeline, Insights.

**StepPills** — 3-step indicator in the header row of Understand/Split: labels "Understand" · "Split" · "Settle" (Understand screen shows "Split · Settle" grouped muted). Active = pill h ≈ 34, bg `ink`, paper 13 px 600, px 14; inactive = muted 13 px 600 text, no bg. Props: `steps: string[]`, `active: number`, `onSelect?`. Used §3, §4.

**SectionHeader** — Props: `title`, `actionLabel?`, `onAction?`, `meta?`. Title 17–19 px 600–700 ink left; right action 13–14 px `signal` 600 ("See all", "All recurring") or muted meta 13 px ("3 to review", "63 rides", "Tap one for details", "line = fair share"). Used everywhere.

**Overline** — UPPERCASE 11–13 px 600–700 tracking ≈ 1.3; colour by surface (muted on light, steel on ink, peach on oxblood, clay on ink for "BILL DETECTIVE"/"CREATE EXPENSE", rust on anomaly, signal for "TRIP REPORT"). Props: `children`, `tone`, `icon?`.

### 2.3 Numbers & text

**AmountText** — Props: `paise: bigint|number`, `variant: 'hero' | 'xl' | 'lg' | 'row' | 'inline'`, `decimals?: 0|2`, `tone?: 'default'|'positive'|'negative'|'onDark'|'muted'`, `sign?: boolean`, `strike?: boolean`, `size?` (for hero). `hero` = **Doto**, paper/ink, digits big, **₹ rendered smaller (≈ 30 % of size, Onest 600) top-aligned at the left** (see Home "₹1,166"), comma rendered in Doto; `xl` = Onest 700 25–38; `lg` = 19–27 700; `row` = 16–17 700 tabular; `inline` = 600 within sentences (e.g. "**₹150**" bold inside body copy). Tone `positive` = `slate` (+₹600), `negative` = `signal` (−₹650). Must use `formatINR`. Sentences in copy embed `<AmountText variant="inline">`.

**AmountWithUnit** — hero + trailing unit ("a day", "a month") 15 px on baseline; Props as AmountText + `unit`. Used: Money card, Recurring card.

**KeyValueRow** — label (15–16 px, `text`/muted) left, amount right (16 px 600/700), hairline divider optional, `emphasis?: 'bold'` for totals (Free to spend ₹20,992 with 2 px ink rule above). Props: `label`, `value`, `sub?`, `bold?`, `rule?`, `tone?`. Used: Totals card (Understand), How it's worked out (Afford), Money safe-to-spend breakdown (on-dark variant), Plan vs actual table (3 cols: `TableRow` extension), Contributions table.

### 2.4 Buttons, chips, inputs

**Button** — Props: `label`, `variant`, `size: 'lg'|'md'|'sm'`, `icon?`, `iconRight?`, `full?`, `loading?`. Variants:
| Variant | Bg / border / text | Used |
|---|---|---|
| `primary` | `signal`, white 16–17 px 600–700 | Approve & request, Pay ₹…, Continue in PhonePe, Create space, Settle trip, Save expense, Send, Close out |
| `dark` | `ink`, paper text | Confirm (inbox), Yes it went through, Settle all, Make a report, Looks right, Remove it (on-ink text variant) |
| `outline` | white, 1 px hairline, `text` 14–16 px 600 | Edit, Not mine, Paid in cash, Remind, Share…, Ask a follow-up, Save as PDF, Still pending |
| `paperOnInk` | `#F1EEE7`, ink text | "See why", "Confirm" (Ask proposal) |
| `ghostOnInk` | transparent, 1 px paper@25 % (steel@35 %) border, paper text | "Try a scenario", "We had 4", "Edit" (proposal) |
| `textOnInk` | no bg, paper 600 | "Remove it", "Keep it" |
| `dashed` | transparent, 1 px dashed hairline-dark, ink 14–15 px 600 | "+ Add a missed item", "+ Add a household bill", "+ New budget…" |
| `destructiveOutline` | white, 1.5 px `signal` border, `signal` text | Delete my account |
Sizes: lg h ≈ 56 radius ≈ 18; md h ≈ 50 radius ≈ 16; sm h ≈ 40–44 radius ≈ 14. Press = 0.97 scale + 8 % darken. Loading = spinner replacing label, width preserved.

**ButtonRow** — lays out 2–3 Buttons in a row with 8 gap and flex ratios (primary flex 1–1.6, secondary fit-content); wraps labels to 2 lines instead of truncating (design shows "Don't know it" wrapping).

**Chip** — pill, h ≈ 36–46, radius full, px 14–16, 13–15 px 600; `default` = white + hairline border + text; `selected` = `ink` bg + paper text; `neutral` = `sand` bg; Props: `label`, `selected?`, `onPress`, `icon?`, `mono?` (alias chips: monospaced 13 px, `sand` bg, radius ≈ 12). Wrap in `ChipGroup` (flex-wrap gap 8). Used: category/meta chips (Understand), suggestions (Ask, Search, Afford presets, Trip ask, space types, timeline filters).

**SegmentedControl** — Props: `options: {value,label}[]`, `value`, `onChange`, `tone?: 'light'|'onHero'|'onSand'`, `size?`. Track `sand` (radius ≈ 20, h ≈ 50, padding 4); selected = white pill (radius ≈ 16, text `text` 600) — **except** when used as a choice set in Couple/Electricity cards where selected = `ink` pill + paper text (make `selectedStyle: 'white' | 'ink'`); unselected text `muted` 600. `onHero` (Family): track `oxbloodDeep`, selected paper pill with oxblood text. Used: capture source (Camera/Upload/E-bill), split method (Equal/Custom %/Custom ₹), extras (In proportion/Equally), tone/repeat, nudge frequency, Electricity rule, Household/Just mine.

**ChoiceChips** — row of large selectable chips (h ≈ 46, radius ≈ 16): selected = ink bg. Used: couple ratio `50/50 · 60/40 · 70/30 · Fixed ₹ · By item`.

**PersonToggle** — Props: `member`, `on`, `count?` (for quantity items: "You × 2"), `onPress`. h ≈ 36, radius full, 13 px 600, px 14; **on** = filled with the member's avatar colour + white text; **off** = white + hairline border + `muted` text. Used: Split item rows (§4).

**TextField** — white (or `#FBF9F5` for note), 1 px hairline border, radius ≈ 14–20, h ≈ 48–56, 15–17 px; Props: `value`, `placeholder`, `onChangeText`, `keyboardType`, `emphasis?: 'ink2'` (search: 2 px ink border). Used: Note, UTR (12-digit numeric), Search, Ask composer.

**Switch** — 52×30 track, thumb 24 white; on = `ink` track, off = `stone` track. Props: `value`, `onValueChange`. **SettingRow**: title 17 px 600 + description 14 px muted (wraps, max ≈ 72 % width) + Switch right; dividers; grouped inside a ListCard under an Overline group heading. Used: Privacy (§24), Recurring "Remind me 2 days before each".

**Checkbox** — 24–26 px, radius ≈ 6–8, 2 px ink border; checked = ink fill + white check. Used: "Always use this app" (filled when on), What-if cards.

**Slider** — track h ≈ 10 (`sand` with hairline), fill `signal`, thumb 22 px `signal` with 3 px white ring; Props: `min,max,step,value,onChange,format`. Used: Afford amount, Goals monthly amount.

### 2.5 People

**MemberAvatar** — letter circle. Props: `member`, `size: 32|36|44|52|56`, `ring?: boolean` (2 px ring in surface colour for stacks). Bg = `avatarColor`, letter = first initial 12–20 px 700 white. Non-app member = same (no photo in design). "Former member" = `stone` bg with "F".
**AvatarStack** — overlapping avatars, overlap ≈ −8, ring 2 px of parent surface colour. Used: featured space card (5 avatars).
**MemberChip** — white pill h ≈ 44, hairline, avatar 32 + name 14 px 600; plus dashed "+" circle 44 px. Used: Split participant strip.
**MemberColumn** — avatar 44 + name 14 muted + amount 16 700 stacked; 4-up grid. Used: "Who put in what".

### 2.6 Cards for dashboards

**StatCard** — Props: `variant: 'steel'|'signal'|'clay'|'sand'|'peach'|'white'|'ink'`, `overline`, `value: ReactNode`, `meta?: string | string[]`, `size: 'lg'|'md'|'sm'`, `onPress`, `shadow?`. Radius ≈ 28 (Home) / ≈ 22 (other grids), padding 16. Overline 12 px 600 tracking; value Onest 700 (lg 32, md 25, sm 23); meta 12 px. Text: ink on steel; white on signal; dark brown `#3A1D0E` on clay/peach. **Home trio**: steel (owed, ≈ 138×172, soft shadow) · signal (you owe, ≈ 110×149) · clay (budget, ≈ 88×127), bottom-aligned (staggered heights), gap 10, overlapping the hero by ≈ 70. **Grid variants** (Money "Other budgets", Patterns, Trip report, Afford): 2-column, equal height. **MiniStat** (SPENT/LEFT/PROJECTED): white or peach, radius ≈ 20, overline 11 px, value 17–18 px 700, sub 12 px.

**QuickActionBar / QuickActionButton** — container `sand`, radius ≈ 28, padding ≈ 14, 4 equal tiles, gap 8; tile: white, radius ≈ 18, ≈ 76×76, icon 22 (`oxblood`/`signal`) above label 13 px 600. Props: `actions: {icon,label,onPress}[]`. Home: Scan bill · Ask · Say it · Settle.

**InsightCard** — `ink` Card radius ≈ 28, padding 18. Props: `overline` (with sparkle icon), `headline`, `body`, `actions: [{label,variant}]` (max 2, row), `tone='ink'|'oxblood'`. Headline 19–20 px 600 paper; body 15 px paper@80 %. Used: Home "PAYMIND NOTICED", Household insight (no buttons), Trip report "WHAT STOOD OUT" (oxblood+texture, multi-paragraph), Split "FAIR SPLIT · SUGGESTED" (oxblood+texture, bullet list).

**InboxRow** — white Card row: 40×40 radius ≈ 12 `peach` badge with count (rust 16 px 700) + title 16 px 600 + sub 13 px muted + chevron. Props: `count`, `title`, `subtitle`, `onPress`. Used: Home.

**ListRow** — generic: `left?` (DateBadge | Avatar | IconTile | TypeBadge | checkbox), `title` (15–17 px 600), `subtitle?` (12–14 px muted, may be rust/slate coloured via `subtitleTone`), `right?` (AmountText row + optional `StatusPill`/flag label), `onPress`, `chevron?`, `padding 14–16`. Specific recipes:
- **DateBadge** — 48 px wide, day 16–17 px 700 over `OCT` 12 px muted, centred. Used: Coming up (Home).
- **IconTile** — 52×52 radius ≈ 16 bg tint + icon/letters (space types, subscription initials "Fx", "FH").
- **TypeBadge** — 44×44 radius ≈ 14 with 11 px 700 label: `PAID` ink/paper · `ALERT` signal/white · `EXP` sand/oxblood · `BDGT` #F1EDE6/ink · `SPLIT` steel/ink · `GOAL` clay/ink · `BILL` peach/rust. Used: Timeline.
- **FlagLabel** — 12 px 700 tracking under amount: `PRICE UP` signal, `OVERLAP` rust, `UNUSED?` slate.

**SpaceMiniCard** — ≈ 113–176 wide × ≈ 185 (3-up horizontal scroller on Home, radius ≈ 24, padding 16): title 14–15 px 600 top, bottom block 12–13 px. Variants: `ink` (Goa Trip: "₹68,400 total / 1 of 4 settled"), `white` owe ("You owe" signal / ₹1,240), `white` square ("All square" slate / "60 / 40"). Props: `space`, `summary`.
**SpaceRow** — white card row h ≈ 76 radius ≈ 22: IconTile by type (Roommates `mist`+house slate; Couple `peach`+rings rust; Family `sand`+family oxblood; Friends `blush`+letter; Event `ink`+clay calendar; Trip, College, Office, Custom → add tints), title 18 px 700, sub 13–14 px muted, right status block (`You owe ₹X` signal, `Owed ₹X` slate, `All square` slate, `Upcoming` muted, or chevron). `dashed` for upcoming.
**FeaturedSpaceCard** — `ink`+DotTexture, radius ≈ 28, padding 18: overline, title 26 px 700, clay status pill ("Settling · 1 of 4"), AvatarStack, total 22 px 700 + "you're owed ₹4,200". Props: `space`, `status`.

**ProgressBar** — Props: `value: 0–1`, `segments?: {value,color}[]`, `tick?: 0–1` (2 px ink vertical tick, fair-share/even-pace), `height: 6|10|12|18`, `trackTone: 'sand'|'inkSoft'`, `fill: token`. Radius full; segments separated by 2 px gap (paper/white). Variants: goal (10, signal/clay/oxblood), budget-over (signal), on-track (slate), share bars (6 on ink: coral/steel/clay), paid-bars with fair-share tick (10), trip budget (10, clay on inkSoft), stacked category bar (18). **BarRow** = label + right value + ProgressBar + optional status text (BudgetRow, driver rows, family category rows).

**GoalCard** — Props: `goal`, `featured?`: `ink` card (clay fill) for featured/shared, white for personal (signal fill); title 19 px 700 + tag overline right ("SHARED · COUPLE"/"PERSONAL"), ProgressBar, meta row ("₹46,000 of ₹1,20,000" / "by Mar 2027"). Used: Goals list; compact version on Home ("38%") and Family ("45%", oxblood fill).

**BudgetRow** — accordion row in the grouped Category budgets card: name 15 px 600, right "spent / limit" (spent 16 px 700, limit muted), ProgressBar with even-pace tick (`fill = signal` if projected over else `slate`), status text 13 px 600 (`Heading ₹X over` signal / `On track · ₹X left` slate). Expanded body: `ink` panel with pace stats + advice sentence. Props: `category`, `spent`, `limit`, `projected`, `expanded`, `onToggle`.

**StatusPill** — radius 10–12, px 10, py 4, 11–12 px 700 UPPERCASE tracking ≈ 1. Props: `status`. Colours (bg / text):
| Status | bg | text |
|---|---|---|
| `PENDING` (initiated/pending) | `peach` `#F6E3D5` | `rust` `#994516` |
| `COMPLETED` (completed/confirmed_manual) | `mist` `#EEF3F6` | `slate`/ink `#2F4A5D` |
| `FAILED` | `blush` `#FAEBE7` | `signal` `#B3261E` |
| `CORRECTED` | sand-light `#F3EFE6` | `#4A453B` (dark neutral) |
| `CANCELLED` | sand-light `#F3EFE6` | `muted` |
| `NOT CONFIRMED YET` (verify) | `peach` | `rust`, radius full, 12 px, tracking 1.3 |
Map `settlements.status` → label: initiated, pending → PENDING; completed, confirmed_manual → COMPLETED; failed → FAILED; corrected → CORRECTED (show "₹180 → ₹160"); cancelled → CANCELLED.

**SettlementRow** — ListRow: title "You → Karthik" (arrow glyph "→"), sub "Today · Flat 402 · UPI (PhonePe)", right amount + StatusPill. Used: Reminders history.

**DebtRow** (simplified list, on `ink`) — `inkSoft` row radius ≈ 14, h ≈ 44, padding 14: "Arjun → You" paper 15 px left, amount 15 px 700 right; `settled` variant = 50 % opacity + strikethrough amount + " · paid 8 Oct". **SimplifiedCard** composes Overline + two Doto counts (`11` paper, `4` clay at ≈ 46 px) + DebtRows + footnote.

### 2.7 AI proposal & Bill Detective

**ProposalCard** ("Needs your OK") — `ink` Card radius ≈ 28, padding 16. Props: `title` (overline clay, e.g. "CREATE EXPENSE + SPLIT"), `fields: {label,value}[]` (2-col **FieldTile** grid, `inkSoft` tiles radius ≈ 16 padding 12, label 13 px steel, value 16 px 700 paper), `summary: string`, `onConfirm`, `onEdit`, `status?: 'pending'|'accepted'|'edited'|'rejected'`. Right of header: "Needs your OK" 14 px steel (becomes "Confirmed ✓" after accept). Buttons: `paperOnInk` Confirm (flex 1, h ≈ 56) + `ghostOnInk` Edit. Used: Ask (§8); same data contract as Voice field grid and Understand proposals (`ai_proposals`).

**FieldTile** — label + value. `variant: 'onInk' | 'light'` (light = white, hairline, radius ≈ 18, padding 14, label 13 muted, value 17 px 700). `flag?: {text}` → clay 1.5 px border + 12 px rust caption under the value (for AI-guessed fields: "Guessed from your usual route"). Tap → edit. Used: Voice, Ask proposal.

**DetectiveCard** — `ink` Card (radius ≈ 28, padding 16) with Overline (search icon, clay) "BILL DETECTIVE · N TO REVIEW", a list of **FlagCard**s and a check-line. **FlagCard**: `inkSoft`, radius ≈ 20, padding 16; title 15 px 600 paper; body 13–14 px paper@85 %; 2 buttons (`textOnInk` left, `ghostOnInk` right). Copy tone rule: explain, never accuse. Props: `flags: {id,title,body,actions:[{label,resolution}]}[]`, `passedChecks?: string`, `onResolve(flagId, resolution)`. Resolved flags collapse to a check-line.

**CapturedTxnCard** — white Card padding 16: merchant 16 px 600 + amount 17 px 700; source line 12 px muted ("UPI alert · today 9:12 AM · BREWSTREET@ybl"); category line 13 px `slate` 600 ("Food · Café — personal") or rust/slate "Looks recurring  Subscriptions"; ButtonRow [`dark` Confirm flex 1 | `outline` Edit | `outline` Not mine]. Props: `txn`, `onConfirm/onEdit/onNotMine`.

**ItemRow (bill)** — qty `1×` 12–15 px muted (w ≈ 40) + name 15 px + amount 16 px 600 (2 decimals), h ≈ 49; `flagged` = `blush` bg and "(repeat?)" suffix; inline-editable cells. **ItemSplitRow** (Split) — name + amount header, PersonToggle row, optional SegmentedControl (when custom), helper 12 px muted.

**ShareSummary** — `ink` card "EACH PERSON'S SHARE": per person label, amount 21 px 700, 6 px bar (coral/steel/clay), sub "Items ₹X + extras ₹Y". Props: `shares`, `total`.

### 2.8 Money, charts, feedback

**ForecastChart** — inside `ink` card: smooth line of monthly totals (paper 2.5 px), forecast dashed `clay` to the current-month column; current month = full-height steel (`#AEBCC7`) rounded band with ink dot+ring at forecast value; 3 gridlines `inkSoft`; x labels 12 px steel. Implement with `react-native-svg` (Victory not needed). Props: `points: {label,value}[]`, `forecastIndex`, `forecastValue`.

**StackedBar + Legend** ("Where it went") — segmented bar (h ≈ 18) + 2-col legend (12 px square radius ≈ 4, label 16 px, amount 16 px 700).

**PaidBars** ("Who paid what") — rows with name, "₹ paid · ±₹ balance" (balance slate/signal), bar in member colour, vertical fair-share tick.

**DriverRow** — label, signed amount (`+₹4,900` ink/`−₹600` slate), bar (signal/clay/slate). Used: "Why October is higher".

**StatusBox / InfoBox** — `mist` box radius ≈ 16–22 padding 14–16, 14–17 px 600 slate-ink text. Props: `icon?`, `tone: 'mist'|'sand'|'peach'`. Used: "All square…", "Right on target.", disclosure ("PayMind isn't a bank…" with shield icon), consequence ("Neel will owe you ₹150…"), Assumptions (`sand`), settlement strip (`peach`).

**AnomalyCard** — white Card with `clay2` emphasis: overline "UNUSUAL · PLEASE REVIEW" (rust), title 19 px 700, body 15 px, ButtonRow [`dark` Looks right | `outline` Split it | `outline` Don't know it]. Props: `anomaly`, `onResolve`.

**NudgeRow** — ListRow text 16 px + meta 13 px muted ("Food · Sunday").

**InsightNoteCard** — white Card radius ≈ 22 padding 14: 12 px colour dot (signal = price up, clay = overlap, slate = unused) + title 16 px 700 + body 14 px muted. Props: `tone`, `title`, `body`, `onPress`. Used: Recurring "Worth a look".

**SuggestionChips** — wrapping `ChipGroup` of white Chips (h ≈ 46, 15 px 600, may wrap to 2 lines) above the Composer or inside "Ask this trip"; tap sends the text. Props: `items`, `onSelect`, `selected?`.

**TableRow** — 3-column row (label left, muted column, bold column; over-plan values `signal`) for Plan vs actual / Contributions & balances, header row 14 px muted. Props: `cells`, `tones`.

**VerifyTimeline** — vertical steps: 12 px dots (`ink`; last unresolved = `clay`), connector 2 px `sand`, title 15 px 600, sub 12 px muted. Props: `steps: {title,sub,state:'done'|'pending'}[]`.

**ScenarioToggleCard** ("What if…") — white Card radius ≈ 22, 1.5 px hairline-dark border, Checkbox + title 16 px 600 + sub 13 px muted + right delta (`+₹10,000`, slate 600). Props: `title`, `subtitle`, `deltaPaise`, `checked`, `onToggle`.

**VerdictCard** — coloured Card radius ≈ 28, padding 18. Props: `verdict: 'no'|'tight'|'yes'` → bg `signal`/`clay`/`slate` + pill ("NOT THIS MONTH"/"TIGHT"/"YES") white pill with coloured text; headline 24–26 px 700; body 15 px. Used: Afford.

**BillRuleCard** — Card radius ≈ 24 padding 16: name 17 px 700 + total 19 px 700; sub 14 px muted; `expanded` (2 px ink border) reveals SegmentedControl + per-person value tiles (`paper`, radius ≈ 16, name 14 muted, value 19 px 700) + helper. Props: `bill`, `expanded`, `onToggle`, `rule`, `onRuleChange`, `shares`.

**UpiAppTile** — white tile radius ≈ 16 h ≈ 56, 34×34 `sand` logo box (2-letter oxblood or app icon) + name 14 px 600; selected = 2 px `signal` border. 2-col grid. Props: `app`, `selected`, `onPress`.

**ChatBubble** — `user`: right-aligned, `oxblood` bg, paper 16 px, radius ≈ 22 (bottom-right ≈ 6), max 84 %. `assistant`: left, white card with hairline (text 15–16 px); embeds ProposalCard or rich answers.

**Composer** — input (white, hairline, radius ≈ 20, h ≈ 56) + 56×56 `signal` mic button (radius ≈ 18). Docked above tab bar with `SuggestionChips` (wrap) above it.

**Viewfinder** — `ink`+DotTexture card radius ≈ 36 h ≈ 470; status pill top-centre (`#1B1F29`, paper 13 px 600, radius full); clay 2 px detection rectangle (radius ≈ 20); camera preview (`expo-camera`) clipped inside; **ShutterButton** (84 px: outer ring `signal`@20 %, inner `signal` disc, 3 px white ring), side buttons 56×56 white radius ≈ 18. **RecordButton** (Voice): 96 px signal disc + 120 px ring `signal`@25 %, white mic icon, pulse while recording. **Waveform**: ≈ 28 bars, 4 px wide, radius full, colour steel@35 %, animated heights.

**EmptyState** — centred icon-less block: title 17 px 600, body 14 px muted, optional Button. **Skeleton** — `sand` blocks matching card geometry with shimmer; used instead of spinners for screen loads. **Toast/Snackbar** — `ink` bg, paper 14 px, radius ≈ 16, bottom above tab bar (Undo action in clay).

**Sheet** — bottom sheet (radius ≈ 28 top, `paper` bg, grabber) for edit flows designed only implicitly (edit txn, settle manually, new budget, new goal, regroup alias).

---

## 3. Component → screen usage matrix

| Component | Screens |
|---|---|
| HeroHeader + DotTexture | Home, Pay, Voice, Trip, Family (+ oxblood/ink Cards on Split, Search, Money, Spaces, Report) |
| AmountText hero (Doto) | Home, Pay, Search, Trip, Report, Couple, Roommates, Family, Money, Recurring, Settle-simplified counts |
| StatCard | Home (trio), Settle (2), Couple/Report (tiles), Money (grids), Insights Patterns |
| QuickActionBar | Home |
| InsightCard | Home, Family, Report, Split |
| ProposalCard | Ask (and Voice via FieldTile grid) |
| DetectiveCard/FlagCard | Understand |
| CapturedTxnCard | Add bill |
| SegmentedControl / ChoiceChips / Chip | nearly all |
| PersonToggle / MemberChip | Split |
| SpaceRow / FeaturedSpaceCard / SpaceMiniCard | Spaces, Home |
| ProgressBar family | Home, Spaces, Trip, Couple, Family, Money, Goals |
| StatusPill / SettlementRow | Reminders & history |
| TypeBadge | Timeline |
| BottomTabBar | see `screens.md` §0 |
| Switch / SettingRow | Privacy, Recurring |
| Slider | Afford, Goals |
| VerdictCard / ScenarioToggleCard | Afford |
| ForecastChart / DriverRow / AnomalyCard / NudgeRow | Insights |
| BudgetRow | Money |
| BillRuleCard | Roommates |
| UpiAppTile / StatusBox | Pay |
| VerifyTimeline | Verify |
