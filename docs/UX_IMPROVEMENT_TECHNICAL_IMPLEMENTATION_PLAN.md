# UX Improvement — Technical Implementation Plan

Date: 2026-10-12
Input: `docs/UX_AUDIT.md` (finding IDs such as `S-1`, `DC-3` and `ST-A` refer to that document)
Codebase baseline: commit `c9af17e`, Next.js 16.3.4 App Router, React 19.2, Firebase JS SDK 12, Tailwind 4, shadcn/radix, recharts, sonner.

This plan turns the audit into work packages you can ship. Each one lists the files it touches, the approach, the acceptance criteria and the tests. Order matters: **make data safe first, then make the daily close fast, then restructure.** Each work package (WP) is sized to be one reviewable commit or a small series of them, and per the project workflow each is committed and pushed when done.

---

## 1. Goals and how we'll know it worked

| Goal | Metric (measure before and after) | Target |
|---|---|---|
| Nightly close is fast | Taps + screens from opening the app to "Day completed" (scan path) | ≤ 5 taps, 1 screen (today: ~12 taps, 2 pages) |
| Nightly close is trustworthy | Silent overwrites / lost edits reported by staff | 0 |
| Numbers agree everywhere | Same month's portions on Dashboard vs Performance | Identical |
| Ordering is quick | Push received → order sent to supplier | ≤ 2 min, no context switching |
| App feels fast | Time to first meaningful number on Dashboard (repeat visit, phone) | < 1 s (cached), live refresh in background |

Lightweight instrumentation (optional, WP-0.8): log `close_started` / `close_completed` timestamps to a `uxEvents` collection, so close duration can be compared before and after.

---

## 2. Guardrails

1. **No silent schema migrations.** Every WP reuses existing collections. Where new fields are added (e.g. `MenuItem.sheetOrder`), they're optional and back-compatible.
2. **Owner decisions** (section 12) block only the WPs that name them. Everything else can proceed.
3. **Every WP must pass** `npm run build`, `npm run lint` (no new errors) and `npm test` (added in WP-0.1), plus the manual QA script for any flow it touches (section 11).
4. **Next.js 16 specifics.** Read `node_modules/next/dist/docs/` before using a routing API. Points that apply to this plan:
   - A client component that calls `useSearchParams` must sit under a `<Suspense>` boundary, or the whole route becomes client-rendered (`03-api-reference/04-functions/use-search-params.md`).
   - `next/link` supports `onNavigate={(e) => e.preventDefault()}` for cancelling client-side navigation. This is the hook for unsaved-change guards (`02-components/link.md`).
5. **Pure logic goes in `src/lib/*` with unit tests.** Components stay thin. Several fixes below start by moving inline page logic (e.g. `performanceSales` in `items/page.tsx`) into tested lib functions.

---

## 3. Phase overview

| Phase | Theme | Main audit IDs | Size | Depends on |
|---|---|---|---|---|
| **0** | Shared foundations (hooks, components, test runner) | — | M | — |
| **1** | Stop data loss and silent overwrites | S-1, DC-2, DC-3, SC-4, M-1, DT-3, top-12 #6, DT-5 | M | 0 |
| **2** | One-screen Daily close + scanner rebuild | DC-1, DC-4–DC-9, SC-1–SC-8, FE-1, FE-6/7, MB-4, MB-5 | L | 0, 1 |
| **3** | Stock & ordering | ST-A–ST-F, SU-1–SU-7, U-1–U-4, FE-4, FE-5 | L | 0 |
| **4** | Dashboard & reports that agree | D-1–D-9, S-3–S-9, P-1–P-4, H-1–H-4 | M | 0 |
| **5** | Information architecture, Setup area, language | IA-1–IA-4, LC-1–LC-4, I-1–I-3, N-1–N-4 | M | 2, 3, 4 |
| **6** | Speed, mobile & accessibility polish | ST-2, ST-3, MB-1–MB-3, A11Y-1–4, VH-1–4, N-2 | M | 0 (can run in parallel) |

Suggested calendar for one developer: Phase 0–1 in week 1; Phase 2 in weeks 2–3; Phase 3 in weeks 3–4; Phase 4 in week 5; Phase 5–6 in weeks 6–7. Phase 6 items can be slotted in between.

---

## 4. Phase 0 — Shared foundations

These are small building blocks that later phases reuse. Build them first so fixes stay consistent.

### WP-0.1 Test runner
- Current state: `src/lib/*.test.ts` use `node:test`, but there's no `test` script, and plain `node --test` fails with `ERR_MODULE_NOT_FOUND` because the imports have no file extensions (e.g. `./reorder-status`).
- Add the `tsx` dev dependency and the script `"test": "tsx --test 'src/**/*.test.ts'"`.
- Acceptance: all 5 existing test files pass under `npm test`.

### WP-0.2 `useUnsavedChangesGuard` (`src/hooks/use-unsaved-changes.ts`)
```ts
export function useUnsavedChangesGuard(opts: {
  dirty: boolean;
  message?: string;               // "You have unsaved quantities for Sat 11 Oct."
}): {
  confirmLeave: () => Promise<boolean>;   // for in-page changes: date, tab, dialog close
};
```
- Registers `beforeunload` while `dirty` is true (covers reloads, tab close and hard navigation).
- Publishes `dirty` and `confirmLeave` through a small `NavigationGuardContext` provided in `layout.tsx`. `Nav` links call `onNavigate={(e) => { if (guard.dirty && !await…) e.preventDefault(); }}`. Because `onNavigate` is synchronous, the pattern is: `preventDefault()`, open `ConfirmDialog`, then `router.push(href)` if the user confirms.
- Acceptance: with dirty state, the browser back button, reload, nav links, date arrows and tab switches all prompt. With clean state, nothing prompts.

### WP-0.3 `ConfirmDialog` + `useConfirm()` (`src/components/confirm-dialog.tsx`)
- A promise-based replacement for `window.confirm`: `const ok = await confirm({ title, body, confirmLabel, tone: "danger" | "default", details?: ReactNode })`.
- Replace all `window.confirm` calls (sales delete, item sale delete, no-sales, rescan replace, migration apply, order cancel).
- `details` slot is used by WP-0.6 `ChangeDiff`.

### WP-0.4 Input primitives (`src/components/fields/`)
| Component | Purpose | Audit |
|---|---|---|
| `MoneyInput` | `type="text" inputMode="numeric"`, displays `1.500.000` while typing, stores an integer, optional `Rp` prefix, accepts the shorthand `1,5jt` / `150rb` / `150k` via `parseRupiah()` in `src/lib/money.ts` (unit-tested) | FE-1, FE-2 |
| `QuantityInput` | Integer stepper, 44 px targets, optional `unit` suffix, blocks decimals unless `allowDecimal` | DC-7, FE-4 |
| `DateStepper` | ‹ date › + Today + native picker. Clearing the field doesn't jump to today. Optional `warnFuture`. Calls `onBeforeChange` (guard hook) | FE-6, DC-5 |
| `FieldRow` | Label wired with `htmlFor`/`id` via `useId()` | FE-5 |

Disable wheel-to-change on any remaining `type="number"` input with a global `onWheel={(e) => e.currentTarget.blur()}` inside `Input` when `type === "number"`.

### WP-0.5 State and display components (`src/components/state/`)
- `AsyncSection` — `{ status: "loading" | "error" | "empty" | "ready"; onRetry; emptyTitle; emptyAction; skeleton }`. It always renders the skeleton until the first successful load (fixes ST-1).
- `Stat` — replaces `RecapStat`, `StatCard`, `RevenueBreakdownStat`, `SourceAuditStat` and the inventory stat tiles (VH-3). Props: `label`, `value`, `sub`, `tone`, `range`, `delta`.
- `StatusBadge` — one mapping from domain status to label, colour and icon (close status, stock status, order status, recipe status). Built from `src/lib/status.ts`.
- `RelativeSavedAt` — "Saved 3 min ago" that ticks (ST-4).

### WP-0.6 `ChangeDiff` (`src/components/change-diff.tsx`)
- Renders a current → new table for any record: `rows: { label; current; next; format }[]`, highlighting changed rows. Used by the sales overwrite, scanner overwrite and stock count variance.

### WP-0.7 URL state helper (`src/hooks/use-query-state.ts`)
- `useQueryState("date", { default: todayISO(), validate: isISODate })` reads `useSearchParams()` and writes with `router.replace(pathname + "?" + params, { scroll: false })`.
- Each page using it wraps its client body in `<Suspense fallback={<PageSkeleton/>}>` (Next 16 requirement).
- Acceptance: `/items?view=history&date=2026-10-10` restores the view and date. Reloads keep state.

### WP-0.8 (optional) UX event log
- `logUxEvent(name, props)` writes to `uxEvents` (fire-and-forget). Used only for close-duration measurement. Firestore rules are currently open, so the write needs no extra configuration.

---

## 5. Phase 1 — Stop data loss and silent overwrites (S1)

### WP-1.1 Revenue form loads existing entry — `S-1`, `FE-7`
Files: `src/app/sales/page.tsx`, `src/lib/data.ts`
- On date change, call `getSalesEntryByDate(date)` (debounced, cancellable). If an entry exists, fill the four `MoneyInput`s and the note, show the banner "Editing saved entry for Sat 11 Oct · saved 22:14", and change the button label to **Update entry**.
- On save, if the values differ from the loaded entry, show a `ChangeDiff` confirmation.
- **Optimistic concurrency.** Add `expectedUpdatedAt?: number` to `SalesEntryInput`. In `writeSalesEntry`, use `runTransaction`: read the doc, and if `doc.updatedAt !== expectedUpdatedAt`, throw `ConflictError`. The UI catches it and shows "This day was changed on another device — reload to see the latest." This protects two phones closing the same day. (Add `updatedAt` to sales writes if it isn't there yet. Today only `createdAt` exists; treat a missing value as `createdAt`.)
- After save, keep the date and show **Next day →** (FE-7).
- Tests: `parseRupiah` in `src/lib/money.test.ts`; a conflict-detection pure helper `isStale(expected, actual)`.

### WP-1.2 Unsaved-change guard on Daily close — `DC-2`
Files: `src/app/items/page.tsx`
- `dirty = dailyHasChanges` (it already exists, at line 1111).
- Wrap `shiftDailyDate`, the date input, the *Today* button and the tab change in `await confirmLeave()`. Dialog choices: **Save draft & continue** / **Discard** / **Stay**.
- Also persist unsaved quantities to `sessionStorage` under `porcafe.close.draft.<date>`, restore them on return with a "Restored unsaved entries from 21:52" notice, and clear them on save.
- Acceptance: QA script C-3 (section 11).

### WP-1.3 Scanner refreshes the close it wrote — `DC-3`
Files: `src/app/items/page.tsx`
- `TicketScanDialog` `onDone(savedDate)`: call `setActiveView("daily")`, `setDate(savedDate)`, `setDailyRetryKey(k => k + 1)`. This is a short-term fix. The rebuilt scanner in WP-2.3 replaces it.
- Acceptance: scan today's sheet while on today's Daily close, and the quantities show immediately. Pressing *Save draft* doesn't change the scanned values.

### WP-1.4 Scanner warns about overwriting a manual close — `SC-4`
- In `handleFile` and on every `scanDate` change, re-fetch `getDailyItemLog(scanDate)` and `getSalesEntryByDate(scanDate)`. If a log exists, render `ChangeDiff` (current qty vs scanned qty per item, plus status and source) above the review table.
- Folded into WP-2.3 if Phase 2 starts immediately.

### WP-1.5 Lock base-unit changes — `M-1`
Files: `src/components/inventory/materials.tsx`, `src/lib/data.ts`
- Add `getMaterialUsageCounts(materialId)` returning `{ movements, recipeLines, supplierItems, schedules }`, using `getCountFromServer` queries.
- Show the unit as text, with an **Change unit…** button that opens a dialog. If any count > 0, the dialog explains why it's blocked: "Telur has 128 stock movements and 6 recipe lines in *butir*. Create a new material instead." If all counts are 0, a normal confirm.

### WP-1.6 Steer receiving toward open orders — `DT-3`, top-12 #5
Files: `stock-dashboard.tsx`, `supplier-orders.tsx`, `inventory/page.tsx`
- `StockDashboard` receives `openOrders` (already loaded for the suppliers tab; load lazily if not).
- When *Receive stock* is selected for a material that has an open order line, show an inline callout: "PO-0012 from Sumber Segar has 5 kg of Kailan on the way. **Receive against this order**" (deep link `/inventory?tab=orders&receive=<orderId>`; `SupplierOrders` opens the receive dialog when the param is present). Unplanned receipts stay possible ("This is a different delivery").
- Also merge the two preferred-supplier fields (DT-3). `material.preferredSupplierId` becomes the single truth. The `supplierItem.preferred` checkbox in the link form writes through to the material. Run a one-time read-only reconciliation report in Setup → Data maintenance listing disagreements.

### WP-1.7 Drafts don't deduct stock — top-12 #6 · **needs owner decision D1**
Files: `src/lib/inventory-usage.ts`, `src/lib/types.ts`, `src/app/items/page.tsx`
- Add usage status `"pending-draft"`. In `calculateDailyInventoryUsage`, if `log.status === "draft"`, return the event with `status: "pending-draft"`, `lines: []` and `issues: []`.
- Nothing else needs to change for the reversal: `applyInventoryConsumptionEvent` already reverses a previously calculated event when the new status isn't calculated (`data.ts` ≈ line 1314). So downgrading complete → draft automatically restores stock.
- Only POST `/api/push/reorder-transition` when `event.status` is calculated.
- Usage recap shows drafts as "Waiting for close". Unit test: draft → pending, complete → calculated, complete → draft → reversal movements created (extend `inventory-usage.test.ts` and `inventory-ledger.test.ts`).

### WP-1.8 Confirm destructive inventory actions — `DT-5`, `SU-5`
- `useConfirm` on: remove supplier link (with an impact line), archive a material, supplier or menu item ("Archived items disappear from Daily close and scanning"), and cancel order (replacing `window.confirm`).

**Phase 1 exit criteria:** QA scripts C-1…C-5 and S-1…S-3 pass. No `window.confirm` left in `src/`.

---

## 6. Phase 2 — One-screen Daily close + scanner rebuild

### WP-2.1 Extract Daily close out of the 2,640-line page
Files: new `src/components/close/` folder
```
close/
  daily-close.tsx          // container: date, loading, save orchestration
  use-daily-close.ts       // state machine + data access (see below)
  item-entry-list.tsx      // sections, QuantityInput rows, filter box
  payments-panel.tsx       // Cash / BCA / Soundbox / Other MoneyInputs
  close-summary.tsx        // totals, status, saved-at, warnings
  close-action-bar.tsx     // sticky: No sales · Save draft · Complete day
  complete-day-review.tsx  // pre-complete checklist dialog (WP-2.4)
```
- `/items` keeps rendering `<DailyClose/>` for `view=daily`, with no behaviour change in this step. This is a refactor-only commit so the following diffs stay readable.
- Split the remaining tabs out the same way (`items/performance.tsx`, `items/catalog.tsx`, `items/history.tsx`) so each loads lazily with `next/dynamic` (helps ST-2).

### WP-2.2 Payments inside Daily close — `DC-1`, `S-2`, `MB-4`
- `use-daily-close.ts` loads `{ log, salesEntry }` for the date (as today) and holds `quantities` and `payments` drafts. `dirty` covers both.
- New `saveDailyClose()` in `src/lib/data.ts`:
```ts
export async function saveDailyClose(input: {
  date: string;
  status: "draft" | "complete" | "no_sales";
  source: "manual" | "scan";
  quantities: Record<string, number>;
  payments?: { cash: number; bca: number; soundbox: number; other: number; note?: string };
  expected: { logUpdatedAt?: number; salesUpdatedAt?: number };   // optimistic concurrency
}): Promise<{ log: DailyItemLog; salesEntry: SalesEntry | null }>
```
  This uses `runTransaction` to write `dailyItemLogs/{date}` and `salesEntries/sales-{date}` together (or the existing doc ID for that date), or neither. Then it calls `calculateSavedDailyUsage` **after** returning, so the UI isn't blocked (ST-3).
- Layout: on mobile, a compact summary strip at the top ("Main 42 · Add-on 18 · Rp 3.240.000 · Draft"), then **Items**, then **Payments**, then the sticky action bar. On desktop, the existing 2/3 + 1/3 layout with payments in the right column replacing the read-only split.
- `/sales` stops being an entry page (Phase 4 turns it into a report). Until then, its form gets a banner: "Revenue is now entered in Daily close →" linking to `/items?date=`.

### WP-2.3 Scanner rebuild — `SC-1`…`SC-8`, `MB-5`
New `src/components/close/scan-sheet/`:
```
scan-sheet.tsx         // full-screen Dialog on mobile, wide on desktop
use-scan-machine.ts    // idle → compressing → scanning → review → saving → done | error
compress-image.ts      // createImageBitmap → canvas, long edge 2000px, JPEG q=0.8
photo-viewer.tsx       // tap to fullscreen, pinch-zoom (touch-action: pinch-zoom), pan
scan-review-table.tsx  // rows: sheet text → matched item (combobox) → qty, + Add item
scan-payments.tsx      // reuses PaymentsPanel + sheet-total vs entered diff
```
- **Compression:** keeps the payload well under Vercel's 4.5 MB request limit. Show an "Uploading… / Reading sheet… 0:24" elapsed timer.
- **Cancellation:** `AbortController` on the fetch, with a *Cancel* button. Block `onOpenChange(false)` (outside click / Esc) while `scanning`, or while in `review` with edits, unless confirmed.
- **Errors:** the `error` state keeps the photo and offers *Try again* (same file) and *Choose another photo*. The server error message is mapped to friendly text: payload too large, timeout, model error.
- **Review:** each row shows the sheet text (`rawName`) in small type above the matched-item combobox. Unmatched rows are highlighted and counted in the footer ("2 rows need a match"). *+ Add item* adds a blank row. Duplicate matches are merged, with a note.
- **One commit:** the final *Confirm* calls `saveDailyClose({ source: "scan", status: "complete", quantities, payments, expected })`. There's no longer a half-saved "items complete, revenue pending" state (SC-5). Before confirming, show a `ChangeDiff` against any existing log or entry (SC-4).
- **After save:** close the sheet and route to `/items?view=daily&date=<scanDate>` (SC-7).
- **Legacy mirror:** keep writing `itemSales` rows exactly as today (replacement semantics), but inside `saveDailyClose` behind `options.mirrorLegacy = true`, until Phase 4 removes legacy readers.
- **API route:** `src/app/api/scan-ticket/route.ts` stays compatible. Add a server-side size check that returns `413` with `{ error: "image-too-large" }`.

### WP-2.4 Complete-day review — `DC-4`, `DC-8`
- `complete-day-review.tsx` opens on *Complete day*. It lists checks computed by the pure function `getCloseWarnings()` in `src/lib/close-checks.ts` (unit-tested):
  - `no-portions`: total = 0, which suggests *No sales* instead
  - `no-revenue`: portions > 0 but payments total = 0
  - `revenue-mismatch`: |payments − Σ(qty × price)| / estimate > 15 % (threshold constant), shown with both numbers
  - `missing-price`: sold items without a price (the estimate is partial)
  - `future-date`
  - `editing-completed`: the day was already complete; shows the last saved time and source
- Warnings don't block. The primary button reads **Complete anyway** when any warning exists.
- After success, show a recap card in place of the action bar for 10 s: "Sat 11 Oct closed · 60 portions · Rp 3.240.000 · stock updated ✓", with an *Undo* that restores the previous log and entry within the window. (Keep the previous docs in memory; undo calls `saveDailyClose` with them.)

### WP-2.5 Sheet order, aliases and quick filter — `DC-6`, `CT-3`
- Add optional `MenuItem.sheetOrder?: number` and `MenuItem.sheetAliases?: string[]` (back-compatible; `types.ts`, `upsertMenuItem`).
- In Catalog: a drag-to-reorder list (or up/down buttons, which are simpler and fine on mobile) plus an aliases chip input.
- Daily close sorts by `sheetOrder` then name, and gets a filter box ("Type to find…") plus a "Only items with quantity" toggle.
- The scanner sends `sheetAliases` along with `menuItems`, and the route prompt includes them. This improves match quality and replaces the hand-kept mapping in auto-memory.

### WP-2.6 Primary action hierarchy — `VH-1`, `DC-9`
- Header: **Scan sheet** as the filled primary button; the date stepper next to it. Remove the duplicate status badge and the duplicate Main portions block.

**Phase 2 exit criteria:** QA scripts C-1…C-8 pass. The close (scan path) takes ≤ 5 taps plus review. `items/page.tsx` is under 600 lines.

---

## 7. Phase 3 — Stock & ordering

### WP-3.1 One stock-status model — `ST-A`, `SU-7`, top-12 #10
- New `src/lib/stock-status.ts`:
```ts
export type StockStatus = "negative" | "out" | "to-order" | "on-order" | "ok" | "no-alert-level" | "not-initialized";
export function getStockStatus(material, currentQuantity, { initialized, hasOpenOrder }): StockStatus;
export const STOCK_STATUS_META: Record<StockStatus, { label: string; tone: Tone; rank: number }>;
```
  It wraps `getInventoryReorderStatus` so push logic and UI share one definition. Unit-test every branch.
- Use it in the Stock table, the Reorder overview, the Dashboard attention list and push message copy. Labels in sentence case: *Negative · Out · To order · On order · OK · No alert level · Not set up*.

### WP-3.2 Current stock table that drives action — `ST-B`, `MB-1`
- Columns: Material · On hand (with unit) · Alert at · On order · Status · Action (*Order* / *Count*). Default sort: by `rank`, then name. Search box and status chips (reuse the Reorder overview filter UI).
- Below `sm`, render a card list: name and status on the first line, "4,2 kg · alert 5 kg · 3 kg on order" on the second, actions as buttons.

### WP-3.3 Stock count with variance + count sheet — `ST-C`
- Single count: show "System 4,2 kg" next to the input and a live difference (amount and %). If |diff| > 20 %, require a reason (the field already exists).
- Count sheet (new dialog *Count stock*): the list of active materials (filter by category or search), each with System / Counted / Difference. Save all counts in one `writeBatch` through a new `recordInventoryStockCounts(inputs[])`. Count date limited to today (expected balances are current, not historical). Draft counts persist in `sessionStorage` (guard hook).

### WP-3.4 Movement form clarity — `ST-D`, `FE-4`, `FE-5`
- Show the unit suffix on quantity fields. Wire every label to its input with `FieldRow`.
- Merge *Manual adjustment* and *Correction* into **Adjustment (+/−)**, keeping the stored enum values for history. Old movements still display their original labels.
- When the quantity comes from the reorder default, mark it with "Pre-filled from usual order quantity · change if different".

### WP-3.5 Readable audit trail — `ST-E`
- Paginate (50 per page, "Load more") with a `listInventoryMovements({ limit, startAfter })` cursor (the options object already exists).
- Turn `sourceRef` into human links with `describeSourceRef(ref)` in `src/lib/source-ref.ts`: `consumption:…` → "Daily close Sat 11 Oct" (link), `supplier-order:<id>` → "Order PO-0012" (link), `stock-count:…` → "Stock count". The raw ref goes into a tooltip.

### WP-3.6 Opening stock: save progress — `ST-F`
- `sessionStorage` autosave plus "x of y entered" progress. Allow initializing once all values are filled, which is unchanged but no longer loses input.

### WP-3.7 Split Suppliers & ordering — `SU-1`, `SU-6`
- Inventory tabs (daily use): **Stock** · **To order** · **Orders** · **Usage**.
  - *To order* = Reorder overview filtered to `to-order` by default, with multi-select → "Create order for selected (grouped by preferred supplier)".
  - *Orders* = open orders first, the receive dialog, history filters, and the supplier movement audit as a collapsed section.
- Supplier master, pricing links, reorder settings and schedules move to **Setup → Suppliers** (Phase 5). Until Phase 5 lands, keep them in a collapsed "Supplier setup" accordion at the bottom of *Orders*.
- Remove the "In-app alerts: Enabled per material" tile and the mid-page "Supplier foundation" card.
- Update `INVENTORY_PATH` in `push-notifications-server.ts` to `/inventory?tab=to-order`. Keep support for the old `?tab=suppliers#reorder-overview` by mapping it in `isInventoryTab`.

### WP-3.8 Send the order — `SU-2`
- `src/lib/supplier-message.ts` (unit-tested):
```ts
export function buildSupplierOrderMessage(order, supplier, { lang: "id" }): string;
// "Halo Pak Budi, order Porcafe tgl 12 Okt:\n- Telur 5 tray\n- Kailan 2 kg\nKirim tgl 13 Okt. Terima kasih."
export function toWhatsAppLink(phone: string, text: string): string | null; // 08xx → 628xx; null if invalid
```
- After *Create order*, show: **Send via WhatsApp** (`wa.me` link) · **Copy text** · *Done*. Same actions on each open order row.
- Supplier phone numbers become `tel:` links and get a WhatsApp icon link (SU-2).

### WP-3.9 Reorder settings: one save — `SU-3`
- Convert to a table form with dirty tracking per row (highlight changed rows) and a sticky **Save N changes** bar. Use one `writeBatch` of `upsertInventoryMaterial` patches.
- Empty preferred-supplier dropdown shows: "No supplier prices yet — *Link a supplier*" (deep link to Setup → Suppliers with the material pre-selected).

### WP-3.10 Scheduled deliveries need confirmation — `SU-4`, `I-4` · **owner decision D4**
- Option A (recommended): schedules create a *pending receipt* (`InventorySupplierOrder` with `status: "ordered"` and `source: "schedule"`) instead of a stock movement. Staff confirm it in *Orders* with one tap ("Arrived as planned") or adjust it.
- Option B (minimal): keep auto-movements, but show "2 scheduled deliveries were added to stock today — Review" on Stock and the Dashboard, with a one-tap reversal (`createInventoryMovement` correction).

### WP-3.11 Usage recap fixes — `U-1`…`U-4`
- Bulk exclusion: "Exclude *Nanban* on all days in range until its recipe is active". Loop over `setInventoryUsageItemExcluded` with a progress bar, or add a batched variant.
- Rename: *Usage events* → **Days calculated**, *Usage lines* → **Ingredients**, "Saved as draft" → "Draft (not deducted)" (with WP-1.7).
- "Needs review" uses the warning tone, not the destructive one.
- The selected day's detail expands inline under its row (an accordion row).

**Phase 3 exit criteria:** QA scripts K-1…K-6 pass. The same material shows the same status label on Stock, To order and the push message.

---

## 8. Phase 4 — Dashboard & reports that agree

### WP-4.1 One item-sales source — `D-1`, `H-1`
- Move `performanceSales` (`items/page.tsx:1202-1226`) to `src/lib/reporting.ts`:
```ts
export function getCanonicalItemRows(dailyLogs, legacySales, menuItems): ItemSale[]; // daily log wins per date
```
- Use it on the Dashboard (replacing `items` from `listItemSales()` in `page.tsx:145-175`), Performance, History and CSV exports. Unit-test the precedence rules (daily log wins, legacy fills gaps, archived items keep names).
- History becomes read-only. Each row links to `/items?view=daily&date=`. Legacy editing is removed (after D5: legacy migration applied).

### WP-4.2 Actionable attention list — `D-2`, `D-3`
- `getAttentionItems({ today, dailyLogs, salesEntries, stockStatuses, scheduledDeliveries })` in `src/lib/reporting.ts` returns `{ kind, date?, label, href, severity }[]`:
  - today not started or draft → `/items?date=today`
  - each draft day in the last 14 days → its date
  - portions without revenue, and revenue without portions (both directions), per date
  - N materials *to order* → `/inventory?tab=to-order`
  - negative stock, scheduled deliveries to confirm
- Render as a list (max 6, then "Show all"). Hidden behind a skeleton until loaded; on error the card shows the error, not zeros.

### WP-4.3 Honest comparisons and trend — `D-4`, `D-5`, `D-6`, `D-7`, `D-8`
- `comparePeriods(current: DateRange, sales)` compares against the same number of days in the prior period, labelled "vs 1–12 Sep".
- Trend: calendar days of the selected month, with gaps rendered (`connectNulls={false}`). The month selector drives it.
- Replace "Avg per portion" with "Avg revenue per Main portion". "Days logged" counts distinct dates.
- Takeaway text from `describeMonth()`: average/day, % vs the comparable period, best weekday.
- Remove the duplicated totals (VH-2). Keep: Attention · Month at a glance (Recorded / Selisih / Reported, Portions, Best seller, Days closed) · Trend · Payment mix · Top items · Category mix.

### WP-4.4 Reports area — `S-3`…`S-9`, `P-1`…`P-4`
- New route `src/app/reports/page.tsx` with tabs **Revenue** · **Items** · **Weekday patterns**, sharing one `ReportPeriod` (`?from=&to=` via `useQueryState`, with presets: This month, Last month, Last 30 days, Custom).
  - *Revenue*: Recorded / Selisih / Reported tiles for the period. Daily chart (primary colour, A11Y-2). Table of days (read-only, with an *Edit* link to Daily close). **Monthly reconciliation** section (S-4) with month picker, sign guidance and note. Exports: "Daily rows with payment split" and "Grouped totals" (S-7). Stats: Average · Lowest · Highest, excluding the in-progress day (S-6).
  - *Items*: what's now the Performance tab, with every card driven by the shared period (P-1). The "per selling day" denominator is explicit (P-2).
  - *Weekday patterns*: the two `WeekdayPatternAnalysis` usages plus Top Main item by weekday, in one place (P-3).
- `/sales` → redirect to `/reports?tab=revenue` (after WP-2.2 ships). Duplicate-date review moves to Setup → Data maintenance.

**Phase 4 exit criteria:** for any month, portions and revenue match across Dashboard, Reports and CSV (QA R-1). There are no hard-coded "last N entries" charts.

---

## 9. Phase 5 — Information architecture, Setup, language

### WP-5.1 Route map and nav — `IA-1`…`IA-3`, `N-1`, `N-3`
| Nav label | Route | Contents |
|---|---|---|
| Home | `/` | Attention list, month at a glance, charts |
| Today | `/items` (`?date=`) | Daily close only (portions + payments + scan) |
| Reports | `/reports` | Revenue · Items · Weekday |
| Stock | `/inventory` | Stock · To order · Orders · Usage |
| Setup | `/setup` | Menu · Materials · Recipes · Suppliers & prices · Reorder settings · Delivery schedules · Notifications · Import · Data maintenance |

- `next.config.ts` `redirects()`: `/sales` → `/reports?tab=revenue`, plus mapping old `/inventory?tab=materials|recipes|import` to `/setup?tab=…` (or do this client-side in `isInventoryTab` if config redirects can't match query strings in this Next version; check `node_modules/next/dist/docs` for `has` matching).
- Nav: 5 items with prefix matching for active state and `aria-current` on desktop too. PWA `manifest.json`: add `shortcuts` for *Today* (`/items`) and *To order* (`/inventory?tab=to-order`).
- Remove the "Menu items" H1 swap; each route has one stable title.

### WP-5.2 Setup area — `IA-4`, `I-2`, `IM-1`, `H-3`
- `src/app/setup/page.tsx` hosts the existing components (`Catalog`, `Materials`, `Recipes`, supplier master/pricing/reorder/schedules, `ImportReview`, `PushNotificationsSettings`), lazily loaded per tab (reuse the inventory page's lazy-tab pattern).
- **Data maintenance** tab: legacy migration preview/apply, duplicate sales dates, preferred-supplier reconciliation (WP-1.6), recalculate usage for a range.
- Optional (decision D3): a 4-digit Setup PIN stored as a hash in an env var and checked client-side. That isn't security, just a guard against accidental edits on shared phones. Real auth remains a separate track.
- Push notifications: replace the inventory-page card with a compact chip in Stock's header ("🔔 Alerts on this phone: Off · Turn on"). The full card lives in Setup. Show the iOS hint only when `/iPad|iPhone/.test(ua) && !matchMedia('(display-mode: standalone)').matches`.

### WP-5.3 Copy dictionary & language — `LC-1`…`LC-4` · **owner decision D2**
- `src/lib/copy.ts`: a typed dictionary `copy.close.completeDay`, `copy.stock.status.toOrder`, … for every user-visible string in touched files. No i18n library; a plain `const id = {…}` / `const en = {…}` with `export const copy = id` (or `en`), selected by decision D2. This also fixes the glossary drift (LC-2) because each concept is defined once.
- Glossary (EN / ID): Daily close / Tutup harian · Portions / Porsi · Payments / Pembayaran · Soundbox (QRIS Nobu) · Selisih (bank reconciliation) · To order / Perlu dipesan · On order / Sedang dikirim · Stock count / Stok opname.
- Remove the engineering copy listed in LC-3 and I-1. The Inventory header becomes operational KPIs (*To order 3 · On order 2 · Negative 1 · Last count 5 Oct*).

### WP-5.4 Docs for staff — `N-4`
- Replace `README.md` with a project README (dev setup, test, deploy). Add `docs/STAFF_GUIDE.md`: nightly close, scanning tips, receiving a delivery, weekly stock count. Keep it to one page each.

---

## 10. Phase 6 — Speed, mobile & accessibility (can run in parallel)

### WP-6.1 Instant loads with Firestore persistent cache — `ST-2`, `N-2`
- In `src/lib/firebase.ts`:
```ts
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```
  This gives repeat visits cached-first reads and queues offline writes durably in IndexedDB.
- Because offline writes now *do* persist, update the offline banner: "Offline — changes are saved on this phone and will sync when you're back online", and show a "pending sync" dot in the action bar using `hasPendingWrites` from snapshot metadata. Re-verify duplicate-date and conflict behaviour (the WP-1.1 transactions **fail offline** by design; show "Needs connection to update an existing day").
- Replace full `refresh()` after inline edits with local state patching (catalog, history).
- Scope list queries: `listDailyItemLogs({ from })` / `listSalesEntries({ from })` for the Dashboard (current + previous month) instead of all-time reads. Load all-time data only on Reports when the period needs it.
- Remove the bespoke `localStorage` caches in `inventory/page.tsx` and `stock-dashboard.tsx` once the persistent cache is confirmed. Fewer moving parts.

### WP-6.2 Mobile tables — `MB-1`, `MB-2`, `MB-3`
- A `ResponsiveTable` pattern: `<table>` from `sm` up; below that, `renderCard(row)`. Apply it to Current stock, To order, Orders and Reports day rows. Admin tables in Setup may keep horizontal scroll, with a sticky first column (`sticky left-0 bg-card`).
- No more inline-editable 32 px cells in daily screens (editing happens in forms/dialogs). Where inline editing remains in Setup, use 40 px inputs with a visible border on touch (`@media (hover: none)`).
- Inventory tabs: 4 tabs after WP-3.7 fit as a single scrollable row on mobile.

### WP-6.3 Accessibility & contrast — `A11Y-1`…`A11Y-4`
- Chart colours from tokens only (`--primary-brand` for single series). Remove raw hex in `page.tsx` charts, and add a `chartColors` export in `src/lib/chart-colors.ts`.
- Raise `text-primary/45–60` usages to `text-muted-foreground` (`#5e6963`, ≥ 4.5:1 on cream).
- Reorder alert toggle: a visible "Alert" label or a switch with text.
- Run `axe` (via `@axe-core/playwright` if WP-E2E is adopted, otherwise the browser extension) on Home, Today, Stock and To order. Zero serious violations.

### WP-6.4 Visual consistency — `VH-2`, `VH-3`, `VH-4`
- Adopt `Stat`, `StatusBadge` and `AsyncSection` everywhere. One `PageHeader` component (title, description, actions) for consistent H1 sizing.

---

## 11. Testing strategy

### Unit tests (`npm test`, required per WP)
New tested modules: `money.ts` (parseRupiah/format), `close-checks.ts`, `stock-status.ts`, `reporting.ts` (canonical rows, attention items, comparePeriods), `supplier-message.ts` (message + phone normalization), `source-ref.ts`, plus draft/pending behaviour in `inventory-usage` and reversal in `inventory-ledger`.

### End-to-end smoke (recommended, optional WP-E2E)
- Playwright against `next dev` with the **Firestore emulator** (`firebase.json` exists; add an `emulators.firestore` block and `connectFirestoreEmulator` when `NEXT_PUBLIC_USE_EMULATOR=1`).
- Specs: manual close; edit existing day (diff shown); unsaved-guard on date change; scan with a mocked `/api/scan-ticket` (route interception) including the failure + retry path; create order → WhatsApp link; stock count variance.

### Manual QA scripts (run on a real phone + desktop before each phase closes)
| ID | Script |
|---|---|
| C-1 | Manual close today: enter items + payments → Complete → recap shows → Dashboard attention clears |
| C-2 | Backfill yesterday: data loads into the form; change one value → diff → update; *Next day* moves forward |
| C-3 | Enter 3 quantities, tap ‹ → guard dialog; *Discard* clears, *Stay* keeps; reload the tab → restore notice |
| C-4 | Two devices open the same day; save on A then B → B sees the conflict message, no silent overwrite |
| C-5 | Complete with 0 portions / with no revenue / with a 30 % mismatch → correct warnings, can complete anyway, undo works |
| C-6 | Scan: success; airplane mode mid-scan → error → retry; cancel mid-scan; Esc blocked |
| C-7 | Scan a date that has a manual close → diff → confirm → Daily close shows scanned values |
| C-8 | 12 MP photo upload succeeds (compressed < 1.5 MB) |
| S-1 | Remove a supplier link / archive a material → confirm dialog with impact text |
| S-2 | Change the base unit on a material with movements → blocked with explanation |
| S-3 | Save draft → stock unchanged (D1 = no deduct); complete → deducted; back to draft → reversed |
| K-1 | Material below its alert level shows *To order* on Stock, To order and in the push text |
| K-2 | Receive stock for a material with an open order → callout → receive against the order |
| K-3 | Count sheet: 5 materials, variance shown, reasons enforced > 20 % |
| K-4 | Create order → WhatsApp opens with the correct number and text |
| K-5 | Reorder settings: edit 3 rows → one save |
| K-6 | Scheduled delivery → appears for confirmation (D4 option chosen) |
| R-1 | Pick a month: Dashboard portions = Reports Items total = CSV sum; revenue likewise |

---

## 12. Owner decisions needed

| ID | Decision | Options | Blocks |
|---|---|---|---|
| D1 | Should drafts deduct stock? | **No (recommended):** only complete days deduct, reversal on downgrade · Yes: keep current behaviour, but relabel the button "Save (counts toward stock)" | WP-1.7 |
| D2 | UI language | **Indonesian (recommended for floor staff)** · English + glossary · Toggle (both dictionaries maintained) | WP-5.3 |
| D3 | Protect Setup on shared phones? | None · **PIN guard (recommended, interim)** · Real auth (separate project; also closes the open Firestore rules) | WP-5.2 |
| D4 | Scheduled deliveries | **Pending receipt to confirm (recommended)** · Auto-add + review banner | WP-3.10 |
| D5 | Retire legacy `itemSales` editing | **Apply the migration, then make History read-only (recommended)** · Keep legacy editing | WP-4.1 |
| D6 | Revenue-mismatch warning threshold | 10 % · **15 % (default)** · 20 % | WP-2.4 |

---

## 13. Sequenced backlog (copy into an issue tracker)

| # | WP | Title | Size | Phase |
|---|---|---|---|---|
| 1 | 0.1 | `npm test` with tsx; existing tests green | S | 0 |
| 2 | 0.3 | `ConfirmDialog`/`useConfirm`, replace `window.confirm` | S | 0 |
| 3 | 0.2 | `useUnsavedChangesGuard` + nav `onNavigate` integration | M | 0 |
| 4 | 0.4 | `MoneyInput`, `QuantityInput`, `DateStepper`, `FieldRow`, `parseRupiah` | M | 0 |
| 5 | 0.5–0.7 | `AsyncSection`, `Stat`, `StatusBadge`, `ChangeDiff`, `useQueryState` | M | 0 |
| 6 | 1.1 | Sales form loads existing entry + conflict check | M | 1 |
| 7 | 1.2 | Daily close unsaved guard + session restore | S | 1 |
| 8 | 1.3 | Scanner reloads the scanned day | S | 1 |
| 9 | 1.5 | Lock base-unit changes | S | 1 |
| 10 | 1.6 | Receive against open orders + single preferred supplier | M | 1 |
| 11 | 1.7 | Drafts don't deduct stock (D1) | S | 1 |
| 12 | 1.8 | Confirm destructive inventory actions | S | 1 |
| 13 | 2.1 | Extract Daily close + lazy item tabs (refactor only) | M | 2 |
| 14 | 2.2 | Payments in Daily close, `saveDailyClose` transaction | L | 2 |
| 15 | 2.3 | Scanner rebuild (compress, cancel, retry, zoom, add row, one commit) | L | 2 |
| 16 | 2.4 | Complete-day review + undo | M | 2 |
| 17 | 2.5 | Sheet order, aliases, quick filter | M | 2 |
| 18 | 2.6 | Header hierarchy cleanup | S | 2 |
| 19 | 3.1 | `stock-status.ts` used everywhere | M | 3 |
| 20 | 3.2 | Actionable current-stock table / mobile cards | M | 3 |
| 21 | 3.3 | Stock count variance + count sheet | M | 3 |
| 22 | 3.4–3.6 | Movement form, audit trail, opening stock progress | M | 3 |
| 23 | 3.7 | Split To order / Orders tabs, push URL | M | 3 |
| 24 | 3.8 | WhatsApp / copy order message | S | 3 |
| 25 | 3.9 | Reorder settings batch save | S | 3 |
| 26 | 3.10 | Scheduled deliveries confirmation (D4) | M | 3 |
| 27 | 3.11 | Usage recap fixes + bulk exclusion | S | 3 |
| 28 | 4.1 | `reporting.ts` canonical rows; read-only History | M | 4 |
| 29 | 4.2 | Dashboard attention list | M | 4 |
| 30 | 4.3 | Honest comparisons, trend, dedupe | S | 4 |
| 31 | 4.4 | `/reports` with shared period; `/sales` redirect | L | 4 |
| 32 | 5.1 | Route map, nav, manifest shortcuts | M | 5 |
| 33 | 5.2 | `/setup` + Data maintenance + push chip | M | 5 |
| 34 | 5.3 | Copy dictionary + language (D2) | M | 5 |
| 35 | 5.4 | README + staff guide | S | 5 |
| 36 | 6.1 | Firestore persistent cache, scoped queries, offline copy | M | 6 |
| 37 | 6.2 | Responsive tables, touch targets | M | 6 |
| 38 | 6.3–6.4 | Contrast, chart tokens, axe pass, `PageHeader` | S | 6 |
| 39 | E2E | (Optional) Playwright + Firestore emulator smoke suite | M | — |

Sizes: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3–5 days.

**Quick-win slice** if you only have two days: #1, #2, #6, #7, #8, #9, #11, plus the chart colour fix from 6.3. That removes every S1 silent-overwrite and lost-edit path without any restructuring.
