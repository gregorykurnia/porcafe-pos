# Design system — Canopy

The rulebook for the Charred by Porcafe back office. The visual reference is `directions/canopy-final.html`, and the reasoning is in `CANOPY_REVIEW.md`. If this file and the HTML disagree, this file wins.

Stack: Next.js 16, Tailwind v4 (`@theme` tokens), shadcn/Radix primitives, `lucide-react`, `sonner`. The look comes from these tokens and our own components, never from library defaults.

---

## 1. Five rules

1. **One solid green per view.** The brand fill marks the single focal action or figure (Complete day, the Today card, Save recipe). Everything else is cream, white, ink and hairlines.
2. **Cards hold sections; rows are lines.** Never nest a card in a card, and never make a row a card.
3. **Status = word + shape + tone.** Never colour alone. Five tones only (§6).
4. **Numbers are first-class.** Tabular figures everywhere, right-aligned in columns, and Rupiah formatted one way (§7).
5. **The nightly close is always one tap away**, and its main action is always the easiest thing to reach.

---

## 2. Tokens (`app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* Reset the default palette so off-token colours can't creep in. */
  --color-*: initial;
  --color-white: #FFFFFF;

  /* Surfaces */
  --color-canvas: #F6F0E6;        /* page background — the logo's cream */
  --color-surface: #FFFCF7;       /* cards, dialogs, inputs, tables */
  --color-sunken: #EFE8DB;        /* tracks, totals rows, skeletons */

  /* Lines */
  --color-line: #E6DDCD;          /* hairlines, card borders (decorative) */
  --color-line-strong: #D3C7B3;   /* stepper buttons (decorative) */
  --color-line-input: #9A8E79;    /* input + secondary button borders — 3.15:1 on surface */

  /* Text */
  --color-ink: #1F2B25;           /* body + figures — 12.95:1 on canvas */
  --color-ink-muted: #5E655D;     /* labels, meta, placeholders — ≥4.88:1 on every surface */
  --color-ink-faint: #8B8E85;     /* disabled only, never information */

  /* Brand */
  --color-brand: #163D2F;         /* the one solid action; page titles — 10.63:1 */
  --color-brand-hover: #0F2E23;
  --color-brand-on: #F6F0E6;      /* text on brand — 10.63:1 */
  --color-brand-soft: #E3EDE4;    /* selected nav, qty > 0, selected rows */
  --color-accent: #2F6B50;        /* links, focus ring, chart series — 6.14:1 on surface */

  /* Status: ink on its own tint (all ≥4.88:1) */
  --color-ok: #2B6047;        --color-ok-tint: #E3EDE4;
  --color-warn: #85540A;      --color-warn-tint: #F7EAD1;   --color-warn-mark: #B07A1C; /* icon on white, 3.63:1 */
  --color-danger: #A23B22;    --color-danger-tint: #F7E2DA; --color-danger-solid: #A9432A; /* white text 5.96:1 */
  --color-info: #355F73;      --color-info-tint: #E2ECEF;
  --color-neutral: #5E655D;   --color-neutral-tint: #EDE7DC;

  /* Charts */
  --color-chart-1: #2F6B50;   /* main series (use at 78% opacity; brand marks the highlight) */
  --color-chart-2: #8DAE98;   /* secondary series — always labelled */
  --color-chart-base: #D9CFBE;/* gridlines, empty tracks */

  /* Type */
  --font-display: var(--font-outfit), ui-sans-serif, system-ui, sans-serif;
  --font-sans: var(--font-figtree), ui-sans-serif, system-ui, sans-serif;

  --text-display: 2.5rem;    --text-display--line-height: 2.875rem; --text-display--letter-spacing: -0.02em;  --text-display--font-weight: 500;
  --text-title-1: 1.875rem;  --text-title-1--line-height: 2.25rem;  --text-title-1--letter-spacing: -0.015em; --text-title-1--font-weight: 500;
  --text-title-2: 1.1875rem; --text-title-2--line-height: 1.625rem; --text-title-2--font-weight: 500;
  --text-title-3: 0.9375rem; --text-title-3--line-height: 1.375rem; --text-title-3--font-weight: 600;
  --text-body-lg: 1rem;      --text-body-lg--line-height: 1.5rem;
  --text-body: 0.9375rem;    --text-body--line-height: 1.375rem;
  --text-table: 0.875rem;    --text-table--line-height: 1.25rem;
  --text-small: 0.8125rem;   --text-small--line-height: 1.125rem;
  --text-micro: 0.75rem;     --text-micro--line-height: 1rem;
  --text-fig-xl: 2.5rem;     --text-fig-xl--line-height: 2.75rem;   --text-fig-xl--letter-spacing: -0.02em;   --text-fig-xl--font-weight: 500;
  --text-fig-l: 1.5rem;      --text-fig-l--line-height: 1.875rem;   --text-fig-l--letter-spacing: -0.01em;    --text-fig-l--font-weight: 500;
  --text-fig-m: 1.25rem;     --text-fig-m--line-height: 1.625rem;   --text-fig-m--font-weight: 500;

  /* Radius */
  --radius-sm: 8px;   /* tooltip, tag */
  --radius-md: 12px;  /* input, menu, banner, inner panels */
  --radius-xl: 20px;  /* card, dialog, sheet */
  /* rounded-full: buttons, chips, segmented tracks, steppers */

  /* Elevation */
  --shadow-card: 0 1px 2px rgb(22 61 47 / .04);
  --shadow-raised: 0 1px 2px rgb(22 61 47 / .06), 0 8px 20px -10px rgb(22 61 47 / .22);
  --shadow-overlay: 0 2px 6px rgb(22 61 47 / .08), 0 24px 48px -16px rgb(22 61 47 / .30);

  /* Motion */
  --ease-soft: cubic-bezier(.2, .8, .2, 1);
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 240ms;

  /* Breakpoints */
  --breakpoint-tablet: 48rem;  /* 768 — rail replaces tab bar */
  --breakpoint-desk: 74rem;    /* 1184 — sidebar replaces rail */
}

@layer base {
  body { @apply bg-canvas text-ink font-sans text-body antialiased; font-variant-numeric: tabular-nums; }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
}
```

Every text pairing above was measured, and the HTML's token table recomputes the ratios live. Nothing tinted with opacity is used for text, except `brand-on` at 80% on brand (7.39:1).

## 3. Fonts (`app/fonts.ts`)

```ts
import { Outfit, Figtree } from 'next/font/google';
// Both are variable fonts: omit `weight` to load the axis.
export const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
export const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
// <html className={`${outfit.variable} ${figtree.variable}`}>
```

- **Outfit** (weight 500): page and card titles, and every large figure. Weight 300 is for marketing or document headings only, never in the app.
- **Figtree** (weights 400, 500, 600): everything you read or type.
- Both fonts have real tabular figures, but they are off by default. The base layer turns them on globally. Never override this.

## 4. Type scale

| Token | Family | Size / line · weight | Use |
|---|---|---|---|
| `display` | Outfit | 40/46 · 500 | Home greeting only |
| `title-1` | Outfit | 30/36 · 500 | Page `h1` (brand colour). Phone: 24/30 |
| `title-2` | Outfit | 19/26 · 500 | Card and dialog titles |
| `title-3` | Figtree | 15/22 · 600 | Group headers inside a card (Main, Payments) |
| `body-lg` | Figtree | 16/24 | Phone body. **All inputs on touch** (prevents iOS zoom) |
| `body` | Figtree | 15/22 · 400–500 | Desktop body, list rows |
| `table` | Figtree | 14/20 | Table cells, compact rows |
| `small` | Figtree | 13/18 | Meta, helper text, table headers |
| `micro` | Figtree | 12/16 · 600 | Chips, tab-bar labels. **The floor: nothing smaller.** |
| `fig-xl` | Outfit | 40/44 · 500 | The one hero figure per screen |
| `fig-l` | Outfit | 24/30 · 500 | Stat strip cells (fits "Rp 612.840.000" in a quarter column) |
| `fig-m` | Outfit | 20/26 · 500 | Totals bar, stepper value, Total rows |

Sentence case everywhere. Uppercase tracking is allowed only in the logo lockup.

## 5. Space, radius, layout

- **4 px base.** Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 56.
- **Gutters:** 40 (desk) · 24 (tablet) · 16 (phone). **Card padding:** 24 · 16 on phone. **Between cards:** 20 · 12 on phone. **Page header → content:** 32 (28 when tabs sit between).
- **Content width:** fluid, max 1120 px, left-aligned beside the sidebar.
- **Radius:** card/dialog 20, input/menu/banner 12, tag/tooltip 8, everything you press is `full`.
- **Elevation:** resting cards are a 1 px `line` border + `shadow-card`. `raised` is for sticky bars, the selected segment and menus. `overlay` is for dialogs, sheets and toasts. Nothing else floats.
- **Breakpoints:** phone < 768 (bottom tab bar) · tablet 768–1183 (88 px labelled rail) · desk ≥ 1184 (232 px sidebar).

## 6. Status colour

Five tones. Each has one meaning, one shape, and a tint + ink pair (chip text ≥ 4.88:1).

| Tone | Means | Shape |
|---|---|---|
| `ok` | Done or healthy | check |
| `info` | In progress, nothing to do yet | half-filled circle |
| `warn` | Needs a person | filled triangle |
| `danger` | Wrong or blocked | filled diamond |
| `neutral` | Inactive or not applicable | open circle |

**Solid danger** (`danger-solid` + white) is reserved for **Negative** stock. It is the only solid chip.

| Set | ok | info | warn | danger | neutral |
|---|---|---|---|---|---|
| Day close | Complete | Draft | Unsaved changes | — | Not started, No sales |
| Item day | Sold | — | Not logged | — | 0 sold, No sales |
| Stock | OK | On order | To order | Out, **Negative (solid)** | No alert level, Alerts off, Not set up |
| Supplier order | Received | Ordered / On the Way, Partially Received | Waiting to be confirmed | — | Cancelled |
| Recipe | Active | Draft | Needs review | — | Retired |
| Line review | Approved | — | Needs review | — | — |
| Usage day | Calculated | Calculated with exclusions, Waiting for close | Needs review | — | No sales |
| Import row | Approved | — | Needs review, Map first | — | Excluded |
| Catalog | Preferred | — | — | — | Archived, Paused, Alternate |
| Push | On | Checking | — | Blocked | Off, Unavailable |
| Attention severity | — | info | warning | danger | — |

- **Honey is retired.** A highlight (best day, top item) is shown with `brand` against `chart-1` plus a label, never with a warning-like colour.
- **Normal states are quiet.** Catalog lists mark only the exception: Active has no chip; Archived does. Where a Status column exists, every row gets its chip.
- **Deltas:** ↑ in `ok` when good, ↓ in `danger` when bad, always followed by the comparison in words ("vs last week").

## 7. Numbers and formats

- Rupiah: `Rp 3.215.000` (dot thousands, no decimals, a space after Rp). Negative: `− Rp 185.000` (true minus sign).
- **In table columns** the currency goes in the header (`Total · Rp`) and cells hold digits only. Totals rows repeat `Rp`.
- Short forms (`5,48 jt`) are allowed **only** on chart axes and chart labels.
- Material quantities: up to 2 decimals, Indonesian grouping, unit always shown (`1.250 g`). Signed movements: `+3.000 g`, `−210 ml`.
- Dates: long `Tuesday, 13 Oct 2026`; short `Tue, 13 Oct`; weeks `Week of Monday, 6 Oct – Sunday, 12 Oct`; times `21:42`; relative `12 min ago`.
- All numbers right-aligned in columns. Never centre a figure in a table.

## 8. Density

| Mode | Row height | Where |
|---|---|---|
| **Comfortable** | 56–64 px; touch targets 44 | Daily close (all devices), Home lists, every phone and tablet screen, forms |
| **Compact** | 40 px; one line per row | Desktop tables: Revenue days, History, Stock, To order, Orders lines, Usage, Setup tables, audit trails |

On touch devices (`@media (pointer: coarse)`), compact switches to comfortable and `sm` buttons grow to 44 px. Phone tables become two-line list rows: primary text and figure on line 1, secondary values on line 2.

## 9. Card or list?

- **A card** holds one independent section that answers its own question (Needs attention, Payments, Current stock) and could move on the page without breaking.
- **Inside a card**, items are hairline-divided rows. A group inside a card gets a `title-3` header row, not a nested card.
- A **row of figures** is one card with hairline cell dividers (stat strip), not one card per number.
- **Inner panels** (`canvas` fill + `line` border, radius 12) are allowed for one inline sub-task: the Receive form, an open Usage day. One level only.
- Banners, toolbars and filters sit **outside** cards, on the canvas.

## 10. Components

**Button** (shadcn Button). Variants: `primary` (brand, at most one per view) · `secondary` (surface + `line-input` border) · `ghost` (brand text) · `destructive` (danger-solid; only inside confirmations) · `inverse` (on brand). Sizes `sm` 36 (desk tables only) · `md` 44 · `lg` 48. Loading = spinner + verb in -ing ("Saving…"). Icon-only buttons need `aria-label` and a tooltip.

**Money input.** A fixed `Rp` prefix (not typed), with digits **right-aligned** so they line up with the Total below. Groups as you type (1500 → 1.500). Accepts `1,5jt`, `150rb` and `150k`, normalises on blur, and shows a hint saying what it read ("Read "1,5jt" as Rp 1.500.000"). Blank = 0, and the placeholder shows `0`. An unreadable value keeps its text, shows the error "Use digits, for example 1.500.000 or 1,5jt.", and blocks saving. On touch, use `inputMode="decimal"`. In Daily close, payment rows put the label on the left (88 px) and the input on the right.

**Quantity stepper** (portions). A `sunken` pill track holding − / value / +. When the value is above 0, the track turns `brand-soft` and the value turns brand. Buttons are 36 px (desk) or 44 px (touch), with surface fill and a `line-strong` border. − is disabled at 0. The value is a typed input (`role="spinbutton"`, `inputMode="numeric"`) in `fig-m`. Every button's label names the item ("One more Chicken Nanban"). Material quantities use a plain input with the unit suffix instead.

**Date stepper** (Daily close). ‹ · long date + `Today` tag (or a `Future date` warn chip) · › · calendar icon. Next is disabled on today. With unsaved work, any move opens the unsaved-changes guard first.

**Period selector** (Reports). A segmented control (This month · Last month · Last 30 days · Custom range) plus a date-range button that opens a popover with From and To. An invalid range shows the danger message in the popover, disables Apply, and hides the reports. The selected segment is a lifted white pill, not green.

**Period stepping** (History, Main portions). Segmented Day/Week/Month + ‹ label › + a ghost `Today` button.

**Page tabs.** Sub-sections are always underline tabs under the page title, at every width. On phone they scroll sideways. The sidebar lists only the five sections.

**Status chip** (Badge). Height 24 (28 in headers), `micro` 600, tint + ink + 12 px shape. See §6.

**Stat strip.** One card, cells divided by hairlines: label (`small`, muted) → figure (`fig-l`) → note. 4 columns on desk, 2 on phone. The figure is coloured only when it is itself a status (Negative).

**Data table.** Compact rows with hairlines and no zebra striping. Hover is `canvas`; selected is `brand-soft`. The header is `small` muted with a sort arrow, and sticky in long cards. At most one text action per row; the rest go in ⋯ (DropdownMenu), with destructive items in danger text. Grouped tables use a `canvas` band row (date bands in History, categories in Menu).

**Daily close totals bar** (phone only). Sits above the tab bar as part of the layout, not floating. Left: payment total (`fig-m`) and below it "101 portions · ▲ Unsaved" (or Saving… / ✓ Saved / Ready to close). Right: `Complete day` (primary lg). After completing, the **recap** (brand fill: "13 Oct closed · 101 portions · Rp 3.215.000 · stock updated" + inverse `Undo · 7 s` + a 10 s countdown bar) replaces it. On desk and tablet, the same content is the bottom section of the summary card. Save draft and No sales are secondary and live at the end of the page on phone.

**Phone tab bar.** Docked, 86 px including the home-indicator area. Home · Reports · **Close** · Stock · Setup. The active tab is a `brand-soft` pill behind the icon with a brand label. Close always has a `brand-soft` pill and becomes **solid brand** when active. The Stock badge shows the To order count (warn tint). Setup opens an index list of its seven pages (icon, name, one-line status); those pages show a back arrow.

**Desktop sidebar / tablet rail.** Cream (`canvas`) with a `line` border on the right. The logo lockup is the round mark plus "CHARRED / — BY PORCAFE —" with thin rules. The active item is a `brand-soft` pill with brand text. Per-section signals: an info half-circle on Daily close while today is a draft, and a warn count on Stock. The connection state sits at the bottom.

**Dialogs** (AlertDialog). Title (`title-2`), one sentence, an optional detail block (impact list or diff), then buttons right-aligned (full-width stacked on phone). Normal: focus on confirm. Destructive: danger icon disc, and **focus on the safe choice**. The unsaved guard offers `Save draft & continue` (primary), `Stay`, and `Discard` (danger ghost); if the save fails, the dialog stays with an error line.

**Before/after diff.** A table of Field · Saved · → · Sheet. Changed rows get the warn triangle and a light warn tint, the old value struck through and the new one bold. "Only show changes" is on by default. The count is in the sentence ("3 values will change.").

**Sheets.** A side sheet (680 px) on desk and tablet for review-and-save flows (Scan review, create order, supplier forms); full-screen on phone, with no tab bar and a sticky save bar that states what blocks saving.

**Toasts** (sonner). Surface + overlay shadow, with the tone shown only in the icon disc. Bottom-right on desk, top-centre on phone. Success and warning close after 4 s; errors stay until dismissed. At most one action. The completion recap is not a toast.

**Banners** (Alert). Tint background, ink text, tone icon, optional underlined action. Used for restored draft (info), conflict (warn), negative stock (danger), duplicates (warn). The offline notice is a 40 px warn strip across the top of the content with a WifiOff icon; save buttons stay visible but disabled.

**Empty / loading / error.** Empty: the one line illustration + `title-2` + one sentence + at most one action. Loading: skeletons shaped like the real layout + "Loading …" text; time out after 10 s. Error: a danger banner that says what failed and what is kept, plus Retry; the previous view stays visible when one exists.

**Charts** (inline SVG). Bars in `chart-1` at 78%, the highlight in `brand` with a direct label, today in progress as a dashed `line-input` outline, missing days as a dotted baseline, and the average as a dashed ink line. Always include a legend naming each mark, a one-line takeaway under the chart, and `role="img"` with a sentence-long `aria-label`.

## 11. Icons

lucide-react, `strokeWidth={1.5}`. 20 px in controls, 16 in chips and `sm` buttons, 24 in the phone tab bar. Outline only, never inside decorative circles. Section icons: House, ClipboardCheck, ChartColumn, Package, SlidersHorizontal.

## 12. Motion

`fast` 120 ms ease-out for hover, press and value changes. `base` 180 ms soft for menus and popovers (fade + 4 px rise). `slow` 240 ms soft for dialogs (fade, scale .98 → 1) and sheets (slide). Undo countdown: 10 s linear. With `prefers-reduced-motion`, motion becomes an instant fade, and the Undo bar becomes a number.

## 13. Accessibility checklist

- AA contrast for all text (see the token comments); 3:1 for input borders, focus rings and chart marks that carry meaning.
- Focus: 2 px `accent` outline with a 2 px offset on every interactive element. Never remove it.
- Touch targets ≥ 44 × 44 on tablet and phone. Inputs on touch are ≥ 16 px.
- Status never by colour alone (§6). Charts have a legend and an aria-label.
- Icon-only controls have `aria-label`; steppers announce the item name.
- The unsaved-changes guard and confirmations trap focus and return it to the opener.

## 14. Writing

- **Plain, short, calm.** Sentence case. Say what happened and what is kept: "Couldn't load this day. Your date is still selected."
- **Buttons are verbs + object:** Complete day, Save draft, Record receipt, Create order. Never "OK", "Submit" or "Yes".
- **Confirmations name the thing:** "Cancel PO-1013-02?" and the consequence in one sentence.
- **Errors:** what is wrong + how to fix it, with an example: "Use digits, for example 1.500.000 or 1,5jt."
- **Empty states:** what will appear and how it gets there: "No sales logged yet. Close tonight's sheet and this fills in."
- **Never blame the user.** No exclamation marks. Keep the shared vocabulary (inventory §4.12): Daily close, Portions, Payments, Sheet, Selisih, Recorded sales vs Reported total, To order, On order, Usage, Exclusion.
