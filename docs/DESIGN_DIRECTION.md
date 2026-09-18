# Porcafe POS — Design Direction

> Durable product-design and implementation handoff for the Porcafe POS redesign.
>
> Created 2026-09-16 after inspecting the running app, routes, data model, persistence layer, scanner flow, and existing visual system. This document is intentionally implementation-oriented so a future session can resume without relying on chat history.

## How to use this document

Before changing code:

1. Read `AGENTS.md` and this file.
2. Inspect the current implementation and running app again; do not assume this document replaces code-level verification.
3. View the companion visual concept: [`daily-close-design-concept.png`](../daily-close-design-concept.png).
4. Preserve existing routes, functionality, permissions, business logic, APIs, data flows, and integrations unless a separately approved change explicitly says otherwise.
5. Work in small, reviewable vertical slices. Start with the P0 data-trust and resilience risks before broad visual polish.

This is a design direction and delivery plan, not permission to edit the application yet. The owner requested approval before implementation.

## Product read

The product is branded as **Porcafe POS**, but the inspected application behaves primarily as a lightweight café operations and reporting tool rather than a live checkout terminal. Its center of gravity is the end-of-day close: recording revenue, recording item quantities, reviewing performance, reconciling monthly differences, and exporting data.

### Inferred users

- **Shift closer / operator:** needs to finish one operating day quickly, accurately, and with confidence that nothing was missed.
- **Owner / manager:** needs a trustworthy overview of revenue, portions sold, payment mix, trends, and exceptions.
- **Catalog maintainer:** needs to keep menu names, categories, active status, and prices usable for manual entry and scanning.

### Actual jobs to be done

- Close a day from a handwritten sheet or a manual count.
- Record revenue by payment method: BCA, cash, Soundbox, and other.
- Record quantities sold by menu item.
- Scan a sheet and review OCR/item matches before committing.
- Identify incomplete, draft, no-sales, or questionable days.
- Review performance by day, month, item, and category.
- Record a monthly `selisih` adjustment and understand how it affects totals.
- Export data for downstream use.

### Existing information architecture

- `/` — overview/dashboard.
- `/sales` — revenue entry and historical revenue view.
- `/items` — item workflow with Today, Performance, Catalog, and History areas.

The redesign should preserve these routes and their continuity. The visual/mental-model change should be that the Today area becomes a clearer **Daily close** workspace, while the URL and underlying behavior remain stable.

## Existing data and workflow constraints

The UI must explain and respect the current data model. Do not silently introduce a new source of truth or change aggregation semantics as part of visual work.

### Current entities

- `SalesEntry`: `date`, `bca`, `cash`, `soundbox`, `other`, `total`, `note`, `createdAt`.
- `MenuItem`: `name`, `category`, optional `price`, `active`.
- `ItemSale`: `date`, `itemId`/`itemName`/`category`/`qty`.
- `DailyItemLog`: one document per date with quantities keyed by item ID, `totalQty`, `status` (`draft`, `complete`, `no_sales`), source (`manual`, `scan`), and timestamps.
- `MonthlyAdjustment`: one `selisih` value per month, folded into month/grand totals.

### Current persistence

Firestore collections inspected:

- `salesEntries`
- `menuItems`
- `itemSales`
- `dailyItemLogs`
- `monthlyAdjustments`

### Scanner constraint

`/api/scan-ticket` currently uses a two-pass Claude Sonnet 5 flow for OCR/transcription and structured matching. It accepts image upload/camera input, can take roughly 30–60 seconds, and computes BCA/Nobu from catalog prices plus cash from sheet/computed values. The scanner must remain a reviewable draft workflow; it must never feel like an invisible destructive import.

### Offline constraint

The PWA service worker caches shell assets but does not currently provide a true offline data queue and sync mechanism. The UI should communicate stale/offline state honestly rather than implying that an offline write has been persisted.

## Critical UI/UX audit

### What is already working

- Warm cream/forest-green branding is distinctive and appropriate for a café operator tool.
- Top navigation is understandable and the mobile bottom navigation is a useful responsive pattern.
- Revenue entry has direct inputs and live totals.
- The route split broadly maps to reporting, revenue, and item data.
- Tables support useful inline editing, sorting, and export.
- Scanner results are reviewable and the daily-log flow has explicit statuses.
- Toast feedback exists in key interactions.
- Several fields and controls already have ARIA labels.

### P0 — trust, correctness, and recovery risks

These are the highest-priority issues because they can make financial or operational information misleading.

1. **Incomplete data states are not dependable.** Live panels can remain in `Loading…` without a visible retry or actionable error. Dashboard and sales data loading use promise chains without a clear catch path; the daily item view has a timeout but not a consistent application-wide state model.

2. **Sales entries can duplicate by date.** Sales uses a general `upsertSalesEntry` path that can create another record, while the dashboard’s Today view uses the first matching entry and week/month views sum all entries. The same day can therefore disagree across screens.

3. **Manual item logs and legacy history diverge.** Manual entry writes `dailyItemLogs`, while the History view reads legacy `itemSales`. Performance merges both. Users can see different truths depending on where they look.

4. **Rescans can leave stale legacy rows.** Scanner upsert behavior adds or updates detected rows but does not clearly delete rows that disappeared from a later rescan.

5. **`selisih` is not explained consistently.** It is included in month/grand totals but excluded from charts, averages, best-day calculations, and payment mix. Labels do not clearly distinguish recorded revenue, reconciliation adjustment, and reported total; the visible current-month total and delta can therefore feel contradictory.

6. **Production access posture is unsafe.** `firestore.rules` currently contains `allow read, write: if true;`. No real auth/role/permission layer was found, and `/api/scan-ticket` has no visible app-level auth or rate limiting. This needs an owner-approved security decision before production use. Do not “fix” permissions accidentally during a visual redesign, but do not treat this as optional polish.

### P1 — workflow and comprehension friction

7. **Information architecture is technically organized but not task-oriented.** “Menu Items” contains Today, Performance, Catalog, and History, although the operator’s primary mental model is closing a day. “Daily close” should become the visible task name.

8. **Dashboard hierarchy is diluted.** The overview has an at-a-glance recap plus a five-KPI row with overlapping information. It uses a hardcoded current-month framing and the last 30 entries rather than an explicit date range. It does not foreground the next incomplete day or the action that needs attention.

9. **Daily entry requires too much scanning and scrolling.** Quantity entry and revenue are separated without a persistent summary or action area. The close action should stay visible on desktop and mobile.

10. **Blur-save and delete are risky for financial records.** Immediate save on blur and immediate delete provide weak confirmation, undo, and audit context. The UI should make save status and destructive recovery explicit.

11. **Accessibility is inconsistent.** Neutral text is sometimes low contrast; mobile labels/helper text are small; icon-only controls can be below comfortable touch size; sortable headers lack reliable `aria-sort`; chart insights need text equivalents; `html` currently declares English while the domain may be Indonesian; the mobile bottom nav needs safe-area handling; and focus can be obscured by sticky UI.

12. **The visual system is not yet token-driven.** Repeated raw hex values, varying H1 sizes, many similar rounded white cards, large empty loading states, and partially inconsistent chart colors make the product feel less intentional than its brand deserves.

### Baseline engineering observations

- `npm run build` passes.
- `npm run lint` currently reports 25 problems (19 errors and 6 warnings), including tracked source issues and adjacent `.kilo/worktrees/fearless-observation` files scanned by ESLint. Treat this as a baseline to address deliberately, not as evidence that visual changes should bypass verification.
- No application code was changed to create this document.

## Missing or weak features

These are evidence-based improvements to the existing workflows, not a proposal for a new POS product.

### Dashboards and recaps

- A clear **today / incomplete days / recent close recap** should be the first dashboard layer.
- Add an explicit date-range control to overview reporting instead of relying on a hardcoded current-month or last-30-record framing.
- Add a compact “needs attention” summary: not started, draft, scan needs review, missing price, failed load, or unreconciled difference.
- Make recorded revenue, monthly adjustment, and reported total separate values with plain-language explanations.
- Every chart should have a short textual takeaway, not only a visual shape.

### Filters and summaries

- Consistent date range, month, category, status, source, and search controls where the corresponding data exists.
- Preserve filter state when moving between a summary and detail view where practical.
- Show active filters and provide a clear reset action.
- Add lightweight period summaries above tables: total revenue, total portions, number of closed days, days needing attention, and adjustment total.

### Recaps and workflow feedback

- A daily close recap after save/complete: date, status, portions, revenue by method, source, last saved time, and any exceptions.
- Scanner recap with original image, detected rows, unmatched rows, missing prices, replacement warning, and computed-vs-sheet difference.
- Export recap that confirms the selected range and row count before download.
- Consistent empty, loading, error, offline/stale, saving, saved, and retry states.

### Deliberately out of scope unless evidence or approval changes

Do not introduce live checkout, inventory management, staff scheduling, forecasting, COGS/profit accounting, or a new payment integration. The inspected product does not provide enough evidence that these are required for this redesign.

## Three visual directions

### Direction 1 — Calm Café Ledger

**Character:** refined version of the existing cream-and-forest palette, editorial hierarchy, strong numbers, restrained borders, and fewer but more purposeful surfaces.

**Pros**

- Preserves recognizable brand continuity.
- Feels approachable for a small café team while still becoming more trustworthy and professional.
- Works well for both the operational close and manager reporting.
- Requires the least disruptive visual transition.

**Cons**

- Needs disciplined contrast and spacing to avoid becoming decorative or low-density.
- Warm neutrals can obscure status hierarchy if semantic colors are not carefully separated.

### Direction 2 — Operations Console

**Character:** cooler neutral canvas, denser tables, stronger status colors, persistent desktop sidebar, compact controls, and a more analytical reporting tone.

**Pros**

- Fast to scan for managers handling many days or categories.
- Strong fit for filters, tables, exception queues, and reconciliation.
- Makes status and data quality prominent.

**Cons**

- Can feel generic and corporate for a café brand.
- Less comfortable for a mobile-first handwritten-sheet close.
- Higher visual and navigation disruption from the current product.

### Direction 3 — Daily Close Companion

**Character:** mobile-first guided close, large touch targets, sticky summary, progressive scanner review, and secondary analytics.

**Pros**

- Best matches the operator’s actual paper-to-app workflow.
- Makes completion state and next action obvious.
- Reduces cognitive load during a time-sensitive close.
- Gives the scanner an appropriate step-by-step review model.

**Cons**

- Requires more restructuring of the current Today experience.
- Desktop reporting can feel secondary unless the responsive layout is carefully balanced.
- Guided steps can become cumbersome if over-applied to simple manual entry.

## Recommended direction

### Calm Café Ledger with Daily Close Companion behavior

Use **Calm Café Ledger** as the visual foundation and borrow the strongest interaction patterns from **Daily Close Companion**.

This is the best fit because it preserves the product’s existing brand equity while aligning the interface to the real high-value task: closing one café day accurately. It improves clarity and trust without pretending that Porcafe POS is a full retail checkout system. The result should feel calm at the start of a shift, focused during entry, and explainable during review.

### Experience principles

1. **Make close the primary job.** The first screen should answer “What needs to be closed?” and “What did we record?”
2. **Make every number explainable.** Pair totals with date range, source, status, and calculation context.
3. **Separate recorded, adjusted, and reported values.** Never hide `selisih` inside a total without a visible explanation.
4. **Use fewer, stronger surfaces.** Let hierarchy, whitespace, and alignment carry the design instead of stacking cards.
5. **Make states explicit.** Loading, empty, failed, stale, saving, saved, draft, complete, and no-sales are product states, not incidental UI details.
6. **Treat scanning as draft plus review.** Preserve the original image and show what will change before commit.
7. **Keep context while acting.** Date, status, summary, save state, and next action should remain visible.
8. **Preserve the existing system boundaries.** Improve the interface first; handle data-source and permission changes as explicit, separately approved work.

## Design-system specification

### Typography

- Primary family: **Inter** or the existing system-compatible equivalent if loading Inter would add unacceptable weight.
- Page title: 28px desktop / 24px mobile, 700 weight, tight line height.
- Section title: 18px, 650–700 weight.
- Card title: 16px, 650 weight.
- Body: 14px–16px, 400–500 weight.
- Helper and metadata: minimum 12px, 500 where it conveys state; avoid 11px for essential content.
- KPI/value: 32px–44px depending on space; use tabular numerals.
- Currency, quantity, and table numbers: `font-variant-numeric: tabular-nums` and right alignment.
- Use sentence case for labels and actions. Reserve uppercase or small caps for short metadata only.

### Color tokens

Use semantic tokens rather than repeating raw hex values in page components.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F7F3EA` | App background |
| `surface` | `#FFFDF9` | Primary working panels |
| `surface-elevated` | `#FFFFFF` | Menus, dialogs, elevated summary |
| `primary` | `#1F3A2F` | Main actions, active navigation |
| `primary-hover` | `#16291F` | Hover/pressed primary |
| `text` | `#18231F` | Main content |
| `text-muted` | `#5E6963` | Secondary content |
| `text-subtle` | `#718078` | Metadata only; verify contrast |
| `border` | `#E3DED3` | Dividers and controls |
| `warm-accent` | `#E9E2D0` | Quiet summaries and selected backgrounds |
| `ember` | `#D86D3E` | Brand accent and attention, used sparingly |
| `success` | `#237A4B` | Complete/success |
| `warning` | `#9A6700` | Needs review / caution |
| `danger` | `#B83A36` | Error/destructive |
| `info` | `#2F6FD6` | Informational state |

Never communicate status by color alone. Pair color with text, icon, shape, or a visible label.

### Spacing and layout

- Base unit: 4px.
- Preferred rhythm: 8, 12, 16, 24, 32, 40px.
- Mobile page padding: 16px.
- Desktop page padding: 24px, with larger top-level gaps only where hierarchy requires them.
- Content max width: 1120–1200px.
- Desktop grids: 12 columns; use a 2/3 + 1/3 split for Daily close.
- Panel radius: 16px; control radius: 10px; use radius consistently.
- Prefer a 1px border and subtle shadow only for elevated surfaces; avoid a shadow on every card.
- Minimum interactive target: 44px where touch is expected; preserve visible focus rings.
- Reserve bottom padding for mobile safe areas: `env(safe-area-inset-bottom)`.

### Surfaces

- Use the cream canvas for navigation between tasks and white/off-white panels for active work.
- Use tinted panels for summaries, warnings, and attention queues.
- Avoid nested white cards inside white cards unless the inner object is independently interactive.
- Use section dividers, alignment, and type scale before adding another container.

### Buttons and actions

- Primary: forest fill, white text, clear verb (`Complete day`, `Save draft`, `Scan sheet`).
- Secondary: white/off-white fill with forest text and border.
- Tertiary: ghost text action for low-risk navigation or reset.
- Destructive: soft danger treatment with explicit confirmation; prefer undo when possible.
- Icon-only controls need an accessible name, tooltip where helpful, and a comfortable hit area.
- Loading buttons preserve their width and communicate whether the action is still in progress.
- Keep one visually dominant action per surface.

### Tables

- Left-align names and categories; right-align quantities and currency.
- Use tabular numerals and a minimum 44px row height.
- Keep headers visible for long tables where feasible.
- On mobile, use a purposeful responsive card/list transformation or horizontal scroll with the primary column sticky; do not squeeze every column into unreadable text.
- Sortable headers need visible affordance and correct `aria-sort`.
- Inline editing must show edit affordance, saving state, saved confirmation, and recovery/undo where feasible.

### Forms

- Use persistent visible labels; placeholders are examples, not labels.
- Group revenue inputs by payment method and show currency context.
- Use 44px controls on mobile and at least 40px on desktop.
- State whether blank means zero; validate negative values, dates, ranges, and missing prices.
- Show field-level errors near the field and a concise summary for a multi-field submission.
- Preserve user input on recoverable errors.
- Show `Saving…`, `Saved just now`, and stale/offline messaging in context.

### Badges and statuses

Use text-first badges with semantic color and, where useful, an icon. Standardize these labels:

- `Not started`
- `Draft`
- `Needs review`
- `Complete`
- `No sales`
- `Manual`
- `Scanned`
- `Archived`
- `Missing price`

### States

Every live panel needs a designed state for:

- Initial loading/skeleton.
- Empty data plus a next action.
- Error plus `Retry` and an explanation.
- Offline or stale data with honest timestamp/context.
- Unsaved changes.
- Saving/in-flight action.
- Saved success.
- Destructive confirmation or undo.
- Disabled/unavailable action with a reason.

Charts and visual summaries need a text summary and an accessible data alternative.

## Detailed redesign specification: Daily close

This is the most important screen because it is the highest-frequency operational task and the strongest opportunity to improve trust.

### Route and naming

Keep `/items` and the existing Today area for route continuity, but present the workspace as **Daily close** in navigation and page copy. Keep Performance, Catalog, and History as secondary areas.

### Header

Desktop and mobile header content:

- Page title: `Daily close`.
- Supporting text: `Record portions and confirm revenue for one operating day.`
- Date control with previous day, next day, and `Today` action.
- Current status badge: Not started, Draft, Needs review, Complete, or No sales.
- Primary action: `Scan sheet`.
- Secondary action: `Open revenue`.

The date is the anchor for every number on the screen. Do not make the user infer which day is active.

### Desktop structure

Use a two-column layout:

- **Main column, approximately two-thirds:** items sold entry.
- **Side column, approximately one-third:** day summary and close actions.

The side summary may be sticky within the page, but must not obscure keyboard focus or table content.

### Items sold panel

Group the catalog into simple sections such as `Main`, `Add-ons`, and `Other` based on existing categories. Each row contains:

- Item name.
- Optional price reference, clearly marked as reference only unless existing business logic already derives revenue from quantities.
- Quantity input with increment/decrement affordances that remain usable by keyboard.
- Missing-price or inactive-item state where applicable.

Use 48–52px row rhythm and 44px inputs. Do not compute new revenue from quantity unless that business rule is explicitly approved; the current system records item quantities and revenue separately.

### Summary panel

Show, in this order:

1. Total portions.
2. Close status.
3. Revenue logged.
4. Payment split: BCA, cash, Soundbox, other.
5. Source: Manual or Scanned.
6. Last saved time.
7. Link/action to open the revenue workspace.

When adjustments are relevant, use a three-line explanation:

- `Recorded sales`
- `Reconciliation adjustment`
- `Reported total`

Never collapse these into one unexplained figure.

### Sticky close actions

Use a clear action bar, sticky on desktop and mobile when appropriate:

- `No sales` — confirm if any values exist; explain that the day will be marked explicitly.
- `Save draft` — allows incomplete work.
- `Complete day` — primary completion action; confirm or explain if required fields or review issues remain.

After a successful action, show `Saved just now` or `Day completed` near the action bar. If a completed day can be edited, say so explicitly and preserve the audit context supported by the existing data model.

### Scanner flow

Keep scanning as an explicit four-step review:

1. `Capture` — upload or camera capture.
2. `Review item matches` — show original image, detected rows, unmatched count, and raw name → matched catalog item.
3. `Review revenue` — show BCA, cash, Nobu/Soundbox, other, computed total, sheet total, and difference.
4. `Confirm` — clearly state what data will be written and whether existing daily data will be replaced or merged.

Show `Needs review` while results are provisional. Surface missing prices, low-confidence matches, and replacement warnings. Preserve the original image and the raw detected value where the current flow supports them.

### Mobile behavior

- Header and date control first.
- Compact summary next, collapsible after the operator understands the status.
- Item groups and quantity controls in a single-column flow.
- Sticky close action above the bottom navigation, with safe-area padding.
- Avoid placing essential helper text below a fixed bar.
- Keep the current date and save status visible while the user scrolls.

### Daily close states

- **Loading:** skeleton header, summary, and item rows; no large empty white void.
- **No catalog:** explain the dependency and link to Catalog.
- **Not started:** empty quantities, clear first action, no false “saved” state.
- **Draft:** show last saved time and incomplete-but-recoverable status.
- **Needs review:** identify the exact unmatched/missing-price/reconciliation issue.
- **Complete:** show source, completion time if available, and an intentional edit path.
- **No sales:** show explicit no-sales status and allow resuming if the operator made a mistake.
- **Load error:** preserve date context, show explanation and Retry.

## Roadmap

### Phase 0 — Data trust and operational safety

Do this before broad visual polish, with explicit approval for any behavior change:

- Define the canonical daily sales identity/aggregation behavior and eliminate duplicate-by-date ambiguity.
- Define the canonical item-log source and reconcile Daily close, Performance, and History.
- Ensure a rescan cannot leave stale rows, or document the approved merge/replace semantics.
- Add resilient loading, error, retry, timeout, and stale/offline states across live panels.
- Add confirmation/undo patterns for deletes and risky edits.
- Make recorded revenue, `selisih`, and reported totals explicit.
- Confirm the authentication/access model and replace open Firestore rules before production exposure.
- Decide API-level auth and rate limiting for `/api/scan-ticket`.

### Phase 1 — Shared visual foundation and Daily close

- Introduce shared design tokens for colors, type, spacing, radii, states, focus, and responsive breakpoints.
- Consolidate shared app shell, navigation, buttons, badges, panels, form fields, table primitives, toasts, and state components.
- Implement the Daily close layout and responsive behavior without changing underlying business rules.
- Implement scanner review hierarchy and clear commit/review states using existing API/data flow.
- Improve accessibility: contrast, focus visibility, labels, `aria-sort`, semantic tabs/content association, chart summaries, keyboard operation, safe-area handling, and locale correctness.

### Phase 2 — Sales and overview clarity

- Redesign `/sales` as a revenue workspace with date context, payment-method grouping, explicit save state, and reconciliation explanation.
- Add safe, evidence-based filters and period summaries.
- Redesign `/` as a concise overview/recap: date range, current status, attention queue, recorded/adjusted/reported totals, and accessible trend summaries.
- Preserve existing exports and integrations.

### Phase 3 — Secondary areas and quality pass

- Unify Performance, Catalog, and History around the canonical source and shared filters.
- Improve mobile table/list behavior, category filtering, search, status visibility, and price completeness.
- Add field validation and recoverable edit/delete patterns.
- Remove repeated raw colors and inconsistent one-off styles.

### Validation scenarios

Before calling the redesign production-ready, verify at minimum:

- Normal manual close.
- No-sales day.
- Draft saved and resumed.
- Complete day and intentional correction.
- Scan with confident matches.
- Scan with unmatched item or missing price.
- Rescan that removes or changes a row.
- Revenue/payment difference and monthly `selisih`.
- Past-date correction.
- Export for a selected range.
- Network failure, timeout, stale cache, and retry.
- Keyboard navigation, screen-reader labels, focus through sticky actions, mobile safe area, and narrow viewport behavior.

Success should mean faster close completion, clear states, no unexplained total disagreement, no accidental data loss, and an understandable answer to “where did this number come from?”

## Model recommendation for implementation

This section is workflow guidance for a future coding session. It does not select or change the model automatically.

### Recommended default

Use **GPT-5.6 Luna at high reasoning** (or the current equivalent cost-optimized coding model exposed in Codex) for most visual implementation work. Luna is designed for cost-sensitive workloads and is substantially cheaper per token than Terra, making it a good fit for isolated screens, shared components, responsive layouts, styling, copy, and accessibility improvements.

Use **Luna xhigh selectively**, not as the blanket default. Reserve it for a bounded UI task that is unusually difficult or still failing after Luna high. Higher reasoning effort can increase reasoning-token usage and latency, so it should earn its extra cost through better results.

### Escalation model

Use **GPT-5.6 Terra at medium or high reasoning** for the hardest implementation slices that cross application boundaries:

- Initial architecture decisions spanning multiple routes.
- Data-source/canonicalization work.
- Authentication, permissions, API security, or financial reconciliation.
- Complex cross-route debugging.
- Scanner commit/replace behavior and other data-integrity changes.

Use **GPT-6 Astra** when the task needs the strongest end-to-end reasoning, especially for final architecture, security, or production-readiness review.

OpenAI’s current guidance positions Astra as the flagship model for the hardest end-to-end reasoning and coding work, and notes that a stronger model can sometimes complete a task with fewer output tokens despite a higher per-token price.

### Luna guardrails

- Use Luna high for one clearly scoped vertical slice at a time.
- Give the agent the relevant acceptance criteria from this document and ask it to inspect the existing implementation before editing.
- Do not delegate business-logic, data-integrity, permission, scanner-commit, or reconciliation changes to Luna without Terra/Astra review.
- Use a smaller model than Luna only for mechanical work such as repetitive token replacement or copy updates.

### If choosing only one model

- **Quality-first:** GPT-6 Astra.
- **Cost-efficient implementation default:** GPT-5.6 Luna at high reasoning.

The practical recommendation for this repository is **Luna high for Phase 1–3 UI work**, Luna xhigh only for difficult bounded UI tasks, **Terra for Phase 0 and cross-cutting logic**, and Astra for optional final review. Verify model availability and current pricing in the Codex/API account before starting because catalog names, limits, and pricing can change.

Official references:

- [OpenAI models overview](https://developers.openai.com/api/docs/models)
- [OpenAI latest-model guidance](https://developers.openai.com/api/docs/guides/latest-model)

### Token-efficient implementation protocol

- Begin every session by reading this file and inspecting only the relevant routes/components.
- State the exact slice being implemented before editing.
- Keep changes vertical and reviewable; avoid broad rewrites.
- Reuse shared primitives and tokens rather than creating page-specific variants.
- Use Luna high for the default UI slice; reserve Luna xhigh for a measured quality need, and use Terra/Astra for cross-cutting or high-risk work.
- Run tests/build/lint appropriate to the changed surface. Do not repeatedly run broad checks without a reason.
- After each slice, compare the running app at desktop and mobile widths and record any remaining risk.

## Safe context reset and next-session prompt

Once this file exists in the repository, it is safe to clear the chat for a fresh implementation session: the important product context is now stored in the project alongside the visual concept image. Clearing chat will remove conversational context, not repository files.

For the next session, use a prompt like:

> Read `AGENTS.md`, `DESIGN_DIRECTION.md`, and view `daily-close-design-concept.png`. Inspect the running app and relevant code before editing. Do not change routes, APIs, permissions, business logic, data flows, or integrations without explicit approval. Start with the approved implementation slice: [name the slice]. Follow the model recommendation and verify current model availability. Show the planned file changes before editing, then implement and verify at desktop and mobile sizes.

Before clearing this current chat, verify that this file and the companion image are present in `/Users/gregorykurnia/projects/porcafe-pos`. Keep the same project directory/worktree when continuing.
