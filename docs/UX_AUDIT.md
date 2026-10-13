> **Superseded.** This document describes the previous design. The current design is the Canopy redesign: see [docs/redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md). Kept for history.

# Porcafe POS — UX Audit

Date: 2026-10-12
Scope: every route and screen in the app as of commit `7d84a45`: `/` Dashboard, `/sales`, `/items` (Daily close, Performance, Catalog, History, scanner), and `/inventory` (Stock, Usage recap, Import review, Materials, Recipes, Suppliers & ordering, push notifications), plus the shared shell, navigation and PWA.
Method: a code-level walkthrough of every page and component, checking each workflow, state and string against how the café team uses the app. I didn't run usability sessions or measure analytics. Findings marked *verify* depend on runtime behaviour that should be confirmed on a real device.

Companion docs: `docs/DESIGN_DIRECTION.md` (visual direction, Sept 2026) and `docs/INVENTORY_ROLLOUT_PLAN.md`. This audit doesn't repeat the design-system spec. It covers what the product does today, what has improved since the design direction was written, and what still gets in the way.

---

## 0. Calibrating for internal use

The app is for internal use for now. That changes the priorities:

| Matters less right now | Matters more because it's internal |
|---|---|
| Marketing polish, onboarding tours, brand delight | **Speed of the nightly close.** The same 1–3 people repeat it every day, so every extra tap adds up. |
| Explaining concepts to strangers | **Data you can trust.** Owners make purchasing and money decisions from these numbers. A silent overwrite costs more than an ugly screen. |
| SEO, public accessibility audits | **Staff language and devices.** The team is Indonesian, works on phones, often in a hot kitchen, one-handed, on patchy Wi-Fi. |
| Granular permissions UI | **Admin vs. daily separation.** Staff shouldn't see migration buttons, workbook import tools or engineering jargon. |

### Severity scale

- **S1 — Data risk:** can silently lose, overwrite or misreport money or stock. Fix first.
- **S2 — Workflow blocker:** forces a workaround, a second page, or re-entry. Slows the daily close or ordering.
- **S3 — Friction/confusion:** the user gets there, but with doubt, extra scrolling or guesswork.
- **S4 — Polish:** consistency, wording, visual hierarchy.

---

## 1. Executive summary

The app has grown from a sales recap into a café operations tool: daily close, revenue, menu performance, recipes, stock ledger, suppliers, ordering and push alerts. A lot of the Sept 2026 design-direction work has landed: tokens, a Daily close workspace with a sticky action bar, retry states, duplicate-date review, `aria-sort`, a recorded/selisih/reported revenue breakdown, and `lang="id"`.

The biggest remaining problems aren't visual. They're about **where data gets written and whether the person writing it can see what they're about to replace.**

### Top 12 issues

| # | Sev | Issue | Where |
|---|---|---|---|
| 1 | S1 | **Saving revenue for a date that already has an entry silently overwrites it.** The form never pre-loads the existing values. | `/sales` form |
| 2 | S1 | **Changing the date in Daily close throws away unsaved quantities** with no warning. Leaving the page or closing the tab does the same. | `/items` Daily close |
| 3 | S1 | **After a scan, the Daily close screen still shows the old quantities.** Pressing *Save draft* or *Complete day* then overwrites the scanned data. | Scanner → Daily close |
| 4 | S1 | **Changing a material's base unit is a one-click dropdown** that silently changes the meaning of every past stock quantity, recipe line and supplier price. | Inventory → Materials |
| 5 | S1 | **Stock can be received twice:** once via *Stock → Receive stock* and again via *Supplier order → Record receipt*. Nothing links or warns. | Inventory → Stock / Suppliers |
| 6 | S1 | **"Save draft" deducts stock and can fire low-stock pushes.** Staff read "draft" as "not final yet." *(verify intent)* | Daily close → inventory usage |
| 7 | S2 | **Closing one day takes two pages.** Portions go in on `/items` and revenue on `/sales`. "Open revenue" doesn't carry the date over. | Daily close ↔ Sales |
| 8 | S2 | **Scanner failure is a dead end.** After a failed or empty scan the dialog shows "No items detected" with no way to retry or re-upload. Closing the dialog (tap outside, Esc) during the 30–60 s scan throws the result away. | Scanner |
| 9 | S2 | **Scanner review can't be checked against the sheet.** The photo is a 96 px thumbnail, the raw OCR name disappears once a match is picked, and you can't add a row the OCR missed. | Scanner |
| 10 | S2 | **Three different meanings of "low stock".** Stock tab: ≤ 0. Reorder overview: below the alert level. Push: "To Order". The Stock tab calls an item "Available" when it's already below its alert level. | Inventory |
| 11 | S2 | **The Dashboard counts portions from the legacy `itemSales` collection,** while Performance merges daily logs. Portions, best seller and category mix can disagree between pages. | `/` vs `/items` Performance |
| 12 | S3 | **Engineering and project language is shown to staff:** "Inventory foundation", "Phase 3 · Ledger", "Rows 1–75 only", "Opening stock gated", `sourceRef` IDs, "Source revision", "canonical", "legacy rows", migration tools. | Inventory, History |

---

## 2. Cross-cutting findings

### 2.1 Information architecture & navigation

**IA-1 (S2): The top-level nav doesn't match the jobs people do.**
The nav has Dashboard / Sales / Daily close / Inventory. In practice the jobs are:
1. **Close today** (portions + revenue). This is split across *Daily close* and *Sales*.
2. **Check how we're doing** (owner). This is split across *Dashboard*, *Sales → Revenue recap*, and *Daily close → Performance*.
3. **Keep stock and order** (purchasing). This is buried in *Inventory → Suppliers & ordering*, the sixth tab and a nine-section page.
4. **Set up / admin** (menu, recipes, materials, suppliers, imports). This is scattered as tabs next to daily-use screens.

*Recommendation:* reshape around jobs, keeping the existing URLs as redirects:
- **Today / Close** – one screen for portions + payments for a date (see DC-1).
- **Reports** – dashboard, revenue recap, item performance, weekday patterns.
- **Stock & orders** – current stock with status, *To order* list, open orders, receive delivery, stock count. Your own revision note already says "Suppliers/ordering maybe its own top tab". I agree.
- **Setup** – menu catalog, materials, recipes, suppliers & prices, reorder settings, import, push notifications, data migrations.

**IA-2 (S3): Tab state isn't in the URL.** `/items` always opens on *Daily close* (`src/app/items/page.tsx:900`), and the selected date isn't in the URL either. You can't deep-link "Daily close for 10 Oct" from the dashboard's attention card, from a push notification, or from Usage recap. Reloading the page also resets you to today. `/inventory?tab=` works on first load, but tab changes don't update the URL. *Recommendation:* `?view=history&date=2026-10-10` on `/items`, and keep `?tab=` in sync on `/inventory`.

**IA-3 (S3): The page title changes with the tab.** When you're on Performance, Catalog or History, the nav says "Daily close" but the H1 says "Menu items" (`items/page.tsx:1606`). The "New item" button shows on Performance and History, where it isn't relevant.

**IA-4 (S3): Admin-only and one-time tools live next to daily screens.** Examples: legacy migration preview/apply in *History* (`items/page.tsx:1695-1730`), workbook *Import review* as a permanent inventory tab, *Opening stock* initialization, and *Recalculate day*. Hide them behind a Setup/Admin area, or behind a "Show admin tools" toggle until roles exist.

### 2.2 Data trust & "what am I about to change?"

**DT-1 (S1): Show what's already saved before an upsert writes over it.** This pattern repeats across the app:
- Sales form (`sales/page.tsx:458-483`): `upsertSalesEntry` writes to the existing doc for that date (`lib/data.ts:120-121`). The form starts blank, so it looks like a new entry. A cashier who backfills "yesterday" replaces yesterday's figures.
- Scanner revenue step (`items/page.tsx:691-711`) overwrites cash/BCA/soundbox. The only warning is a small line: "A Sales entry already exists for this date — saving will update it", with no old-vs-new values.
- Scanner item step overwrites an existing **manual daily log** for that date. It only warns about *legacy* rows (`items/page.tsx:786-790`), not about a completed manual close.

*Recommendation:* when a date is picked, load the existing record into the form and label it "Editing existing entry for Sat 11 Oct (saved 22:14)". For scanner overwrites, show a two-column *Current → New* diff and require one explicit confirmation.

**DT-2 (S1): Unsaved-change protection.** Nothing in the app uses `beforeunload`, and there are no route-change guards. The risky places:
- Daily close quantities, when you change the date (arrows, date picker, *Today*), switch tab, or navigate away (`items/page.tsx:989-1034`, `1135-1140`).
- The opening stock table (dozens of inputs).
- Reorder settings rows (each row has its own *Save*, and nothing marks a row as edited-but-unsaved; `suppliers.tsx:286-351`).
- The recipe editor (approvals are local until *Save recipe*. The toast even says "Save recipe to keep this change").

*Recommendation:* a shared `useUnsavedChangesGuard`, plus a confirm dialog on date/tab changes: "You have 7 unsaved quantities for Sat 11 Oct. Save draft / Discard / Stay."

**DT-3 (S1): Two sources of truth for the same fact.**
- Receiving stock: the *Receive stock* movement vs a supplier-order receipt (top-12 #5). *Recommendation:* when a material has an open order, the *Receive stock* form should say "Kecap has an open order PO-123 for 5 L. Receive against that order instead?"
- Preferred supplier: the `supplierItem.preferred` checkbox (`suppliers.tsx:781`) and `material.preferredSupplierId` in Reorder settings (`suppliers.tsx:346`) are separate fields, so they can disagree. Pick one.
- Item quantities: `dailyItemLogs` vs legacy `itemSales`. The Dashboard reads legacy only (`page.tsx:145-175`). Performance merges both. History shows a mix of read-only and editable rows.

**DT-4 (S2): Auto-saving on blur in money tables.** The sales history, catalog and legacy history rows save the moment focus leaves a cell (`sales/page.tsx:159`, `items/page.tsx:283`, `430`). Changing the item or date in a legacy row saves immediately on select (`items/page.tsx:428-445`). Problems: no undo, a mis-tap on mobile becomes a write, and editing the *date* of a revenue row moves money to another day. *Recommendation:* make the date read-only inline (edit it via a dialog), and show a 5-second "Saved · Undo" toast for inline edits.

**DT-5 (S2): Destructive actions with no confirmation.** Removing a supplier–material link (`suppliers.tsx:758`, a red "Remove" button with no confirm), archiving a material, supplier or menu item, and the material base-unit change (#4). Deletes in Sales and History use `window.confirm`. That's acceptable internally, but it isn't styled and doesn't say what will change.

### 2.3 System states (loading, empty, error, stale)

Retry states exist on the main pages now. Remaining gaps:

- **ST-1 (S2): Empty states flash before data loads.** On the Dashboard, *Needs attention* shows "Today: Not started · 0 drafts" while loading or after a load error (`page.tsx:243-258`). *Payment mix* and *Top items* show "No sales logged yet" during the load (`page.tsx:423`, `479`). An owner opening the app on a slow connection sees "nothing recorded" before the real numbers arrive. Every section should share one loading state.
- **ST-2 (S2): The Dashboard runs four full-collection reads before it shows anything.** It reads all sales, item sales, adjustments and daily logs (`page.tsx:64`). The Items page reads all menu items, all item sales and all daily logs on every `refresh()`, and that runs after **every inline cell edit** (`onSaved={refresh}`). This matches the revision note "Loading agak lama". *Recommendation (UX side):* show cached data instantly with an "Updated 2 min ago" label (Inventory already does this for stock), refresh in the background, and update only the edited row after inline saves.
- **ST-3 (S3): Daily-close saves wait on the inventory calculation.** `saveDailyLog` awaits `calculateSavedDailyUsage` before showing "Day completed" (`items/page.tsx:1181-1182`). Show the save confirmation first, then "Updating stock…" as a second, non-blocking status.
- **ST-4 (S3): "Saved just now" never goes away.** On `/sales` (`sales/page.tsx:474`, `635`) it's still there an hour later, and still there after the date is changed to another day. Use relative time ("Saved 3 min ago · Sat 11 Oct") or clear it when the form changes.
- **ST-5 (S3): Scanner progress.** For 30–60 s the only feedback is a line of text. Show elapsed time, keep the dialog open (block outside-click and Esc while scanning), and allow *Cancel*.

### 2.4 Language, terminology & copy

- **LC-1 (S3): Mixed English UI with Indonesian domain words and an Indonesian team.** `lang="id"` is set, but every string is English. Domain terms are mixed in: *selisih*, *Nobu*, *Soundbox*, *ticker sheet*. Since this is internal, decide deliberately: either an Indonesian UI (most natural for floor staff), or English with a glossary tooltip for the domain terms. Whichever you pick, use it consistently.
- **LC-2 (S3): One concept has several names.**
  - Payment method: "Soundbox" (Sales, Daily close) vs "Nobu (→ Soundbox)" (scanner) vs "Nobu" (scanner instructions).
  - Paper sheet: "ticker sheet", "ticket", "sheet", "handwritten sheet".
  - Low stock: "Low stock", "Low / negative", "To Order", "Below alert", "Stock Still High", "Available".
  - Revenue screen: "Sales" (nav), "Revenue workspace" (H1), "Open revenue" (button), "Sales recap" (toast).
  - Portion counts: "Portions", "Main portions", "Items sold", "Qty", "Total portions", "Recorded portions".
  Write one glossary and stick to it.
- **LC-3 (S3): Engineering jargon visible to staff.** Inventory header: "Inventory foundation & usage", "Phase 3 · Ledger", "Source preview · Rows 1–75 only", "Opening stock gated" (`inventory/page.tsx:316-328`). Also: material IDs in monospace (`materials.tsx:120`), `sourceRef` columns (`stock-dashboard.tsx:567`, `suppliers.tsx:798`), "Source revision 1760…", "Saved as draft" (a raw enum), "canonical", "legacy", "foundation", "hosted scheduler can call the protected inventory schedule endpoint" (`supplier-schedules.tsx`), "Usage events". Replace them with plain café language, or move them into an expandable "Technical details" section.
- **LC-4 (S4): Over-explaining banners.** Several screens open with an info card explaining internal policy ("Legacy item sales are never read or backfilled", "Do not convert mass and volume without an approved rule"). The daily team doesn't need these. Keep one short helper line and move the rest to Setup.

### 2.5 Forms & number entry

- **FE-1 (S2): Rupiah amounts are typed as raw digits.** `type="number"` with no thousands grouping (`sales/page.tsx:282-290`). Typing `1500000` vs `150000` is an easy, invisible mistake. *Recommendation:* show live formatting under the field ("Rp 1.500.000") or format the field itself, and accept shorthand like `1,5jt` / `1500k` if you want speed. The scanner total is shown as a **raw unformatted number** (`items/page.tsx:870`).
- **FE-2 (S3): Number inputs change value on scroll.** Desktop number fields change when you scroll the wheel over them. That's risky in the long sales and stock tables. Either blur on wheel or use `type="text" inputMode="decimal"` with validation.
- **FE-3 (S3): Negative values and sanity checks.** Revenue fields have `min="0"` but nothing enforces it. Nothing flags outliers either, such as a day's revenue 5× the 30-day average, or a quantity of 500 for one item. A soft "This is much higher than usual. Correct?" check catches typos without blocking.
- **FE-4 (S3): Units aren't shown next to stock quantities.** *Record movement* has a bare "Quantity" label with no unit (`stock-dashboard.tsx:478`), and so does *Record stock count*. Staff can't tell whether "Telur" is counted in pieces or grams. Supplier orders get this right ("Quantity (kg)", `supplier-orders.tsx:350`). Copy that pattern.
- **FE-5 (S3): Labels without `htmlFor`.** In Stock *Record movement*, *Record stock count* and the Recipe editor, `<Label>` isn't associated with its input. On a phone, tapping the label doesn't focus the field, and screen readers announce unlabeled fields.
- **FE-6 (S3): The date picker jumps back to today when cleared.** `onChange={(e) => setDate(e.target.value || todayISO())}` (`sales/page.tsx:641`, `items/page.tsx:1768`). While you're editing a date manually, it snaps back.
- **FE-7 (S3): After saving, the Sales form resets the date to today** (`sales/page.tsx:486`). Backfilling several past days means re-picking the date each time. Keep the date and offer "Next day →".
- **FE-8 (S4): Add menu item has no error handling or saving state.** `addMenuItem` has no try/catch (`items/page.tsx:1036-1053`). Double-clicking creates duplicates, nothing checks for an existing item with the same name, and Enter doesn't submit.

### 2.6 Mobile & touch

The mobile shell is decent: bottom nav, safe-area padding, a sticky close bar above the bottom nav, 44 px steppers. Remaining issues:
- **MB-1 (S2): Wide tables scroll sideways on phones,** with no sticky first column: sales history (58 rem), catalog, history, reorder overview (8 columns), supplier pricing, audit trails. On a phone you lose the material/date name as soon as you scroll. *Recommendation:* card or list layout below `sm` for the daily-use tables (Reorder overview, Current stock, open orders). Keep wide tables for desktop admin.
- **MB-2 (S3): Inline-edit inputs are 32 px tall** (`h-8`) with transparent borders. That's below the 44 px touch target, and nothing shows that a cell is editable on touch, where there's no hover.
- **MB-3 (S3): The Inventory tab bar is a 2×3 grid of six buttons on mobile.** That's a lot of chrome before any content. The Daily close tab list is a 4-column grid that squeezes "Performance".
- **MB-4 (S3): On mobile the Day summary sits below the whole item list,** so the revenue and payment split are a long scroll away. Consider a collapsible summary strip at the top, or putting totals in the sticky bar ("Main 42 · Add-on 18 · Rp 3.240.000").
- **MB-5 (S3, verify): Large phone photos may hit the API body limit.** Phone photos are sent as raw base64 without compression (`items/page.tsx:497-508`, `552`). Vercel caps function request bodies at 4.5 MB, and a 12 MP photo plus ~33 % base64 overhead can exceed that. The user then sees a generic "Scan failed". Downscale client-side (e.g. long edge 2000 px, JPEG 0.8) before upload.

### 2.7 Accessibility (internal-tool level)

Done well: `aria-sort`, named icon buttons, focus rings, a live region on save status, `role="status"` on the offline banner.
Remaining:
- **A11Y-1 (S3): Colour-only meaning in charts.** Payment mix and category mix use small dots with no pattern. Acceptable, but the stacked bar has no text alternative beyond the list. The list is there, which is fine.
- **A11Y-2 (S3): Too little contrast on the Sales recap line.** It's drawn in `var(--warm-accent)` `#e9e2d0` on a near-white card (`sales/page.tsx:764`), roughly 1.2:1, so the line is close to invisible. Use `--primary-brand`.
- **A11Y-3 (S4): Low-contrast secondary text.** `text-primary/45` in the inactive bottom nav and `text-primary/50` and `/60` in recap stats fall below 4.5:1 on cream.
- **A11Y-4 (S4): The alert toggle in Reorder settings is an unlabeled bell icon next to a checkbox** (`suppliers.tsx:347`). It has an sr-only label, but sighted users don't know what the checkbox does.

### 2.8 Visual hierarchy & consistency

- **VH-1 (S3): Primary actions are inverted.** In the Daily close header, *Open revenue* is the filled primary button and *Scan sheet* is a small outline button (`items/page.tsx:1616-1623`). Scanning is the main way into the close, so it should be the primary action.
- **VH-2 (S3): The same number appears several times on one screen.** The Dashboard shows "Reported month total" three times (*At a glance*, *Revenue composition*, the stat card) and "Portions sold" twice. Daily close shows the status badge twice and Main portions twice (the big number and the split card).
- **VH-3 (S4): Card stacking.** Most sections are a white card inside a cream page, and many contain more bordered tiles. Stat tiles use four different styles across pages (`RecapStat`, `StatCard`, `RevenueBreakdownStat`, `SourceAuditStat`, inventory `Card size="sm"`). Consolidate into one `Stat` component.
- **VH-4 (S4): Heading sizes vary.** The Inventory H1 is `text-3xl font-semibold`. The other pages use `text-2xl sm:text-[28px] font-bold`.

---

## 3. Page-by-page findings

### 3.1 Dashboard (`/`, `src/app/page.tsx`)

What works: a *Needs attention* card first, a month selector, the recorded / selisih / reported breakdown, and a trend takeaway sentence.

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| D-1 | S2 | Portions, Top items, Category mix and "Avg per portion" read **legacy `itemSales` only** (`page.tsx:145-175`). New daily-log closes aren't counted, so they disagree with Performance. | Use the same merged source as Performance (ideally one shared selector in `lib/`). |
| D-2 | S2 | *Needs attention* lists counts but isn't actionable. "2 drafts" and "3 revenue days without item close" don't say *which* days. Revenue-but-no-portions is checked, but **portions-but-no-revenue isn't**. Low stock / *To order* doesn't appear on the dashboard at all. | Turn it into a list of dated rows, each linking to `/items?date=…` or `/sales?date=…`, and add "3 materials to order →". |
| D-3 | S2 | Shows a "Today: Not started" state while loading or after an error (ST-1). | Show a skeleton until loaded; on error, hide the numbers. |
| D-4 | S3 | **Unfair comparisons.** Month delta compares month-to-date with the **full** previous month (`page.tsx:341-342`). "Today vs yesterday" compares a partial day with a full day. The value shown includes selisih but the delta excludes it. | Compare like with like: MTD vs the same number of days last month. Label it ("vs 1–12 Sep"). |
| D-5 | S3 | The sales trend is the "last 30 entries", **not** the selected month or 30 calendar days. Missing days vanish instead of showing as gaps (`page.tsx:121-124`, `361`). The month selector doesn't affect it. | Plot calendar days of the selected month, with missing days visible as gaps. |
| D-6 | S3 | "Avg per portion" = revenue ÷ all portions, including add-ons. That isn't a meaningful price metric. | Use revenue ÷ Main portions, labelled "Avg revenue per Main portion", or drop it. |
| D-7 | S3 | "Days logged" counts sales entries, so duplicates inflate it. "All-time reported total" isn't actionable for daily use. | Count distinct dates; move all-time totals to Reports. |
| D-8 | S4 | The trend takeaway ("latest day is at or above previous entry") is trivially true or false. | Use a more useful sentence, e.g. "Avg Rp X/day this month, Y % vs last month; best weekday: Saturday." |
| D-9 | S4 | Stat-card icon colours (amber for month total, blue for average) carry no meaning. The week label "Monday, 6 Oct – Sunday, 12 Oct" wraps in a small card. | Use neutral icons and a short range ("6–12 Oct"). |

### 3.2 Sales / Revenue (`/sales`, `src/app/sales/page.tsx`)

What works: a clear money-input group with an Rp prefix, a live total, duplicate-date detection with a resolve dialog, `aria-sort`, retry states, and an explanation of selisih.

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| S-1 | S1 | Blank form + upsert-by-date means a silent overwrite (DT-1). | Pre-load existing values for the chosen date and change the button to "Update entry". |
| S-2 | S2 | Revenue lives on a separate page from Daily close (DC-1). | Embed the payment inputs in Daily close; keep `/sales` as the revenue *report*. |
| S-3 | S2 | **The Revenue recap summary is driven by a filter far below it.** The Recorded / Selisih / Reported tiles in *Revenue recap* (`718-722`) use the **All entries** month filter at line 839. With "All months" they show all-time totals, which isn't obvious. The *By day/week/month* tabs don't affect them. | Give the recap its own period selector at the top, and label tiles with their range ("Oct 2026"). |
| S-4 | S2 | **The selisih editor is hidden** until you pick a month in the *All entries* filter (`853`). Its sign isn't explained: is a positive value bank > recorded? | Add a "Monthly reconciliation" section with a month picker, sign guidance ("+ if bank received more than recorded"), and the last updated date. |
| S-5 | S3 | The recap chart line is nearly invisible (A11Y-2) and silently shows only the last 20 periods. | Fix the colour and say "Last 20 days". |
| S-6 | S3 | Mean / **Std dev** / Min / Max. Standard deviation means nothing to café staff, and the partial current month drags down mean and min. | Use "Average · Lowest · Highest", and exclude or flag the in-progress period. |
| S-7 | S3 | CSV export only exports grouped totals, with no payment-method columns or notes. The accountant probably wants the raw daily rows. | Offer "Export daily rows (with payment split)" and say the range in the button. |
| S-8 | S3 | Inline-editable history with blur-save and date editing (DT-4). The table is 58 rem wide on mobile (MB-1). | Make rows read-only with an Edit action that opens the same form as above. |
| S-9 | S3 | The page mixes entry and analysis: form → duplicates → recap → weekday → history. People who come to *enter* and people who come to *analyse* both scroll through the other half. | Entry at the top for "today". Move recap and weekday analysis to Reports. |
| S-10 | S4 | Sort header buttons are centre-aligned while values are right-aligned. The date column shows the ISO date input *and* a formatted 11 px date under it. | Align headers with their data; show one date format. |

### 3.3 Daily close (`/items` → Daily close)

What works: date stepper plus *Today*, a sticky action bar (No sales / Save draft / Complete day), status badges, steppers with 44 px targets, missing-price hints, a day summary with payment split, source and last-saved time, and a timeout plus retry on load.

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| DC-1 | S2 | **The close is split across two pages.** You enter portions here, then "Open revenue" goes to `/sales` without the date (`1618-1622`, `1941-1945`). The summary shows revenue read-only. | Add an editable *Payments* section (Cash / BCA / Soundbox / Other) inside Daily close for the same date. *Complete day* then saves both. At minimum, link to `/sales?date=YYYY-MM-DD`. |
| DC-2 | S1 | Unsaved quantities are lost when the date, tab or page changes (DT-2). | Add a guard and auto-save the draft locally per date. |
| DC-3 | S1 | Scanning while on Daily close doesn't reload the day (`onDone={refresh}` reloads lists but not `dailyLog`/`dailyQuantities`, `946-961` vs `989-1034`). Stale values remain, and the next Save overwrites the scan. | After a scan, set `date = scanDate` and bump `dailyRetryKey`. |
| DC-4 | S2 | **No completeness checks on *Complete day*.** You can complete a day with 0 portions, with no revenue logged, or with portions × price far from the revenue. | Before completing, show a summary: "42 Main · 18 Add-on · Revenue Rp 3,24 jt · No revenue logged ⚠ / Revenue differs from menu-price estimate by 12 % ⚠". Allow continuing anyway. |
| DC-5 | S3 | Nothing stops you from closing a future date, and nothing shows "Tomorrow". | Warn on future dates. |
| DC-6 | S3 | **Item order doesn't follow the paper sheet.** The list is grouped by category in Firestore order, with no search or "only items with qty" filter. Transcribing from paper means hunting for each item. | Add a sort-order field in Catalog that matches the handwritten sheet, plus a quick filter box. |
| DC-7 | S3 | Decimal quantities are allowed (the regex accepts `.`), but portions are whole numbers. | Integers only, unless a category needs decimals. |
| DC-8 | S3 | *No sales* clears quantities after a `window.confirm`. *Complete day* on a day that's already complete gives no "you are editing a completed day" note. | Show "Editing a completed day — last saved 22:14 by scan" when the status is Complete and there are changes. |
| DC-9 | S4 | Status badge and Main portions both appear twice (VH-2). "Close status" in the summary repeats the header badge. | Remove the duplicates. |

### 3.4 Scanner (`TicketScanDialog`, `items/page.tsx:510-892`)

What works: two review steps, unmatched rows blocked from saving, replacement warning for legacy rows, editable date, and the scan date normalized before saving.

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| SC-1 | S2 | **Failure is a dead end.** On error, `previewUrl` stays set and `draftItems` is empty, so the screen shows "No items detected" and a Save button that toasts "Nothing to save". There's no re-upload. | Add an error state with "Try again" and "Choose another photo"; keep the image. |
| SC-2 | S2 | Tapping outside or pressing Esc mid-scan closes the dialog and discards a 30–60 s result. | Block dismissal while scanning or with unsaved results, or confirm "Discard scan?". |
| SC-3 | S2 | **You can't verify the scan against the sheet.** The 96 px thumbnail can't be zoomed. Once a match is picked, the raw OCR text (`rawName`) is no longer visible. You can't add a row the OCR missed. | Tap the photo to view it full-screen with pinch zoom. Show "Sheet: *spg telur* → Crispy Pork Belly & egg" on every row. Add "+ Add item". |
| SC-4 | S1 | Overwrites an existing **manual** daily log for the date without saying so (DT-1). Changing the date after OCR doesn't re-check for an existing log or entries for the new date. | Re-check on date change and show a current → new diff. |
| SC-5 | S2 | **The item step commits as `complete` (and deducts stock) before revenue is reviewed.** If the user closes the dialog at step 2, the day is "Complete" with no revenue, and nothing points to that. | Save both steps on a final "Confirm", or save step 1 as draft and complete at step 2. |
| SC-6 | S3 | Revenue step: the total is unformatted (`870`). There's no comparison with the sheet's own written total, and no BCA-vs-price calculation hint. "Other" is carried over silently. | Format as Rp and show "Sheet total vs entered total" with the difference. Show Other explicitly. |
| SC-7 | S3 | The trigger sits in the page header on every tab. After a successful scan you stay on whatever tab and date you were on. | After saving, go to Daily close for the scanned date. |
| SC-8 | S4 | The copy says "Claude will read…" and "ticker sheet". | Use staff language: "We'll read the tally sheet. Check every row before saving." |

### 3.5 Performance (`/items` → Performance)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| P-1 | S2 | **Every card has its own time range.** KPI tiles are all-time, Item detail is month-to-date, the Main navigator uses its own cursor, Top sellers is all-time, Recap is all periods (chart: last 20), and Weekday has a from–to range. There's no single "what period am I looking at". | One period selector at the top that drives every card, with per-card overrides only where needed. |
| P-2 | S3 | "Average Main portions per day" divides by *all logged days*, including no-sales and legacy-only days (`1288-1299`), which pulls the average down. | Spell out the denominator ("per selling day"), or offer both. |
| P-3 | S3 | The weekday analysis and "Top Main item by weekday" appear here *and* on Sales, as two separate analysis widgets. | Combine them in Reports. |
| P-4 | S4 | The Recap item filter is 140 px wide and truncates names. Top sellers' Y-axis is 110 px wide and truncates long menu names. | Widen both, or wrap labels. |

### 3.6 Catalog (`/items` → Catalog)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| CT-1 | S2 | Price edits save on blur, with no history. Prices drive scanner BCA calculations and future costing. | Keep a price-effective date (like supplier cost history) or at least a confirmation. |
| CT-2 | S3 | Category is limited to Main / Add On. An existing item with another category shows a blank select. | Show its current value, or migrate the data. |
| CT-3 | S3 | There's no sort-order or "sheet name" (alias) field. The memory file maps sheet shorthand to names; that mapping isn't editable in the UI. | Add "Sheet label / aliases" and "Sheet order" columns. These help the scanner and DC-6. |
| CT-4 | S4 | New item: no duplicate-name check, no error handling (FE-8). | — |

### 3.7 History (`/items` → History)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| H-1 | S2 | Mixes read-only daily-close rows and **editable legacy rows** in one table. Changing a legacy row's date or item saves instantly. Users can't tell why some rows are editable. | Make History read-only. Each row opens Daily close for that date. Retire legacy editing after migration. |
| H-2 | S3 | Two overlapping date filters: All/Day/Week/Month tabs with a cursor, *and* From/To fields. They can contradict each other. | Use one date-range control with presets. |
| H-3 | S3 | The migration tools and the "source check" card show up for everyone (IA-4). | Move them to Setup → Data maintenance. |
| H-4 | S4 | The "Source / action" column header is vague. | Use "Source" with "Daily close" or "Legacy". |

### 3.8 Inventory shell (`/inventory`)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| I-1 | S3 | Project-phase header and stat cards ("Phase 3 · Ledger", "Rows 1–75 only", "Opening stock gated") (LC-3). | Replace them with operational KPIs: *To order 3 · On the way 2 · Negative stock 1 · Last count 5 Oct*. |
| I-2 | S3 | The *Push notifications* card sits above the tabs on every visit, with iOS instructions shown on every device. | Move it to Setup, or collapse it to a small "🔔 Alerts on this device: Off · Turn on" chip. Show the iOS hint only on iOS when not installed. |
| I-3 | S3 | Six tabs mix daily (Stock, Suppliers & ordering), periodic (Usage recap) and one-off setup (Import review, Materials, Recipes). | See IA-1. Daily: *Stock*, *Orders*. Periodic: *Usage*. Setup: the rest. |
| I-4 | S3 | Opening Inventory runs due supplier-delivery schedules as a side effect (`inventory/page.tsx:252`). Stock can change because someone opened a page. | Fine as a safety net, but show "2 scheduled deliveries were added today" so the change is visible. |

### 3.9 Stock (`stock-dashboard.tsx`)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| ST-A | S2 | "Low stock" here means ≤ 0 (`157`, `439`). Items under their reorder alert level are shown as **"Available"**. This contradicts the Reorder overview and push alerts (top-12 #10). | Use one status model everywhere: *OK / Reorder soon / To order / Out / Negative*, driven by `getInventoryReorderStatus`. |
| ST-B | S2 | The Current stock table has no search, sort, alert-level column, "on order" column, or action. | Add columns *Alert at*, *On order*, *Status*, plus a row action "Order" or "Count". Default sort: most urgent first. |
| ST-C | S2 | **Stock count hides the expected quantity.** The user enters the observed count without seeing the system balance, so variances go unnoticed until later. | Show "System: 4,2 kg → Counted: 3,5 kg → Difference −0,7 kg (−17 %)" before saving. Add a multi-item count sheet for weekly counts instead of one material at a time. |
| ST-D | S3 | Record movement: no unit shown (FE-4). "Manual adjustment" vs "Correction" aren't explained. *Receive stock* pre-fills the reorder quantity, which is easy to save unchanged by accident. | Show the unit. Merge or explain the two types. Highlight the pre-filled value ("Pre-filled from order quantity"). |
| ST-E | S3 | The audit trail isn't paginated and shows raw `sourceRef` IDs. | Paginate or show the last 50 by default. Turn refs into links ("Daily close 11 Oct", "Order PO-123"). |
| ST-F | S3 | Opening stock is all-or-nothing: every active material must be filled in one go, and nothing is kept if you navigate away. | Allow saving progress, or initialize per material. |

### 3.10 Usage recap (`usage-recap.tsx`)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| U-1 | S2 | Exclusions are per day. If a recipe isn't ready, someone has to exclude that item on every day it sold. | Add "Exclude {item} for all days until its recipe is active", or a bulk exclude across the selected range. |
| U-2 | S3 | Jargon: "Usage events", "Usage lines", "Source revision", "Saved as draft", issue `sourceRef`s. | Use "Days calculated", "Ingredients used", "Saved 11 Oct 22:14 (draft)". |
| U-3 | S3 | "Needs review" uses the red destructive badge. It's a to-do, not an error. | Use the amber warning style. |
| U-4 | S3 | The *Calculation detail* card renders below *Material totals*, so selecting a day changes content far down the page. | Expand the details inline under the selected row, or scroll to them. |

### 3.11 Import review, Materials, Recipes (setup screens)

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| M-1 | S1 | Base-unit change is a one-click dropdown in the table (`materials.tsx:122`) (top-12 #4). | Lock it once a material has movements or recipe lines; otherwise require a confirm that explains the impact. |
| M-2 | S3 | Material IDs are shown in mono under every name. There's no search, no filter and no reorder fields (these live in Suppliers). | Hide IDs. Add search. Link to the material's reorder settings and stock. |
| R-1 | S2 | Line approval is local until *Save recipe*, and leaving the page discards it (DT-2). Each line has to be approved by a separate click. | Add "Approve all valid lines" and an unsaved guard. |
| R-2 | S3 | Recipe versions are one flat list with no grouping by menu item and no search. With retired and draft versions it grows quickly. | Group by target, collapse old versions, and add a "Menu items without an active recipe" list. That list is the real to-do that blocks usage calculation. |
| R-3 | S3 | Status, effective date, basis and yield are all on screen at once, which is a lot for a cook entering a recipe. | Use progressive disclosure: target → lines → activate (with a date). |
| IM-1 | S3 | Import review is a one-time, workbook-specific tool, but it's a permanent tab. | Move it to Setup and mark it done once imported. |

### 3.12 Suppliers & ordering (`suppliers.tsx`, `supplier-orders.tsx`, `supplier-schedules.tsx`)

What works: a Reorder overview with status filters and counts, *Create order* prefilled from a to-order row, partial receipts, cost history, and confirmation before cancelling an order.

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| SU-1 | S2 | **One page holds nine sections:** KPIs, Reorder overview, Orders, Create order, Reorder settings, Schedules, Supplier master, Add supplier, Pricing, Link form, Movement audit. Purchasing staff scroll past master data to get to the order form. | Split it into *To order* (overview + create order), *Orders* (open, receive, history), and *Setup* (suppliers, pricing, reorder settings, schedules). |
| SU-2 | S2 | **No way to send the order.** After *Create order* there's no WhatsApp, copy or print output, and Indonesian suppliers are mostly ordered by WhatsApp. | Add "Copy order text" or a `wa.me/{phone}?text=` link: "Halo Pak X, order Porcafe 12 Okt: Telur 5 tray, Kailan 2 kg…". Make phone numbers tap-to-call or tap-to-WhatsApp. |
| SU-3 | S2 | **Reorder settings save per row** (a *Save* button on each of N rows). Setting up 40 materials takes 40 saves, and a row that was edited but not saved gives no sign of it. The Preferred supplier dropdown is empty unless pricing links exist, and doesn't say why. | Edit the whole table and save once, or auto-save per field with status. Empty dropdown: "Link a supplier price first →". |
| SU-4 | S2 | Recurring delivery schedules add stock automatically whether or not the delivery arrived. | Show "Scheduled delivery added today — Confirm / Adjust / Didn't arrive" in Stock or on the Dashboard. |
| SU-5 | S3 | Removing a supplier link has no confirmation (DT-5). Currency is a free-text field. | Confirm with the impact ("Kecap will have no supplier"). Make currency a select, or hide it if everything is IDR. |
| SU-6 | S3 | The "In-app alerts: Enabled per material" KPI says nothing useful. The "Supplier foundation" info card sits halfway down the page. | Remove both, or replace with "N materials have no alert level". |
| SU-7 | S3 | Reorder overview: the gap is coloured but the threshold isn't explained. "Ordered / On the Way" and "Stock Still High" use Title Case while the rest of the app uses sentence case. | Use consistent sentence case. Add a tooltip: "Alert at = when you want to reorder". |

### 3.13 Shell, nav & PWA

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| N-1 | S3 | Only the mobile nav sets `aria-current`; desktop nav links don't. Nav matching is exact, so `/inventory?tab=…` still works, but future nested routes won't highlight. | Add `aria-current` on desktop and match on prefix. |
| N-2 | S3 | Offline banner: "changes require a connection and are not queued". Honest, but every save button stays enabled offline. Firestore may queue writes in memory and then lose them on reload. *(verify the Firestore persistence setting)* | Disable save actions when offline, or show "Will save when back online" only if persistence is truly enabled. |
| N-3 | S4 | There's no link from the logo/header to the user's real home (Daily close for floor staff). The PWA `start_url` is `/` (Dashboard). | Consider `start_url: /items` for staff devices, or a "Today" shortcut in the manifest `shortcuts`. |
| N-4 | S4 | The README is still the create-next-app default. | Add a one-page "How we use this app" guide for new staff: close steps, the scanner, receiving stock. |

---

## 4. Workflow walkthroughs

### 4.1 Nightly close today (happy path, mobile)

1. Open the app. It lands on **Dashboard**, but staff need **Daily close**: +1 tap.
2. Daily close → *Scan sheet* (a small outline button) → choose a photo → wait 30–60 s, unable to leave.
3. Review rows against a 96 px thumbnail. You can't zoom or see raw text.
4. *Save item sales & continue*. The day is now **Complete** and stock deducted.
5. Review revenue → *Confirm*.
6. The dialog closes and you're back on the date you were on before (maybe not the scanned date), with stale quantities.
7. To double-check revenue: *Open revenue* → `/sales` → re-pick the date → **the form is blank** even though revenue exists.

**Target flow:** open app → *Today* (Daily close for today, Scan as the primary action) → scan → one review screen (items + payments + differences, zoomable photo) → *Complete day* → a recap card showing what was saved and the stock impact. 4 taps + review.

### 4.2 Manual close / backfill a missed day

Pain: the date resets to today after each save on `/sales`; Daily close loses quantities if you tap ‹ before saving; revenue for the same date is on another page. **Target:** a single close screen with a date stepper, both sections, an unsaved guard, and "Save & next day".

### 4.3 Morning ordering

Pain: push "X is To Order" → opens `/` (*verify the notification click URL*) → Inventory → Suppliers tab → scroll to Reorder overview → *Create order* → scroll to the form → save → **then text the supplier separately**. **Target:** the push opens `/inventory?tab=orders#to-order` → select items → *Create order* → *Send via WhatsApp*.

### 4.4 Delivery arrives

Pain: two possible paths (*Stock → Receive stock* or *Order → Record receipt*), with nothing to steer people to the right one. **Target:** *Receive delivery* lists open orders first, then "Unplanned delivery" as a fallback.

---

## 5. Prioritized roadmap

### Now (S1 safety, mostly small changes)
1. Pre-load existing revenue when a date is picked on `/sales`, and change the button to "Update" (S-1).
2. Add an unsaved-changes guard on Daily close date/tab/route changes and on page unload (DC-2).
3. After a scan, reload the scanned date in Daily close (DC-3).
4. Lock or confirm base-unit changes on materials with history (M-1).
5. Warn on *Receive stock* when the material has an open supplier order (DT-3).
6. Confirm whether drafts should deduct stock. If not, compute usage only on `complete` (top-12 #6).
7. Make scanner failures retryable, and block dismissal while scanning (SC-1, SC-2).
8. Fix the invisible Sales chart line colour (A11Y-2).

### Next (daily-close & ordering speed)
9. Put revenue (payments) inside Daily close; `/sales?date=` deep links (DC-1, IA-2).
10. Scanner: zoomable photo, raw-name display, add-row, single final confirm with a current→new diff (SC-3–SC-5).
11. Make the Dashboard attention card a dated, linked to-do list including stock to order (D-2), and fix the data source (D-1).
12. One stock-status model across Stock, Reorder and push; urgent-first current stock table (ST-A, ST-B).
13. Show the expected balance and difference in stock counts; add a multi-item count sheet (ST-C).
14. Order → WhatsApp/copy text; split the Suppliers page into To order / Orders / Setup (SU-1, SU-2).
15. Rupiah formatting and outlier checks on money inputs (FE-1, FE-3).

### Later (structure & polish)
16. Job-based IA: Today / Reports / Stock & orders / Setup (IA-1). Move migration, import and push settings into Setup.
17. One period selector on Performance and Revenue reports (P-1, S-3).
18. Glossary and language decision (ID vs EN); remove engineering jargon (LC-1–LC-3).
19. Mobile list layouts for daily-use tables (MB-1); a single shared `Stat` component (VH-3).
20. Catalog sheet order and aliases to help both manual entry and the scanner (DC-6, CT-3).

---

## 6. Progress vs. `DESIGN_DIRECTION.md`

| Design-direction item | Status |
|---|---|
| Rename Today → "Daily close" in nav and page | Done |
| Sticky close actions (No sales / Save draft / Complete day) | Done |
| Loading / error / retry states on main panels | Mostly done; empty-state flashes remain (ST-1) |
| Sales duplicate-by-date | Detection and resolve dialog done; silent overwrite in the form remains (S-1) |
| Rescan stale legacy rows | Done (replacement with confirm) |
| Separate recorded / selisih / reported totals | Done on Dashboard and Sales |
| `aria-sort`, `lang`, safe-area, tokens | Done |
| Scanner as Capture → Review items → Review revenue → Confirm | Partly done: two steps, but step 1 commits before review finishes (SC-5) |
| Canonical item source | Partly done: Performance/History use daily logs; Dashboard still reads legacy (D-1) |
| Confirmation/undo for risky edits | Deletes confirmed; blur-save and inline date edits have no undo (DT-4) |
| Explicit date range on dashboard | Month selector added; trend still uses "last 30 entries" (D-5) |
| Auth / Firestore rules | Not in UX scope. Still open, and it matters more now that supplier contacts and costs are stored. |
