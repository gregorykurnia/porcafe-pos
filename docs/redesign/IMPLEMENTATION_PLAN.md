# Redesign implementation plan — Canopy

Status: design finished (R0); ready to build, starting at R1  
Updated: 2026-10-13  
Design reference: **`DESIGN_SYSTEM.md`** (the rules) and **`directions/canopy-final.html`** (the visuals). If they disagree, `DESIGN_SYSTEM.md` wins. The reasons behind the decisions are in `CANOPY_REVIEW.md`.
How to run the build, one phase per session: `HANDOFF_IMPLEMENTATION.md`.

## Scope and guardrails

A from-scratch visual redesign of the whole app in the refined Canopy direction. This changes **how the app looks and is laid out**, not what it does.

- **No behaviour changes**, except the ones listed under "Behaviour changes needing owner approval", and only once the owner approves them. Data loading, Firestore writes, validation, hooks (`use-daily-close.ts` etc.) and business rules stay as they are. If a screen's logic is tangled with its markup, first move it into a hook in a refactor-only commit, then redesign.
- **Write fresh JSX; don't edit the old one.** Each screen's visual layer is rebuilt from an empty file using the R2 components. The old screen is only a checklist of what has to exist, not a layout to start from.
- **The content inventory is the definition of done.** Every data point, action and state that `CONTENT_INVENTORY.md` lists for a screen must exist on the redesigned screen. `CANOPY_REVIEW.md` §6 maps each part of the inventory to where it lives in the design.
- **`main` is live.** Pushes to `main` deploy to production on Vercel, and staff use the app every night. Every work package must leave every screen usable, so old and new screens have to look acceptable side by side while the migration is in progress (that's the job of the R1 bridge).
- **Use as few Firestore reads as possible.** Build and review components on `/lab` with fake data. Check each real screen live once, not in repeated sweeps (the daily quota ran out on 2026-10-12). Never add a read to the app shell, which runs on every page, without owner approval.
- **One work package per commit**, pushed to `main` (no redesign branch, per the owner).
- **Do not use** the old `docs/DESIGN_DIRECTION.md` or `docs/UX_AUDIT.md` as references.

## Stack notes

- Next.js 16.3.4 (App Router), React 19, Tailwind v4 (CSS-first `@theme` in `src/app/globals.css`), shadcn plus `radix-ui` primitives, `lucide-react` icons, `sonner` toasts.
- Before writing any code, read the relevant guides in `node_modules/next/dist/docs/` (see `AGENTS.md`). In particular, check `next/font` and the layout conventions before swapping fonts.
- Routes: `/` Home · `/items` Daily close · `/reports` Reports · `/inventory` Stock · `/setup` Setup.
- Breakpoints (DESIGN_SYSTEM §5): phone below 768 (bottom tab bar), tablet 768–1183 (88 px labelled rail), desk 1184 and up (232 px sidebar).
- Every screen is checked at **390, 820 (portrait tablet), 1024 and 1280** widths.

---

## Phase R0 — Refine Canopy (design only) ✅

Done by a stronger-model review (`HANDOFF_CANOPY_REVIEW.md` → `CANOPY_REVIEW.md`).

- [x] **R0.1 Sidebar:** cream with green accents. The selected item is a `brand-soft` pill, and there is only one solid green element per view.
- [x] **R0.2 Density:** two modes. Comfortable (56–64 px) for Daily close, Home, forms and all touch use. Compact (40 px) for desktop data tables. Touch devices always use comfortable.
- [x] **R0.3 Status colours:** five tones (ok · info · warn · danger · neutral), each with its own shape. Honey is retired. A solid danger fill is used only for Negative stock.
- [x] **R0.4 Phone navigation:** a docked 5-tab bar with Close centred (tinted normally, solid when active). Sub-sections are underline tabs at the top of each page, at every width. On phone, Setup is an index list.
- [x] **R0.5 Final mockup and rules:** `directions/canopy-final.html` and `DESIGN_SYSTEM.md`.
- [x] **R0.6 Owner answers.** On 2026-10-13 the owner accepted the recommendations below, which are also in the decisions log:
  1. **Sidebar:** stays cream. Revisit at the R2.6 `/lab` review; the fallback is a deep-green logo panel at the top of the sidebar only.
  2. **Payments:** entered after the items, matching the paper sheet. The order is one component's layout, so it's cheap to swap later.
  3. **Line amounts:** shown on desk and tablet, but not on phone, where the row needs the room for the stepper.
  4. **Tablet:** the rail layout covers 768–1183 automatically. Landscape (1024 and up) gets the two-column close; portrait drops to one column with the summary below. No other tablet-only work.
  5. **Honey:** retired.
  6. **Brief amendments:** applied to `DESIGN_BRIEF.md`.
  7. **Behaviour changes:** see the table below. Nav signals are declined for now; the recipes guard and line amounts are approved.

## Phase R1 — Foundations (bridge theme)

Goal: put the new tokens and fonts in place so the whole live app re-themes coherently **without breaking any old screen**. Old classes stay valid until R4.

- [x] **R1.1 Tokens, added alongside the old ones.** Add the DESIGN_SYSTEM §2 `@theme` tokens to `src/app/globals.css`, **leaving out `--color-*: initial`** (that reset moves to R4.1). Then:
  - **Bridge the shadcn variables** onto the new palette so the ~600 existing usages pick it up:
    - `--background` → canvas, `--foreground` → ink, `--muted-foreground` → ink-muted
    - `--card` and `--popover` → surface
    - `--primary` → brand, `--primary-foreground` → brand-on
    - `--secondary` → sunken
    - `--border` → line, `--input` → line-input, `--ring` → accent
    - `--destructive` → danger-solid
  - **Name clashes:**
    - `accent`: shadcn uses it as a hover background (21 uses: `ui/dropdown-menu.tsx`, `ui/select.tsx`, `state/stat.tsx`, `close/daily-close-panel.tsx`, `reports/duplicate-dates.tsx`). In the same commit, change those to `bg-brand-soft` / `text-ink` so the design's `accent` (links and the focus ring) can take the name.
    - `surface`, `danger`, `info`: these take the new values, which is the intended re-theme. Check the old usages (44, 34 and 18) still read well.
    - Old `success`, `warning` and `warm-accent`: point them at `ok`, `warn` and `brand` as temporary aliases, and mark them `/* legacy — remove in R4.1 */`.
  - Global base layer: body canvas and ink, tabular figures, and the `:focus-visible` ring.
- [x] **R1.2 Fonts.** Add `src/app/fonts.ts` with Outfit and Figtree (DESIGN_SYSTEM §3) and wire them in `layout.tsx`, replacing Inter and Geist Mono. Add the type-scale tokens (§4).
- [x] **R1.3 Design rules doc.** `DESIGN_SYSTEM.md` was written by the review.
- [x] **R1.4 Brand assets.**
  - Make the ruled lockup ("CHARRED / — BY PORCAFE —") and the round mark, as SVG if possible.
  - Make the single line illustration for empty states, using `canopy-final.html` as the reference.
  - Replace `public/logo.png`, `logo-mark.png` and `icon-192/512.png`. Set the `manifest.json` theme colour to brand and the background to `#F6F0E6`.
- [x] **R1.5 Check.** Walk every screen once at 390 and 1280 to confirm nothing is unreadable under the bridge theme. Run lint and build.

**Exit:** the live app is on the new colours and fonts, every old screen is still usable, and the build passes.

## Phase R2 — Component kit and `/lab`

Goal: every building block in DESIGN_SYSTEM §10 exists in code and can be reviewed without real data.

- [x] **R2.1 `/lab` route.** A development-only page that renders every component in every state with fake data. It must make no Firestore calls and must not be reachable in production. Include a width switcher (390 / 820 / 1024 / 1280).
- [x] **R2.2 Primitives (`src/components/ui/*`).**
  - Button: primary, secondary, ghost, destructive and inverse variants; sm 36, md 44 and lg 48 sizes; a loading state.
  - Input with the `line-input` border, plus select, popover, dropdown (⋯ row menus), dialog/AlertDialog, sheet (680 px side sheet on desk and tablet, full screen on phone), separator, calendar.
  - Toasts per §10: tone shown only in the icon disc, bottom-right on desk and top-centre on phone, errors stay until dismissed.
- [x] **R2.3 Fields.**
  - Money input: `Rp` prefix, digits right-aligned, a read-back hint, using the existing `parseRupiah`. Payment-row layout: label on the left, input on the right.
  - Quantity stepper: a pill track that turns `brand-soft` when the value is above 0, accessible labels that name the item, 36/44 px buttons.
  - Material quantity input with a unit suffix.
  - Date stepper with the Today and Future date tags.
  - Period selector (segmented control plus a date-range popover with validation) and period stepping (Day/Week/Month ‹ › Today).
  - `field-row`.
- [ ] **R2.4 Patterns.**
  - Status chip: five tones, each with its shape and word, including the solid Negative variant. Cover every set in §6.
  - Stat strip.
  - Data table: compact or comfortable, switching to comfortable on `pointer: coarse`, plus a sticky header, sortable head, band rows and the ⋯ menu. On phone it becomes two-line list rows.
  - Page header and underline page tabs (scrolling on phone; the selected tab is kept in the URL as it is today).
  - Banners (restored, conflict, negative, duplicates) and the 40 px offline strip.
  - Empty, loading and error states: the illustration empty state, skeletons, and an error banner with Retry.
  - Confirm dialog (normal, and destructive with focus on the safe choice), the unsaved-changes guard dialog (Save draft & continue / Stay / Discard), and the before/after diff.
  - Saved-at indicator.
  - Chart styling: update `src/lib/chart-colors.ts` and add shared `recharts` settings (bars, highlight, dashed today, dotted missing days, average line, legend, `role="img"` and `aria-label` wrapper).
- [ ] **R2.5 App shell (`nav.tsx`).**
  - Desk: a 232 px cream sidebar with the lockup.
  - Tablet: an 88 px labelled rail.
  - Phone: the docked 86 px tab bar (Home · Reports · **Close** · Stock · Setup) with safe-area padding, plus the phone Setup index list.
  - The connection state sits at the bottom of the sidebar and rail.
  - Keep the `navigation-guard`, offline notice and push/PWA hooks working exactly as they do now.
  - Leave out the per-section nav signals for now (draft dot, Stock count) until the owner decides (see the behaviour changes below).
- [x] **R2.6 Owner review.** The owner opens `/lab` on the Mac and the phone (and the tablet, if used) and approves it.

**Exit:** owner approves `/lab`. The new shell can go live in R3.1, or as its own commit if it looks right with the old screens under the bridge theme.

## Phase R3 — Screen-by-screen rebuild

For **each** work package below:

1. Re-read that screen's sections in `CONTENT_INVENTORY.md`, the matching frames in `canopy-final.html`, and `CANOPY_REVIEW.md` §6.
2. If needed, do a refactor-only commit first to move logic out of the markup.
3. Write new presentation code using only R2 components. Follow the DESIGN_SYSTEM rules: one solid green per view, cards hold sections and rows are hairlines, status shown with word, shape and tone, and figures right-aligned.
4. Tick off every data point, action, state and flow in the inventory sections.
5. Check at 390, 820, 1024 and 1280. Do one live check of the screen.
6. Commit and push: `Redesign R3.x: <screen> in Canopy`.

| WP | Screen | Main files | Inventory § | Design notes |
|---|---|---|---|---|
| [ ] R3.1 | Home | `src/app/page.tsx` | 3.1 | The Today card is the only solid element; Needs attention comes first. |
| [x] R3.2 | Daily close (entry, states, complete review, recap) | `src/app/items/page.tsx`, `components/close/daily-close-panel.tsx`, `complete-day-review.tsx`, `close-recap.tsx` | 3.2, 4.2–4.4 | One column in sheet order. One summary card (portions → payments → total → actions → save state). Phone: a sticky totals bar above the tab bar, which the recap replaces in place. Two columns at 1024 and up. The order of payments and line amounts follows R0.6 answers 2–3. |
| [x] R3.3 | Scan sheet (6 phases, photo viewer, review, payments) | `components/close/scan-sheet/*` | 3.3 | A side sheet on desk and tablet, full screen on phone, with a sticky save bar that states what blocks saving. The replace step uses the diff. |
| [ ] R3.4 | Daily close → History | `components/items/item-history.tsx`, `editable-item-sale-row.tsx` | 3.4, 4.10, 4.11 | Compact table with date band rows and CSV export. Legacy editing is shown in HTML §7. |
| [ ] R3.5 | Stock (summary, current stock, count sheet, opening stock, record movement or count) | `src/app/inventory/page.tsx`, `inventory/stock-dashboard.tsx`, `current-stock-card.tsx`, `count-sheet.tsx` | 3.6, 3.6.1 | Compact table showing 12 materials in view, no gauges, and the push status pill in the header. |
| [ ] R3.6 | Stock → To order, Orders, supplier schedules | `inventory/reorder-settings.tsx`, `supplier-orders.tsx`, `supplier-schedules.tsx` | 3.6.2, 3.6.3 | Orders is a list next to its detail, with the Receive form as an inner panel. |
| [ ] R3.7 | Stock → Usage recap | `inventory/usage-recap.tsx` | 3.6.4 | An open day is an inner panel, one level only. |
| [ ] R3.8 | Reports → Revenue, monthly reconciliation, duplicate dates | `src/app/reports/page.tsx`, `reports/period-selector.tsx`, `revenue-report.tsx`, `monthly-reconciliation.tsx`, `duplicate-dates.tsx` | 3.5, 3.5.1, 4.11 | Totals read as an equation. Payment mix equals the table's column totals. `jt` is used on chart axes only. |
| [ ] R3.9 | Reports → Items, Weekday patterns | `reports/items-report.tsx`, `weekday-report.tsx`, `weekday-pattern-analysis.tsx` | 3.5.2, 3.5.3 | Weekday patterns is built from drawn patterns only (HTML §7). |
| [ ] R3.10 | Setup → Menu, Materials, Recipes | `src/app/setup/page.tsx`, `setup/menu-catalog.tsx`, `menu-item-row.tsx`, `materials-setup.tsx`, `recipes-setup.tsx`, `inventory/recipes.tsx`, `inventory/materials.tsx` | 3.7–3.9 | Menu uses category band rows. Recipes is a list next to its detail. Materials is assembled from drawn patterns (HTML §7). |
| [ ] R3.11 | Setup → Suppliers, Import, Notifications, Data maintenance | `setup/suppliers-setup.tsx`, `inventory/suppliers.tsx`, `setup/import-setup.tsx`, `inventory/import-review.tsx`, `push-notifications-settings.tsx`, `setup/data-maintenance.tsx` | 3.10–3.13 | Assembled from drawn patterns (HTML §7). Suppliers gets an in-page segmented control instead of stacked cards. |

**Owner checkpoint after R3.2:** the owner uses the new Daily close for a real night's close before R3.3 onwards goes ahead.

The order follows usage: the nightly close first, then stock, reports and setup. Charts follow DESIGN_SYSTEM §10 "Charts" and the dataviz rules.

**Exit:** every screen is ticked off against the inventory.

## Phase R4 — Cleanup and polish

- [ ] **R4.1 Close the bridge.**
  - Add the `--color-*: initial` reset from DESIGN_SYSTEM §2.
  - Remove the legacy aliases (`success`, `warning`, `warm-accent`) and the shadcn bridge variables that nothing uses any more.
  - Search for leftover old token names and hard-coded colours, then delete any unused components.
- [ ] **R4.2 Consistency pass.** Walk every screen at all four widths and check spacing, the type scale, empty and error states, and toasts.
- [ ] **R4.3 Accessibility pass.** Work through the DESIGN_SYSTEM §13 checklist: AA contrast, focus rings, 44 px targets, 16 px inputs on touch, icon labels, focus trapping and `prefers-reduced-motion`.
- [ ] **R4.4 Docs.** Update `STAFF_GUIDE.md` wording and screenshots where navigation changed. Mark `docs/DESIGN_DIRECTION.md` and `docs/UX_AUDIT.md` as superseded.
- [ ] **R4.5 Lint, typecheck, build.** `npm run lint`, `npx tsc --noEmit` and `npm run build` must all pass. Then do a final owner walkthrough on the Mac, the phone and the tablet, if used.

**Exit:** owner signs off. Redesign complete.

---

## Behaviour changes needing owner approval

The design assumes these, but each one changes behaviour or data, not just the look. Each approved item is built as its own commit, separate from the visual work.

| Item | What it is | Cost or risk |
|---|---|---|
| **Nav signals** — ❌ declined for now | A draft half-circle on Daily close and a To order count on Stock, in the sidebar, rail and tab bar. | Needs data in the app shell on **every page**, which means extra Firestore reads. Revisit after the redesign, perhaps reusing data a page has already loaded. Leave a slot in the shell's API, but render nothing. |
| **Recipes unsaved guard** — ✅ approved | The same unsaved-changes guard Daily close has, added to the recipe editor (the inventory notes none exists today). | Small; reuses `navigation-guard` / `use-unsaved-changes.ts`. Build it as its own commit inside R3.10. |
| **Line amounts in the close** — ✅ approved (desk and tablet) | qty × menu price beside each item. | Display-only, computed from data already loaded. Built in R3.2. |

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-13 | Full-app redesign from a blank slate; the current UI is not a reference. |
| 2026-10-13 | Brand: Charred by Porcafe logo, forest green on cream (`#F6F0E6`); modern, calm, roomy, light. Dark mode not required. |
| 2026-10-13 | Direction B · Canopy chosen over A · Daybook and C · Mise. |
| 2026-10-13 | Work directly on `main`, one commit per work package. |
| 2026-10-13 | Canopy review accepted as the design reference. Cream sidebar; comfortable and compact densities; five status tones with shapes; honey retired; docked phone tab bar with Close centred; sub-sections as page tabs; tablet treated as first-class (pending R0.6 answer 4). |
| 2026-10-13 | Build note: new tokens go in alongside the old ones (bridge) because `main` is live. The palette reset waits until R4.1. |
| 2026-10-13 | R0.6: the owner accepted all recommendations (cream sidebar, payments after items, line amounts on desk and tablet, rail covers tablet, honey retired, brief amended, nav signals declined, recipes guard approved). |
| 2026-10-13 | R3.1 Home deviations. (1) Needs attention comes first in reading order at every width. The phone frame puts the Today card above it; the R3 design note takes priority over the frame. (2) The month glance is a custom grid (list on phone, two columns on tablet, four from 1184 px), not `StatStrip`: four tablet columns cannot hold "Rp 612.840.000" at 820 px. (3) Sales trend is a bar chart (frame and §10), not the old area chart. (4) The Today card adds the day's status chip and portions from the already-loaded day log. "Saved 12 min ago" is left out because it needs a live clock. (5) Needs attention shows a loading skeleton, not a false "Nothing needs attention", while data loads. (6) A change against a zero earlier period is not shown as a percentage. |
| 2026-10-13 | R3.2 Daily close deviations. (1) Line amounts show on tablet as well as desk (R0.6 answer 3 and the behaviour-changes table); the mockup's tablet frame drops them, and the plan wins. (2) The Scan sheet trigger is the outline button, not the solid one, so Complete day is the only solid green. (3) The summary card shows an estimate, "≈ Rp X at menu prices", from the items already loaded; it is display only and is partial when a sold item has no price. (4) Payment and portion totals are unchanged from the hook; the Other portion cell appears only when Other has portions, as the inventory asks. (5) The save line reads "Saved" (shared SaveState) rather than "Saved for this day". (6) Quantities keep the old decimal-accepting entry (`allowDecimal`), so the keypad is decimal on touch; the inventory says whole numbers. Owner to decide whether to switch to whole numbers. (7) The completion review uses the new title "Complete {date}?" and says "No issues found." before the completion note. (8) The shared navigation-guard prompt is unchanged (it is shell code, outside R3.2); its Discard style and the unused UnsavedGuardDialog pattern are for R3.10 or R4.2. (9) The date stepper's Future date chip stays off, as before. (10) The phone shell bar is 64 px plus the home-indicator inset, so the totals bar sits at that offset. |
| 2026-10-13 | R3.3 Scan sheet deviations. (1) One side sheet holds every phase (start, reading, error, review). The mockup uses a centred dialog for start, reading and error, and a side sheet for review. One container keeps focus in place as the phase changes. (2) The sticky save bar lists what blocks saving. Save is disabled for the same four reasons as before (saving, saved day not checked, conflict, unmatched row). The other three checks (whole numbers, nothing to save, unreadable payments) still run on click with the same messages, and the bar shows them before the click. (3) "Take a photo" and "Choose an image" are separate buttons. The old screen had one camera-only input, so choosing an image from the library was not possible. (4) A photo the browser cannot decode shows the unsupported-format message with the iPhone JPEG tip. The old screen showed the raw browser error. (5) The reading phase has no progress bar, because the mockup's bar is decorative and the scan reports no progress. Its three steps show the real phases. (6) The replace confirmation is one wide before/after table for items and payments, so its count covers both. "Only show changes" is on, and the button reads "Save anyway" when nothing changes (the mockup's wording). (7) Shared primitives changed for touch and for this sheet, with the same props: Input and Select are 44 px and 16 px text up to 1183 px (desk stays 40 px and body text); Banner actions are 44 px; the sheet takes `showCloseButton`; the confirm dialog takes `wide`; ChangeDiff is restyled. Other screens get the same touch sizes. (8) On phone the footer Close button is hidden, because the header close does the same job and the mockup's phone bar has only the save button. (9) The scan trigger stays an outline button, as R3.2 set it. Checked with fixture data only, at 390, 820, 1024 and 1280: no horizontal overflow, every phone and tablet control at 44 px or more, and no Firestore request. No live check was run. Owner to try one real scan and save on the phone and on desk. |
| 2026-10-13 | R3.4 History deviations. (1) The Source column reads "Legacy row" on legacy rows; the old screen left it blank. (2) Rows sit under date bands (with the day's portions, as the frame shows) when the list is in date order, which is the default and the Date sort. Other sorts show a flat list. Each row keeps its date, because legacy rows edit it. (3) "Open day" stays on each Daily close row, not on the band, because the inventory asks for it per entry and a flat sort has no band. On tablet it is an icon, named by aria-label and title. (4) Delete moved into the ⋯ menu as "Delete sale", as the frame shows. The confirmation text is unchanged and still uses the shared `useConfirm` dialog, which is not yet restyled to the ConfirmDialog pattern (for R3.10 or R4.2). (5) The legacy date caption shows only when the date is blank ("No date selected"). The save state ("Saving…", "Saved") sits under the date on desk and tablet, and at the foot of the row on phone. (6) Today is disabled, not hidden, at the current period, as §10 says. (7) The empty states keep the inventory titles. The sentence under them is new, and with filters on there is a "Clear filters" action. (8) The table header is not sticky, because the shared Table wrapper scrolls and that would stop it sticking. (9) Tablet cell padding is 6 px. With legacy rows present at 768 px, the table scrolls sideways inside its card by about 31 px; the page does not. From 820 px it fits. Legacy rows are temporary. (10) Shared touch sizes: SegmentedControl buttons and SortableHead buttons are at least 44 px tall on touch (`pointer: coarse`). Desk is unchanged, and the other screens that use them get the same. Checked with fixture data at 390, 768, 820 and 1024 (touch emulation) and 1024 and 1280 (desk), and once live (read only, resized in place: no overflow, 145 entries). The legacy edit was run with every Firestore call blocked: the ⋯ menu and "Saving…" were seen, but the save result, the delete and the CSV download were not. R3.4 stays unticked until the owner has made a legacy edit and a delete, and downloaded a CSV, on a phone and on desk. |
| 2026-10-13 | R3.5 Stock deviations. (1) Record movement, Record stock count and the Count stock sheet are side sheets at every width, not a dialog on desk and tablet with a full-screen sheet on phone, and the count sheet is a sheet, not a full page. R2 has no dialog pattern, and DESIGN_SYSTEM §10 reserves sheets for review-and-save flows; each sheet's save bar states what blocks saving. (2) Count stock and Record movement sit in a toolbar at the top of the Stock tab, not in the page header, because the sheets are owned by the Stock tab. The push pill stays in the header. (3) Order is an inline text action on rows that need it. Record count is in each row's ⋯ menu, which is the only entry to the single-material count. (4) Current stock has no sort, because the inventory lists none, so the frame's sort arrows are left out. (5) Opening quantities and movement quantities use the plain unit-suffix input, so decimal text only: a minus sign can no longer be typed (save still rejects a negative or unreadable value). The count sheet keeps its comma-accepting input. (6) The audit trail date reads "12 Oct 2026" in the table to fit beside the reason on tablet. (7) DataTable gained a phone `detail` line that wraps (for the audit reason and the count reason), and MaterialQuantityInput gained a `placeholder` prop. Both are additive. PushAlertsChip was restyled in place; Stock is its only caller. (8) A purity lint suppression sits on the Date.now() in saveStockCount, which the react-hooks rule flagged after the restructure; the timestamp is set in the save handler. Checked with fixture data only, through a temporary harness that was removed before the commit: no horizontal overflow at 390, 820, 1024 and 1280; every control at 44 px or more on touch at 390 and 820; the Record movement and Count stock sheets open at 390, 820 and 1280 with no overflow. No live check was run, and no Firestore read or write reached the server. The save, count, movement, opening stock, push enable and receive-against paths were not exercised live. R3.5 stays unticked until the owner has recorded a movement, a single count and a count sheet, and initialized opening stock on a phone and on desk. |
| 2026-10-13 | R3.6 To order, Orders and schedules deviations. (1) To order keeps Alert level and Gap to alert as separate columns on desk. Its headings wrap so the eight columns fit the 886 px card at 1280, and the action column is no longer clipped. On tablet and phone it is a two-line list (`DataTable` gained `listBelow` and `actionsBelow`, both optional, and the defaults are unchanged). Create order sits under each row on phone and tablet. (2) A material with no alert level shows "—" under Alert level and "No alert level" under Gap to alert, as the frame does. (3) Reorder settings and Recurring deliveries switch from table to list at 1184 px, not 768, because both tables scrolled sideways at 820 and 1024. Setup → Suppliers renders both components, so R3.11 inherits this. (4) An order line in the list reads "Material × qty unit (received N)" once something has arrived, as inventory 3.6.3 asks. (5) The schedule sheet's save bar states what blocks saving. Saving still runs the same checks and reports each problem as a toast. Checked with fixture data only, through a temporary harness that was removed before the commit: no page overflow at 390, 820, 1024 and 1280; every control 44 px or more on touch at 390 and 820; no table scrolls sideways at any of the four widths. The status filter pills scroll sideways inside their own track on phone (303 px) and by 9 px at 820; the page does not. No live check was run, and no Firestore read or write reached the server. Create order, receive, record receipt, cancel, Arrived as planned, schedule save, run due now, pause and resume, and reorder save were not exercised live. R3.6 stays unticked until the owner has created an order, recorded a partial receipt, cancelled an order, saved a reorder setting, and saved, paused and resumed a schedule, on a phone and on desk. |
| 2026-10-13 | Charts: keep `recharts` (already a dependency), restyled to the DESIGN_SYSTEM chart rules through `src/lib/chart-colors.ts`, rather than rewriting them as inline SVG. Same look, less risk. |
| 2026-10-13 | R1.1 bridge choices: `warm-accent` aliases to `sunken` (the old tan tint), not `brand`, because `brand` under brand-coloured text (Home's `text-primary` badge) would be invisible. `--muted` and `--secondary` take `sunken`. The DESIGN_SYSTEM §5 radii (8 / 12 / 20) replace the old `--radius-sm/md/xl`. Chart series map to the new palette (series 1 accent, 2 chart-2, 3 info, 4 neutral) until R2.4 restyles them. `@theme static` keeps the tokens in `:root` so the bridge can reference them. |

## Out of scope (noted for later)

- Home's "Needs attention" can show stock and delivery alerts, but Home doesn't load that data (inventory §3.1). That's a data change and a separate feature, though it's related to the "Nav signals" item above.
- No sign-in or role gating (owner decision in `ACCESS_PLAN.md`). All sections stay visible to everyone.
