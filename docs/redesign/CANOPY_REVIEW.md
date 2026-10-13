# Canopy review

A review of direction B (Canopy) against `DESIGN_BRIEF.md` and `CONTENT_INVENTORY.md`, and the decisions behind `directions/canopy-final.html` and `DESIGN_SYSTEM.md`. The old UI and the other docs were not consulted.

Contrast figures are WCAG 2.x ratios computed from the hex values in `direction-b.html`.

---

## 1. Brief amendments

The brief is right about the feel (calm, roomy, light, logo colours). It is under-specified on devices, priorities, accessibility and the data-heavy screens. Proposed changes:

```diff
 ## Devices
-- Mac (browser, laptop width) and phone. Both must work well; phone is not an afterthought.
+- Three first-class widths:
+  - Phone (390): the installed PWA, used for the nightly close, receiving and alerts.
+  - Counter tablet (768–1180, landscape, touch only): where the close is often typed.
+  - Mac (1280+, browser): reviews, ordering and setup.
+- The tablet gets touch density everywhere and a labelled rail, not a squeezed desktop.
+  It is first-class because it is touch-only, yet wide enough for the two-column close.
+- Standalone PWA: respect safe areas; there is no browser chrome to rely on.

 ## Priorities
-- Every screen matters equally. ...
+- Every screen must be complete; not every screen gets equal attention. Order of care:
+  Daily close + Scan sheet (nightly, tired, phone) > Home > Stock (receive, count, order)
+  > Reports > Setup. When the close and another screen disagree, the close wins.
+- Roomy chrome, compact data: generous space around sections, and a compact row
+  density inside data tables on desktop.

+## Accessibility
+- WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for input borders and meaningful marks,
+  44 px touch targets, a visible focus ring, and status never shown by colour alone.
+- Inputs at 16 px on touch (no iOS zoom). Smallest text 12 px.

+## Content and states
+- Money, quantities and dates follow inventory §4.7–4.9; figures are tabular.
+- Loading, empty, error, offline, conflict and unsaved states are in scope for every screen.

 ## Constraints
-- Built on Next.js + Tailwind (+ shadcn primitives as plumbing).
+- Next.js 16, Tailwind v4 (@theme tokens), shadcn/Radix, lucide-react icons, sonner toasts.
+  No effect that needs custom engineering beyond these.
+- Brand cream is #F6F0E6 (the logo), not an approximation.
```

---

## 2. Ranked critique of `direction-b.html`

### Critical

| # | Problem | Why it matters here | Fix |
|---|---|---|---|
| C1 | **Text contrast fails AA in many places.** Secondary text `stone #767A72` measures 3.79:1 on cream and 4.31:1 on cards, and it carries most labels, meta lines and table headers. `terra` on its tint is 3.61:1, `lake` on its tint 3.90:1. Zero quantities are drawn at `stone/40`, which is 1.58:1. | Read by a tired closer at night, on a phone, often in glare. The failing grey carries the information they need (ref prices, last saved, helper text). | A new `ink-muted #5E655D` (≥4.88:1 on every surface). Status inks re-tuned to ≥5.29:1 on their tints. Zero values use `ink-muted`; `ink-faint` is for disabled controls only. |
| C2 | **Inputs have no visible edge.** Fields are `cream` on `card`, a 1.14:1 boundary, with no border (it fails WCAG 1.4.11). | Payment fields must be found and hit fast. An empty field looks like a label. | Inputs are white with a `line-input #9A8E79` border (3.15:1) and a 2 px accent focus ring. |
| C3 | **The phone close is incomplete.** The phone mock shows item tiles only: no payments, no total, no Complete, Save draft or No sales. The floating pill bar plus the raised button plus the recap stack take about 180 px over the list. | This is the most frequent task in the app. The closer cannot finish without hunting for actions, and the overlays hide rows. | A docked tab bar plus a sticky totals bar (total, save state, Complete day). Payments sit after the items. The recap replaces the totals bar instead of floating. |
| C4 | **The item grid breaks sheet order.** Items are a two-column grid, so the reading order is left-right, left-right, while the paper sheet runs straight down. Long names wrap ("Nasi Goreng / Charred"). | Transcribing from paper is the core job. A zig-zag order makes skipped rows likely. | A single column in sheet order, with a line amount (qty × price) for typo-spotting. |

### Major

| # | Problem | Why | Fix |
|---|---|---|---|
| M1 | **The solid green sidebar** takes about 20% of the viewport and competes with the green Today card, green buttons and a green total. | The brief asks for light. Three green masses dilute the focus. | A cream sidebar with a hairline edge. The selected item is a `brand-soft` pill. One solid green per view. |
| M2 | **Honey means two opposite things.** It marks Draft, To order and warnings, and also the best day, the top item, the active sub-nav and the Close button. | Good news reads as a warning. The palette gets busy. | Honey retired. Warn = ochre ink on tint; highlight = brand vs chart-1 plus a label. |
| M3 | **Status relies on hue.** Every chip has the same dot except two checks. Out and To order differ only by terra vs honey; the chart's honey vs moss bars measure 2.80:1. | Colour-blind users, and anyone in bad light, cannot tell them apart. | Five tones, each with its own shape (check, half-circle, triangle, diamond, open circle), plus the word. |
| M4 | **Cards inside cards, and rows as cards.** Attention items, stock rows and top items are rounded tinted boxes inside cards. Stock rows are about 58 px, so 8 materials fill a screen. | Data screens scroll forever and feel busy, not calm. | Rule: cards hold sections, rows are hairlines. Compact 40 px desktop tables (12 materials in view). |
| M5 | **Tabular figures were applied patchily.** Both fonts have true tabular figures, but they are proportional by default. Outfit's proportional "1" is about 40% narrower than its "8", so live totals jitter and columns don't align where `.num` was missed (e.g. the Today figures). | Money is the product. | Tabular figures set globally in the base layer. |
| M6 | **Daily close is scattered.** Portions, payments and actions are three cards, the status chip sits far from the actions, and the save line is separate again. | The closer checks status, totals and acts in one glance. | One summary card: portions → payments → total → actions → save state. |
| M7 | **Navigation won't scale.** Sub-sections unfold in the sidebar on desktop but become a pill switch on phone, which can't hold Stock's four or Setup's seven. The raised Close button turns honey when active, the only place honey is a nav state. | Two patterns to learn; Setup has no phone home. | Sub-sections are underline tabs at the top of every page, at every width (scrolling on phone). Setup on phone is an index list. The Close tab is a centred pill, solid when active. |
| M8 | **Missing homes.** No History, Items, To order, Orders, Usage recap, Setup screens, Scan flow, guard prompt, offline, conflict, diff, select, table pattern, or loading/error states. | Inventory completeness. | All drawn (see §6). |

### Minor

| # | Problem | Fix |
|---|---|---|
| m1 | Decorative concentric circles on green cards; icons inside tinted circles on KPI tiles. | Removed. Decoration must carry meaning. |
| m2 | Mixed money formats ("Rp 43,57 jt" on tiles and full figures elsewhere). | Full figures everywhere; `jt` only on chart axes. |
| m3 | Chart axis "0jt"; two-letter weekdays ("Th 1"). | "0", "2 jt"; "Thu 1". |
| m4 | Row actions "Edit" + an unlabeled trash icon on every row. | A ⋯ menu with labelled items; delete behind a destructive confirm. |
| m5 | 10.5–11.5 px labels (tab bar, chart). | 12 px minimum. |
| m6 | Stock gauge bar with an arbitrary 50% marker. | Removed: numbers + status say it. |
| m7 | Category mix uses honey as a category colour. | One accent, with labels and percentages. |
| m8 | The logo mark is cropped to a 44 px circle, and the fine-line character is absent elsewhere. | Ruled lockup ("— BY PORCAFE —" with hairlines), 1.5-stroke outline icons, and one line illustration for empty states. |

### Principles check

- **Hierarchy and calm:** B's Home had four competing anchors (green Today card, honey best-day bar, honey #1 tile, green CTA). Final: the Today card is the only solid element, and Needs attention comes first.
- **Brand fit:** B read as "SaaS template in green" because of the slab sidebar and filled pills. Final: cream canvas, hairlines, an outline icon set and the ruled lockup echo the logo's line work.
- **Typography:** Outfit + Figtree are right (geometric display echoing the wordmark, plus a humanist workhorse), at 500 not 300 in the app. The scale is in `DESIGN_SYSTEM.md` §4.

---

## 3. Decisions

| Question | Decision | Rationale |
|---|---|---|
| **Sidebar** | **Cream with green accents.** | Matches "light" and the logo (green ink on cream); frees solid green for the focal action. Not mocked twice: the critique is decisive. |
| **List density** | **Two modes.** Comfortable (56–64 px) for the close, Home, forms, and everything on touch. Compact (40 px) for desktop data tables. Touch devices force comfortable. | Roomy where hands work; dense where eyes scan. |
| **Phone nav** | **Keep Close centred, but docked, not raised.** A 5-tab docked bar; Close always tinted, solid when active. Sub-sections are scrollable tabs on each page; Setup is an index list. | Same reach, and nothing floats over rows or the totals bar. |
| **Status palette** | **ok · info · warn · danger · neutral**, each with a shape. Solid danger only for Negative. **Honey is retired**, not kept for highlights. | Honey sits next to the warn hue, so a "best day" read as a warning. Highlights use brand vs chart-1 plus a label. |
| **Cards vs lists** | A card = one self-contained section. Rows are hairlines; groups get a header row; a row of figures is one stat-strip card. One inner-panel level for an inline sub-task. Toolbars and banners sit outside cards. | Fixes the density and the card-in-card noise. |
| **Tablet** | **First-class**: 88 px labelled rail, comfortable density, two-column close at 1024. | It is touch-only and is where the close is often typed. |

---

## 4. What changed from `direction-b.html`

- The sidebar became cream; the selected item is a soft green pill. Sub-sections moved from the sidebar to page tabs.
- One solid green per view. Secondary buttons became outlined (they were mint fills, which looked like "OK" chips).
- The palette was rebuilt for AA. Honey, the lake tint and "studio" chips were dropped; five status tones with shapes were added.
- Inputs gained a real border and a focus ring. Payment rows put the label left and the digits right, aligned with the Total.
- Daily close: one column in sheet order with line amounts; one summary card; the recap replaces the actions in place.
- Phone: a docked tab bar plus a sticky totals bar; Setup index; scrollable tabs.
- Tables: compact rows, currency in the header, ⋯ row menus, date/category band rows.
- Revenue totals read as an equation; Orders and Recipes became list + detail (both borrowed from C). Hairline ledger discipline was borrowed from A.
- Charts: brand highlight, dashed "today, open", dotted "no revenue", plus a legend and aria-labels.
- Payment mix figures now equal the Revenue table's column totals (B's didn't add up).
- Decoration removed: background circles, icon discs and the stock gauges.

---

## 5. Remaining risks and open questions for the owner

1. **Is the cream sidebar too quiet for the brand?** It is the biggest visual change from what you chose. If it feels too plain, the fallback is a deep-green logo panel at the top of the sidebar only, not the whole column.
2. **Do closers enter payments before or after items?** The phone close puts payments after the items, matching the sheet. If the terminal totals are usually typed first, the Payments card should move to the top.
3. **Line amounts in the close** (qty × menu price beside each item) help catch typos, but they add figures. Keep them on desktop only, everywhere, or nowhere?
4. **Counter tablet orientation.** The design assumes landscape on a stand (1024+). If it is held in portrait (≈820), the close drops to one column with the summary below it.
5. **Retiring honey** removes the only warm accent. If warmth is missed, it can return in non-status places only (the login page, the empty-state drawing), never in status or charts.

---

## 6. Inventory coverage

Where each part of `CONTENT_INVENTORY.md` lives. "HTML §n" refers to the numbered sections of `canopy-final.html`.

| Inventory | Home in the design |
|---|---|
| §2 Navigation, entry points, sub-sections in the URL | HTML §3 shells; URLs shown in every desktop frame; Setup index (phone) |
| §3.1 Home (attention, month, glance, composition, headline figures, trend, payment mix, top items, category mix) | Desktop Home + phone Home |
| §3.2 Daily close (all data, actions, unsaved, restored, complete review, recap and Undo) | Four desktop frames + tablet + two phone frames; guard, conflict, offline, errors and toasts in Components |
| §3.3 Scan sheet (idle, reading, review, errors, conflict, replace diff) | Two desktop frames + state cards + phone review + Components diff |
| §3.4 History | Desktop frame (legacy editing: HTML §7) |
| §3.5 Reports: Revenue, Items | Desktop frames + phone Revenue |
| §3.5.3 Weekday patterns | HTML §7 assembly list |
| §3.6 Stock summary, Stock, To order, Orders, Usage recap | Four desktop frames + phone Stock; push status pill in the Stock header |
| §3.6.1 Opening stock, Record movement, Record count, Count sheet | HTML §7 + Components (quantity, count panel) |
| §3.7 Menu · §3.9 Recipes | Desktop frames |
| §3.8 Materials · §3.10 Suppliers · §3.11 Import · §3.12 Notifications · §3.13 Data maintenance | HTML §7 assembly list; phone Setup index |
| §4.1 Transient messages · §4.2 Confirmations · §4.3 Guard · §4.4 Concurrency · §4.5 Offline | Components: toasts, banners, dialogs, guard, conflict, offline |
| §4.6 Push | Stock header pill, push chip set, Setup index status |
| §4.7–4.9 Money, quantity, dates, periods | Components + `DESIGN_SYSTEM.md` §7 |
| §4.10 Diffs and history | Components diff; Orders activity; audit trail; recipe versions |
| §4.11 Exports | CSV buttons on History, Revenue, Items |
| §4.13 Status sets | Components → Status chips (every set); `DESIGN_SYSTEM.md` §6 |

**Deliberately not drawn in full** (each is assembled only from drawn patterns and specified in HTML §7):

- **Weekday patterns, Materials, Suppliers, Import, Notifications, Data maintenance:** not on the required screen list; they reuse the stat strip, compact table, segmented control, side-sheet forms and dialogs already shown. Suppliers is the one that needs care, so it gets an in-page segmented control (§7) to avoid six stacked cards.
- **Opening stock, Record movement, Count sheet, Create order form:** dialog and sheet patterns are shown (Scan review, Receive form, quantity components). Drawing each would repeat them.
- **Dark mode:** not needed, per the brief.
- **Recipes unsaved guard:** the inventory notes none exists today. The design shows the unsaved notice and recommends adding the same guard Daily close uses. That is a behaviour change for the build to confirm.
