# Content inventory — Charred by Porcafe (Porcafe POS)

Design-neutral inventory of everything the app shows and lets people do, taken from the code on 2026-10-13. It says **what** exists, never how it looks today. Wording in quotes is the current copy, kept so the designer knows the meaning; it can be rewritten.

---

## 1. Product summary

- A back-office tool for one small café (Charred by Porcafe, Indonesia). It is not a checkout terminal: sales happen on paper and payment terminals, and this app records and reviews them afterwards.
- Its centre is the **nightly Daily close**: recording how many portions of each menu item sold and the day's payment totals (Cash, BCA, Soundbox/QRIS, Other), typed by hand or read from a photo of the handwritten tally sheet.
- Around that it has **reports** (revenue, items, weekday patterns, monthly bank reconciliation "selisih"), a **stock module** (on-hand stock, counts, movements, reorder list, supplier orders, deliveries, recipe-based usage) and **setup** (menu, materials, recipes, suppliers, import, notifications, data checks).
- Roles (inferred; there is no sign-in and everyone sees everything): **shift closer / staff** (nightly close, receiving deliveries, weekly stock count), **owner / manager** (reports, reconciliation, ordering, setup), **catalog maintainer** (usually the manager: menu, recipes, suppliers).
- When: close at end of each operating day (daily, ~5–10 min); deliveries when they arrive (several a week); stock count weekly; reports and ordering a few times a week; selisih once a month; setup rarely.
- Devices: a phone (installed to the home screen as an app, used at the counter and for push alerts), a counter tablet, and a Mac for the owner's reviews and setup. Every screen must work on all three.
- Language: interface in English, currency Indonesian Rupiah, supplier messages in Indonesian. Data needs a connection to save; offline the app shows what it has but refuses changes.

---

## 2. Navigation

Five top-level sections, always reachable. Moving between them is guarded when there is unsaved work (see 4.3). A connection notice appears across the app while offline.

| Section | Purpose | Sub-sections |
|---|---|---|
| **Home** | What needs closing today, and the month at a glance | — (single view, with a month choice) |
| **Daily close** | Record and complete one operating day | Daily close · History |
| **Reports** | Revenue, items and weekday patterns for one shared period | Revenue · Items · Weekday patterns |
| **Stock** | Stock on hand, what to order, supplier orders, recipe usage | Stock · To order · Orders · Usage recap |
| **Setup** | Configuration and data checks (manager) | Menu · Materials · Recipes · Suppliers · Import · Notifications · Data maintenance |

Global entry points that cross sections:
- "Scan sheet" is available from Daily close in both its sub-sections.
- Many places link into a specific day of Daily close (from History, from Revenue rows, from Home attention items).
- Links into Reports → Revenue, Setup → Menu, Setup → Data maintenance, Setup → Notifications, Stock → To order, Stock → Orders, Stock → Usage recap.
- The chosen sub-section, the Daily close date and the Reports period are kept in the address, so a reload or a shared link opens the same view.
- A push notification opens Stock.

---

## 3. Screens

### 3.1 Home

**Purpose:** a quick check of what is unfinished, then a summary of the chosen month. **Who / how often:** owner and closer, daily (often the first screen opened).

**Data shown**
- **Needs attention** — a count and a list of items, each leading to the place to fix it. Shows the first 6, with "Show all N" / "Show fewer". Items (with severity):
  - "Today's close has not started" (info)
  - "Today is saved as a draft" (warning)
  - "{date} is still a draft" — any draft in the last 14 days (warning)
  - "{date}: items entered, no revenue recorded" — last 30 days (warning)
  - "{date}: revenue recorded, no items closed" — last 30 days (warning)
  - (The same logic also supports "N materials are below zero" (danger), "N materials are to order", "N scheduled deliveries to confirm"; these are not currently fed on Home.)
  - Empty: "Nothing needs attention. Today and recent days agree."
- **Reporting month** — choose one month (current month plus any month with sales or a selisih). Everything below follows it.
- **Month at a glance**:
  - All-time reported total (Rp) — "Includes selisih"
  - Reported month total (Rp) — sub-note "Recorded sales + selisih" when the month is over, or "Selisih added at month end" while open
  - Portions sold (count)
  - Avg revenue per Main portion (Rp) — month revenue ÷ Main-category portions
  - Best day (Rp, with its date)
  - Best seller (item name, "N sold")
  - Days logged ("logged / days elapsed", e.g. 11 / 13)
- **Revenue composition** for the month: Recorded sales (Rp), Reconciliation adjustment (Rp, or "Pending" while the month is open), Reported total (Rp, emphasised). Explanation line changes with month open/over.
- **Headline figures**, each with comparison where available:
  - Today (Rp) — % change vs yesterday (up/down, good/bad)
  - This week (Rp, with the Monday–Sunday range) — % vs last week
  - Reported month total (Rp, with month name) — % vs the same days of the previous month
  - Avg / day for the selected month (Rp)
  - Portions for the selected month (count)
- **Sales trend** for the month: revenue per day; a one-line "Takeaway" ("Averaging Rp X a day, up/down N% on {compared period}" or "No earlier days to compare yet."). Link "View recap" → Reports → Revenue.
- **Payment mix this month**: per method (BCA, Cash, Soundbox, Other): amount (Rp) and share (%), largest first; methods with zero are omitted.
- **Top items this month** (with total sold): top 5 items, rank, name, "N sold", relative size vs the leader. Link "View recap".
- **Category mix this month**: up to 4 categories plus "Other", each with "N sold" and share (%).

**Actions**
- Open an attention item (goes to the right day/section). Show all / fewer attention items.
- Choose the reporting month.
- Open Daily close; open the revenue recap; open the items recap.
- Retry after a load failure.

**States**
- Loading (figures say "Loading…").
- Load error: "Dashboard data could not be loaded. Your existing view is preserved." + Retry.
- Empty per block: "No sales entries yet", "No sales logged yet", "No item sales logged yet"; missing best day / best seller show "—".
- Month open vs over changes how selisih is described (pending vs included).

---

### 3.2 Daily close → Daily close (record one day)

**Purpose:** enter the portions sold per item and the day's payments, then complete the day. **Who / how often:** closer, every night (plus occasional corrections of past days by the owner).

**Data shown**
- **Close date** — one day, defaulting to today; readable long date ("Monday, 13 Oct 2026"), "Today" marker.
- **Day status**: Not started · Draft · Complete · No sales · Unsaved changes (unsaved edits take precedence over the saved status).
- **Items sold**, grouped by category in the order of the paper sheet (Main, then Add On, then Other for anything else). Per item:
  - name
  - reference price ("Ref. Rp 45.000") or the warning "Missing price reference"
  - quantity sold (whole number; blank or 0 means did not sell)
- **Day summary**:
  - the date
  - Portion split: Main count, Add On count; "All items: N portions" plus "Other: N" if any
  - Payments: total (Rp) and one amount per method — Cash, BCA, Soundbox, Other (Rp)
  - helper: "Leave a method blank for zero. Saved together with the items."
  - Source: Manual or Scanned
  - Last saved: relative time ("just now", "12 min ago", "3 h ago", then date-time) or "Not saved yet"
- **Save status line**: "Saving changes…" / "Unsaved changes" / "Saved for this day" / "Ready to close", plus "Blank or 0 means this item did not sell."

**Actions**
- Change date: previous day, next day, jump to Today, or pick any date (asks first if there is unsaved work).
- Find an item by name (narrows the list only).
- Show only items with a quantity (on/off).
- Per item: decrease by 1 (not below 0), increase by 1, or type the quantity.
- Type each payment amount (Rupiah input, see 4.6).
- **No sales** — mark the day as having no sales. If quantities were entered, confirm first ("Mark this day as no sales? Entered quantities will be cleared.").
- **Save draft** — save without completing.
- **Complete day** — opens the completion review (flow below).
- **Undo** — for 10 seconds after completing, put the day back exactly as it was (including its previous payments and stock effect).
- **Scan sheet** — start the photo flow (3.3).
- Open revenue (→ Reports → Revenue).
- Discard restored entries; Load latest (after a conflict).
- Go to Menu setup (when there are no active items).

**States**
- Loading the day (placeholder rows); a load that takes over 10 s fails with "Loading this day timed out".
- Load error: "Couldn't load this day. Your date is still selected." + Retry.
- Empty: "No active menu items — Add an active menu item in Setup to start logging sales." + link.
- No find matches: "No items match. Clear the find box or the filter."
- **Restored draft**: "Restored unsaved entries from {time}." + Discard them. (Unsaved entries are kept per date in this browser session and survive reload.)
- **Conflict**: "This day was changed on another device — reload to see the latest. Nothing was saved." + Load latest (which, with unsaved entries, confirms "Load the latest saved day? Your unsaved entries for this day will be replaced…").
- Invalid payment: inline "Use digits, for example 1.500.000 or 1,5jt."; saving is refused with the same hint.
- Saving: actions disabled, "Saving…".
- Success messages: "Day saved", "Day completed", "No sales saved".
- After completing, a recap replaces the actions for 10 s: "{date} closed · N portions · Rp X · stock updated / stock unchanged / stock needs review" + Undo ("Undoing…"); success "Completion undone. The day is back as it was."; failure "This day changed after it was completed, so it cannot be undone." or "Could not undo this completion."
- Background stock effects after save: warning "Day saved, but inventory usage needs recipe or mapping review." or "Day saved, but the inventory usage recap could not be refreshed."
- Errors: "Add a menu item first", "Could not save day: …".

**Flow — Complete a day**
1. Enter portions (and payments).
2. Ask to complete → review shows "Complete this day?" with either "No issues found. Completing updates the daily close, the reports and stock usage." or a list of checks to look at. Checks (never blocking):
   - No items entered → "If the day had no sales, mark it as No sales instead."
   - Items but no payments → "Enter the payments, or complete anyway if they are not known yet."
   - Payments differ from items × menu prices by more than 15 % → "Payments are Rp X, but the items come to about Rp Y at menu prices. Check both before completing."
   - N sold items have no price → "…so the estimate is partial."
   - Date is in the future.
   - Day was already completed → "This day was completed at {time} from the sheet / by hand. Completing again replaces it."
3. Confirm ("Complete day", or "Complete anyway" when there are checks) or go Back.
4. Day is saved as Complete; reports and stock usage update; recap with Undo for 10 s.

---

### 3.3 Scan sheet (photo / OCR of the paper tally sheet)

**Purpose:** read the handwritten daily ticket sheet from a photo and save it as the day's close after review. **Who / how often:** closer, most nights (alternative to typing).

**Data shown**
- Photo preview (small) and full-size view with zoom/pan.
- Reading progress: "Reading sheet… m:ss" elapsed, "Counting tally marks usually takes 30–60 seconds."
- **Review**:
  - Date read from the sheet (falls back to today), shown as long date and editable.
  - Notice when that date already has a saved day: "Saving replaces its items and payments, and you will see what changes first."
  - **Items**: one row per sheet line — the text as written on the sheet ("Sheet: Nanban") or "Added by hand"; the matched menu item; the quantity.
    - Row needing a match: "Choose the menu item for this row."
    - Invalid quantity: "Use a whole number."
    - Note when several rows map to one item: "Rows for X, Y were added together."
    - Summary: "N items · N portions · N rows need a match".
    - Empty: "No items detected. Add them by hand."
  - **Payments**: Cash, BCA, Soundbox, Other (Rp), total (or "Check amounts" when unreadable). Under each, what the sheet read: "Sheet reads Rp X" (Cash, BCA), "Nobu on the sheet: Rp X" (Soundbox), "Kept from the saved day" / "Not on the sheet" (Other).

**Actions**
- Take a photo with the camera or choose an image file.
- Cancel a running scan (photo is kept).
- Try again with the same photo; or choose another photo.
- View the full photo.
- Change the date (re-checks whether that date has a saved day).
- Per row: change matched menu item, change quantity, remove row. Add a row by hand.
- Edit any payment.
- **Save day** / **Replace day** (when a saved day exists) — replacing shows a confirmation listing exactly what changes: per item and per payment, Saved → Sheet, with changed values marked and "N values will change" / "No values change."
- Close (asks "Discard this scan? The items and payments you reviewed will be lost." — Discard / Keep reviewing — if anything was edited). Closing is impossible while preparing, reading or saving.
- "Check again" after a conflict.

**States**
- Idle → Preparing the photo → Reading → Review → Saving → closed; or Error → retry / new photo.
- Error messages: cancelled ("Your photo is kept, so you can try again"), photo too large, took too long, no connection, server could not read the sheet, unsupported image format (with iPhone tip to save photos as JPEG).
- Could not check the saved day: "Choose the date again." (saving blocked).
- Conflict: "This day changed on another device. Nothing was saved. Check it again, then review what changes." (saving blocked).
- Saving blocked while any row needs a match; validation messages for whole numbers, nothing to save ("Add at least one item"), unreadable payments.
- Success: "Sheet read. Review before saving." then "Daily close saved from the sheet"; the close screen jumps to that date. Partial-failure warning: "Day saved. The older item rows could not be updated, so check the item history."
- A scanned save is always a Complete day with source "Scanned".

**Flow**
1. Photograph / choose sheet photo.
2. App prepares and reads it (30–60 s, cancellable).
3. Review date, item matches, quantities and payments against the sheet.
4. Fix rows, add missing rows, adjust payments.
5. Save (or Replace after seeing the before/after).
6. Day opens in Daily close.

---

### 3.4 Daily close → History

**Purpose:** look up recorded item sales across days. **Who / how often:** owner, weekly or when checking something.

**Data shown**
- Explanation: read-only ("To change a day, open it in Daily close"), or, while legacy rows exist, "Legacy rows can be edited until their dates are copied into Daily close."
- Notice when legacy-only dates exist: "N dates are still stored only as legacy item rows… Copy them into Daily close in Setup → Data maintenance."
- Per entry: date, item, category, quantity, source (Daily close, or editable legacy row).
- Count: "N entries shown" / "N entries match the current filters".

**Actions**
- Period: All, Day, Week, Month; step previous/next period; jump back to Today. Period label ("Monday, 13 Oct 2026", "Week of …", "October 2026").
- Search by item or category; filter by category; From / To dates; Clear filters.
- Sort by date, item, category, quantity (ascending/descending).
- Export the visible entries to CSV (date, item, category, qty).
- Daily close entry: "Open day" (goes to that date in Daily close).
- Legacy entry (only while legacy dates exist): edit date, item, quantity in place (saves on change; "Saving…" / "Saved"); delete with confirmation ("Delete {item} ({qty})? From {date}. This cannot be undone.").

**States**
- Loading ("Loading history…", "Loading item history…").
- Empty: "No item sales yet" / "No item sales in this period".
- Errors: "Could not refresh item data", "Failed to save sale: …", "Item not found".

---

### 3.5 Reports (shared)

**Purpose:** review performance for one period, shared by all three sub-sections. **Who / how often:** owner, a few times a week; end of month.

**Shared period**
- Choose one of: This month (default), Last month, Last 30 days; or set From / To dates (makes it "Custom range").
- Validation: "The start date must be on or before the end date." (reports hidden until fixed).
- Loading / error ("Couldn't load reports" + Retry) for all sub-sections.
- Date range label used in headings ("Revenue for 1 Oct – 13 Oct 2026").

#### 3.5.1 Reports → Revenue

**Data shown**
- Warning when any date has more than one revenue record: "N dates have more than one revenue record. Review them in Setup → Data maintenance." + link.
- **Totals for the period**: Recorded sales (Rp, "N entries"), Selisih (Rp, with note: "Added for {months}" / "Counts after {month} ends" / "No selisih saved for {months}" / "No whole month in this period, so none is added"), Reported total (Rp, emphasised, "Recorded sales plus selisih"). Note when a month has a selisih but the period covers only part of it (not added).
- **Daily revenue**: Average, Lowest, Highest of closed days (today excluded as in progress; "—" when none); revenue per day over the period (gaps = no revenue recorded); "Takeaway" ("{day} recorded Rp X, up/down N% on {previous day}" or "No closed day with revenue in this period yet.").
- **Monthly reconciliation** (see below).
- **Days in this period** (read-only): per day — date, BCA, Cash, Soundbox, Other, Total (Rp), note; footer "Recorded sales in this period" (Rp).

**Actions**
- Export "Daily rows (with payment split)" CSV (date, bca, cash, soundbox, other, total, note).
- Export "Grouped totals by month" CSV (month, days recorded, recorded, selisih, reported, whole month yes/no).
- Per day: Edit (opens that date in Daily close); Delete revenue entry (confirm "Delete revenue entry? … This cannot be undone.").
- Review duplicates in Setup.

**Monthly reconciliation (selisih)**
- Purpose: record the bank reconciliation difference for one month; counts only after the month ends and only for that month's total, never daily figures.
- Choose month (defaults to the period's last month); amount (plus = bank received more, minus = less); optional note ("e.g. bank fee, transfer delay").
- Shows "Last saved {date-time}" or "Nothing saved for this month yet."
- Action: Save selisih ("Selisih saved" / failure message).
- Frequency: monthly, owner.

**States**: empty "No revenue recorded in this period"; success/failure messages for delete.

#### 3.5.2 Reports → Items

**Data shown**
- Summary: Total portions; Logged days ("Includes explicit no-sales days"); Main portions per selling day (one decimal, with "N selling days with a Main sold" and "Best: {date}, N"); Top item (name, "N portions", or "No data yet").
- **Item detail** for one chosen item (archived items marked "(Archived)"): Total sold, Average / logged day, Sales days, No-sales days, Unlogged days; quantity per day over the period; per day — date, qty, day status: **Sold**, **0 sold** (day closed, item not sold), **No sales** (day marked no sales), **Not logged** (no close for that day); takeaway ("N portions across N logged days, including N no-sales days").
- **Main portions, stepped**: Main portions for one day / week / month, independent of the shared period (it says so).
- **Top sellers** for the period: items ranked by portions; takeaway "{item} leads with N portions."
- **Recap**: portions grouped by day, week or month for all items or one item; takeaway comparing the latest period with the previous one.

**Actions**
- Choose item for detail; export item detail CSV (date, item, qty, status).
- Stepped Main: choose Day/Week/Month, previous/next, back to Today.
- Recap: choose grouping (By day / By week / By month), choose item or All items, export CSV (period, qty).

**States**: "Select an item to see its quantity breakdown."; "No item sales in this period"; "No Main portions in this period".

#### 3.5.3 Reports → Weekday patterns

**Data shown**
- **Sales pattern by weekday** (recorded revenue only; selisih excluded). Metric choice: Average sales (per calendar occurrence), Total sales, Sales entries. Totals: Recorded sales in period, Observed days ("of N calendar days"), Sales entries ("Duplicate records remain visible"). Per weekday (Mon–Sun): selected metric, total, observed days, occurrences, records, share (%).
- **Main portions sold by weekday** (Main items only; Add Ons and no-sales days excluded). Metric: Average Main portions (per selling day), Total Main portions, Item rows. Same per-weekday figures.
- Each has a takeaway ("{weekday} leads at X per …; {weekday} is lowest …"), an "Early signal only" note when fewer than 3 observed days, and a "How to read this" note on how averages are calculated.
- **Top Main item by weekday**: weekday, top item (or "No Main sold"), portions.

**Actions**: choose metric for each pattern.

**States**: empty ("No recorded revenue falls in this period. Try another period, or check Daily close."; "No Main portions …"); unavailable while the connection is restored; invalid range.

---

### 3.6 Stock (shared summary)

**Purpose:** see stock health at a glance. **Who / how often:** closer and owner, several times a week.

- Summary figures: To order (count, warning when > 0), Materials on order, Negative (count, danger when > 0), Last count (date).
- Push status for this device: "Alerts on this phone: On / Off / Blocked / Checking…", with "Turn on" when available → Setup → Notifications. Hidden when the device or server cannot support alerts.
- Each sub-section has its own loading ("Loading inventory section…") and error + Retry. Stock figures can show from a saved copy on this device first, then refresh.
- Due recurring deliveries are created automatically when Stock opens (online only).

#### 3.6.1 Stock → Stock

**Data shown**
- **When opening stock is not set up yet**: "Opening stock required" — opening date; per active material: name, base unit, opening quantity; progress "N of M entered". Empty: "Add active materials in the Materials tab first."
- **Once set up**:
  - Stock status "Initialized" (from opening date), Active materials count, Low / negative count ("At or below zero; warnings only").
  - Warning listing materials at or below zero: "Low or negative stock needs attention … You can keep recording movements while the balance is negative."
  - **Current stock** per material: name, on hand (with unit; negative values flagged), alert level, on order quantity, status. Statuses (in order of urgency): **Negative**, **Out** (zero), **To order** (at/below alert level), **On order** (open supplier order), **OK**, **No alert level**, **Alerts off**, **Not set up**.
  - **Movement audit trail**: per movement — date, material, type, signed quantity with unit (+/−), reason, and source description (e.g. "Recipe use from daily close {date}", "Reversed daily close {date}", "Stock count {date}", "Opening stock {date}", "Scheduled delivery {date}", "Delivery against a supplier order"). Types: Opening balance, Receiving, Waste / spoilage, Manual adjustment, Stock count, Recipe consumption, Reversal, Correction. "Showing N of M movements"; shows 50 at a time.

**Actions**
- Initialize opening stock (every active material needs zero or more; one-time).
- Current stock: search by material; filter All / Needs attention / To order / On order / OK / No alert; per material **Order** (for Negative/Out/To order → starts an order in Orders) and **Count** (jumps to the count form for that material).
- **Record movement**: type (Receive stock, Waste / spoilage, Adjustment +/−), material, date, quantity (in the material's unit), direction (add/remove, for adjustments only; receiving always adds, waste always removes), reason (required), notes. For receiving: quantity pre-filled from the usual order quantity ("Pre-filled from usual order quantity · change if different"), reason defaults "Stock In"; if the material has an open order, offers "Receive against this order" ("{ref} from {supplier} has N unit of X on the way") with "Different delivery? Keep recording it below."
- **Record stock count** (one material): material, counted now (unit), shows system quantity and the difference (+/− and %); reason optional, required when the difference is over 20 %; date is today.
- **Count stock sheet** (many materials at once, see flow).
- Audit trail: filter by type, material, from/to date; Clear filters; Refresh; Show 50 more.

**States**
- Loading "Loading stock ledger…"; error "Could not load stock ledger" + Retry; stale "Showing saved stock data — The live refresh failed" + Retry; "Updating stock from the server…".
- Empty: "No active materials."; "Nothing matches. Clear the search or the filter."; "No movements recorded yet." / "No movements match these filters."
- Validation: choose a material; quantity greater than zero; reason required; count zero or greater; over-20 % difference needs a reason.
- Success: "Opening stock initialized", "Movement recorded", "Stock count recorded", "N counts recorded".

**Flow — Count stock sheet (weekly)**
1. Open the count sheet for today; search materials.
2. For each material counted: enter the count; see system quantity and difference; add a reason when over 20 %.
3. Blank rows are skipped. Entries are kept on this device until saved.
4. Save counts ("N counted").

#### 3.6.2 Stock → To order

**Data shown**
- Figures: Items to order, Orders on the way, Scheduled stock-ins (active schedules), Orders in the last 7 days.
- **Reorder overview** per active material: name and unit, current stock, alert level, gap to alert ("N unit below / above", "At alert level", "No alert level"), order quantity (or "Set a valid order quantity to enable push alerts." when to-order without one), preferred supplier (or "No preferred supplier" / "Archived supplier"), status (To order, On order, OK, No alert level, Alerts off, Not set up).
- Count per status.

**Actions**: filter by status (All + each status, with counts); sort by any field (ascending/descending; default by status); **Create order** for a to-order material (opens Orders with that material, supplier and usual quantity pre-filled).

**States**: "Loading current stock and reorder statuses…"; "No active materials yet."; "No materials match this status."

#### 3.6.3 Stock → Orders (supplier orders and receiving)

**Data shown**
- **Supplier orders** (open first): reference and order date; marker for scheduled deliveries ("Scheduled delivery · waiting to be confirmed"); activity history (count, each event with time and summary); supplier; lines ("Material × qty unit (received N)"); expected date or "No expected date"; received date; total cost (currency + amount); status: **Ordered / On the Way**, **Partially Received**, **Received**, **Cancelled**.
- **Create / edit order**: count of active orders on the way; explanatory note that stock changes only when receipts are recorded.

**Actions**
- Filter by supplier, material, status (Open / On the Way [default], All, each status), ordered from / through dates.
- Per open order: **Edit**, **Receive**, **Arrived as planned** (scheduled deliveries; confirm "{ref} arrived as planned? Stock goes up by: …" → "Record delivery"), **WhatsApp** (opens a pre-written Indonesian order message to the supplier's number; "No WhatsApp number" when none), **Copy text** (order message), **Cancel** (confirm "Cancel {ref}? Any quantities already received will remain in stock." — Cancel order / Keep order).
- **Create order**: supplier (active only; archived marked when editing), order reference (optional, auto-generated otherwise), order date, expected delivery (auto from supplier lead time unless changed), notes; add lines: material (only those linked to the supplier, with unit and price), quantity (pre-filled from usual order quantity); each line shows quantity, unit cost, line total; remove a line. Save ("Create order" / "Save changes"), "Stop editing".
- **Receive**: received date; per line remaining and "received now" (lines fully received are locked); Record receipt / Cancel.

**States / validation**
- Empty: "No supplier orders yet." / "No orders match these filters." / "Add an active supplier before creating an order."
- Choose a supplier first; add at least one material; quantity > 0; material already in this order; valid dates (expected on/after order date); enter a positive quantity for at least one received line; opening stock must be initialized before receiving; cancelled/fully received orders cannot receive; one currency per order.
- Arriving from To order with problems: warnings "No preferred supplier is set…", "preferred supplier is inactive…", "not linked to its preferred supplier…".
- Receive link for a closed order: "That order is no longer open for receiving."
- Editing note: "Received quantities and their cost snapshots stay fixed; you can edit the remaining order."
- Success: "Supplier order created / updated / cancelled", "Supplier order received and stock updated", "Partial receipt recorded and stock updated", "Delivery recorded and stock updated", "Order text copied".

**Flow — Order and receive**
1. From To order (or Stock), create order → supplier, lines, dates.
2. Send to supplier via WhatsApp or copied text.
3. When goods arrive, Receive → enter what arrived, date → stock goes up; partial receipts allowed, repeat until Received.
4. Or cancel the remainder.

#### 3.6.4 Stock → Usage recap

**Purpose:** check how completed days were turned into material usage via recipes, and fix days that need review. **Who / how often:** manager, weekly or after recipe changes.

**Data shown**
- Explanation: days saved from the go-live date (21 Sep 2026) are expanded into material usage; excluded items stay visible but are not deducted.
- Date range (From / To).
- Figures: Days calculated, Recorded portions, Material totals (count), Review issues (with "N review · N with exclusions").
- Per day: date, the day's close status (Draft (not deducted) / Complete / No sales), usage status — **Calculated**, **Calculated with exclusions**, **Needs review**, **No sales**, **Waiting for close** — portions, ingredient line count, issue count.
- **Day detail** (open one day at a time): calculated time; status; issues list ("Review before trusting this day's material usage", each with a source reference); excluded items with portions; per line — menu item, portions, material, usage quantity and unit, recipe path (e.g. "Chicken Nanban → Saus Mentai → Mayo").
- **Material totals** for the range: material, calculated usage with unit.

**Actions**
- Change range; Refresh.
- Open / close a day's detail.
- **Recalculate day** (after menu or recipe changes).
- Exclude an item for this day ("Recipe not ready yet?…"); **Exclude on all N days in range** (bulk; confirm "Exclude {item} on N days?" with the date span and impact; progress "Excluding… n of N"; stops on failure with "Stopped after n of N days").
- Include an excluded item back.

**States**: "Choose a valid date range."; loading; "No usage events in this range — Save a new daily log from the go-live date onward…"; "No calculated material lines yet."; detail "No material lines were produced."; success messages per action ("Day recalculated…", "{item} excluded from this day's material usage.").

---

### 3.7 Setup → Menu

**Purpose:** maintain the menu items used in Daily close and scanning. **Who / how often:** manager, monthly or on menu changes.

**Data shown**
- Count of active items; count of active items missing a price.
- Per item: name, category (Main, Add On), price (Rp; "Missing price"), sheet position within its category, sheet names (other spellings used on the paper sheet, comma-separated), status Active / Archived.

**Actions**
- New item: name (required), category, price (optional) → "Item added".
- Edit name, category, price in place (saves when leaving the field; name cannot be empty).
- Move an item up / down in the sheet order.
- Edit sheet names (saves on leaving the field; "Sheet names saved").
- Archive (confirm "Archive {item}? Archived items disappear from Daily close and scanning. Past sales stay in History.") / Restore.
- Search by item or category; filter by category; filter by status (Active [default], Archived, All).
- Sort by name, category, price.

**States**: "Loading menu catalog…"; "No menu items yet — use New item to create your catalog."; "No items match these filters."; error messages per action.

### 3.8 Setup → Materials

**Purpose:** the raw ingredients and packaging that stock is kept in. **Who / how often:** manager, rarely.

**Data shown**: explanation (name, base unit, review status; set opening stock first); count; per material — name, internal id, type (Raw ingredient / packaging), base unit (grams g, milliliters ml, pieces pcs), review status (Approved / Needs review), status (Active / Archived).

**Actions**
- Add material: name (unique), base unit → "Material added".
- Change unit… — checks where the material is used; if used, "Base unit is locked — {name} has N stock movements, N recipe lines… in g. Create a new material instead."; otherwise choose the new unit and confirm.
- Archive (confirm: "It leaves the stock and ordering lists. Its history is kept and it can be restored.") / Restore.

**States**: loading/error + Retry; "No materials yet. Review the source import or add one above."; "Checking…"; validation (name required, duplicate name).

### 3.9 Setup → Recipes

**Purpose:** define what materials each menu item (and each prepared component) uses, in versions. **Who / how often:** manager, on menu or recipe changes.

**Data shown**
- List of recipe versions: target name, status (**Draft**, **Needs review**, **Active**, **Retired**), version number, target type (Menu item / Prepared component), basis ("Per portion" or "Yield N unit" for batches).
- Editor for one version: target type, target, status, effective-from date; for prepared components: basis (Per portion / Batch with yield), yield quantity and unit.
- Recipe lines: ingredient or component, quantity, unit (g/ml/pcs), source reference (or "Manual") and note, review state (Approved, or needs approval with the reason).

**Actions**
- Create a new recipe; pick a version to edit; New version (copy forward from a saved one).
- Change target, status, effective date, basis, yield.
- Add line, change ingredient/quantity/unit (resets the line to needs review), **Approve** a line (blocked with a reason: choose an ingredient, positive quantity, unit, material must be approved and active, unit must match the material's unit, component needs its own recipe), remove line.
- Save recipe.

**States / validation**: "No recipe versions yet…"; "Choose a version to edit"; "No lines yet."; save errors (target required, active needs an effective date, batch needs yield and unit, menu recipes per portion only, missing mappings, component cycles); unit-mismatch warning; "Recipe version saved"; per-line approval reminder "Save recipe to keep this change." (No unsaved-changes guard here today.)

### 3.10 Setup → Suppliers

**Purpose:** suppliers, their prices per material, reorder settings and recurring deliveries. **Who / how often:** manager, monthly.

**Data shown and actions, by block**
- **Reorder settings** — per active material: name and unit, on hand, alert level, order quantity, preferred supplier (only suppliers linked to the material; "No supplier prices yet. Link a supplier first."), alert on/off. Edits are held until saved together: "N changes not saved" with Discard / Save N changes. Changed materials are marked. Validation per material: alert level ≥ 0; order quantity > 0; alert needs an alert level.
- **Recurring supplier deliveries** — explanation; **Run due now** ("N recurring delivery waiting in Orders to confirm" / "No recurring deliveries are due").
- **Delivery schedules** list: supplier, material and unit, quantity, frequency (Daily, Weekly, Monthly, "Every N days"), next run, time, last run, status Active / Paused; Pause / Resume.
- **Set a recurring delivery**: supplier, linked material, quantity, frequency (custom interval in days), start date, delivery time (default 08:00), end date (optional), notes; Save schedule. Validation: linked material, quantity > 0, whole-day interval, valid dates, end not before start.
- **Supplier master** list: name and address, contact person and phone, status Active / Archived; Edit; Archive (confirm "Archived suppliers can no longer be picked for new orders or delivery schedules. Past orders are kept.") / Restore.
- **Add / edit supplier**: name (unique, required), contact person, phone (used for WhatsApp), email, address, notes; Save / Cancel.
- **Supplier pricing by material** list: material and unit, supplier, cost (currency, amount per unit, effective date, previous prices with their dates), buying details (minimum order, lead time days or "No lead time"), Preferred / Alternate; Edit; Remove link (confirm "Remove {material} from {supplier}? This removes the supplier link with its price … Past orders are kept."). Sort by any field.
- **Link a supplier to a material**: supplier, material, cost per unit, cost effective from, currency (default IDR, three letters), supplier SKU, minimum order quantity, lead time (days), preferred supplier for this material, notes; Link supplier / Save changes / Cancel. Validation: both chosen, cost ≥ 0, minimum > 0, lead time whole days ≥ 0, not already linked.
- **Supplier movement audit**: stock changes caused by supplier orders and scheduled deliveries; filter by material, from / through dates; per movement — date, material, +quantity, supplier/reference, reason and notes, created by (Automated schedule / User), source record.

**States**: loading/error + Retry; empty messages for each list ("No suppliers yet…", "No supplier links yet.", "No recurring delivery schedules yet.", "No supplier stock movements match these filters.", "Add an active supplier and an active material before creating a link.").

### 3.11 Setup → Import (recipe workbook import review)

**Purpose:** one-off, reviewed import of recipe data from a fixed spreadsheet extract ("Rows 1–75 of Kebutuhan Bahan Baku per Porsi"). Never changes stock. **Who / how often:** manager, rarely (setup time).

**Data shown**
- Notice: reviewed source preview only; blank quantities are review issues; packaging and two ignored ingredients excluded; "No inventory deductions".
- Figures: Source rows, Ready after mapping, Source review (count), Excluded by policy.
- **Step 1 — Confirm menu and component targets**: per source group — group id, source label, planned target, status (Approved / Needs review / Map first); for menu groups choose the live menu item (each live item only once: "This menu item is already assigned to another source group."); for components the component id.
- **Step 2 — Confirm material aliases**: per source label — source reference, canonical name, choose an existing material or "Create: {name}".
- **Step 3 — Review source lines** (searchable): source reference and label, recipe target, ingredient mapping (material / prepared component), quantity and unit (with conversion), status (Excluded, Needs review, Approved, Map first) and reason.
- Readiness: "All importable rows are ready…" or "N rows still need review."

**Actions**: map targets and materials; search; **Save mappings** (safe); **Create draft recipes** (blocked until everything is resolved; creates drafts only).

**States**: "Mapping review saved"; "N draft recipe groups saved. No stock usage was created."; errors ("Resolve mapping and source review rows…", "No fully mapped recipe groups are ready to import.").

### 3.12 Setup → Notifications

**Purpose:** turn low-stock push alerts on or off for this device. **Who / how often:** each staff phone, once.

**Data shown**: explanation — when a material enters To order, all opted-in devices get an alert; while it stays, a reminder daily at 7:00 AM WIB. Device state: Checking, Enabled on this device, Ready to enable, Blocked, Not configured on the server, Unsupported browser. iPhone/iPad hint: add to home screen and open from the icon first (iOS 16.4+).

**Actions**: Enable push notifications (asks the device for permission); Disable on this device.

**States**: permission denied message with how to fix; registration failure messages; "Push alerts are enabled / disabled on this device."

### 3.13 Setup → Data maintenance

**Purpose:** checks on stored data; nothing changes without confirmation. **Who / how often:** manager, occasionally.

- **Legacy item sales**: Daily-log dates, Legacy-only dates (warning when > 0), Daily-only dates. **Preview copy** (no changes; "Would copy N dates from N legacy item rows…" or "Nothing to copy…"). **Copy dates into Daily close** (confirm "Copy N legacy dates into Daily close? Existing legacy rows will be kept.").
- **Duplicate sales dates**: "No duplicate dates." or per date — date, "N records for this date", combined amount ("Combined view only"); **Review records** → choose the one record to keep (each shows total, ID type, BCA/Cash/Soundbox/Other, created time); others are permanently removed, amounts are not combined; "Keep selected record" / Cancel.
- **Preferred supplier check** (read-only): per problem — material, supplier, what to check ("The preferred supplier has no supplier link for this material…" / "A supplier link is marked preferred, but the material prefers another supplier…"), or "Every preferred supplier matches its supplier link."
- **Usage**: pointer to Usage recap → Recalculate day after menu/recipe changes; link.

**States**: loading/error + Retry; success/failure per action.

---

## 4. Cross-cutting

### 4.1 Notifications in the app (transient messages)
- Every save, delete and failure gives a short message: success, warning (saved but something needs attention) or error (with the reason). Examples throughout section 3.
- Status lines that stay on screen: unsaved / saving / saved state on Daily close, the 10-second completion recap with Undo, restored-draft notice, conflict notice, offline notice.

### 4.2 Confirmations
- One shared confirmation pattern: title, short explanation, optional detail block (impact list or before/after), confirm and cancel wording per case. Two tones: normal and destructive (destructive puts focus on Cancel).
- Destructive confirmations: delete revenue entry, delete legacy item sale, mark no sales over entered quantities, load latest over unsaved entries, discard a reviewed scan, replace a saved day from a scan, cancel supplier order, remove supplier link, keep one duplicate record.
- Normal confirmations: archive menu item / material / supplier, change a material unit, exclude an item across days, record a planned delivery, copy legacy dates.
- Completing a day has its own review step with non-blocking checks (3.2).

### 4.3 Navigation guard (unsaved work)
- Applies today to Daily close quantities and payments. Triggered by: moving to another section, switching to History, changing the date, browser back/forward, reload or closing the tab.
- Prompt "Unsaved changes — You have unsaved quantities for {date}." with three choices: **Save draft & continue**, **Discard**, **Stay**. If the save fails, the prompt stays.
- Unsaved Daily close entries also survive a reload (per date, per browser session) and are announced when restored.
- Other edit-and-save areas (scan review, reorder settings batch, count sheet) protect their own work: confirm on close, "N changes not saved" with Discard, entries kept on the device.

### 4.4 Concurrency
- Two devices can edit the same day. Saving checks the version; if it changed elsewhere: "This day was changed on another device — reload to see the latest. Nothing was saved." with a way to load the latest. Same for scan saves and Undo.

### 4.5 Offline and PWA
- Installable app (home-screen icon, name "Porcafe POS", standalone). Shell and assets cached; data is not queued offline.
- While offline: a persistent notice "Offline — changes require a connection and are not queued for later."; saves are refused with "You're offline. Connect to save. Nothing was changed."; Stock can show its last saved copy and says when a live refresh failed.

### 4.6 Push notifications
- Low-stock alerts to all opted-in devices when a material newly enters To order: title "Stock Needs Reordering:", body e.g. "Order 2.000 g of Chicken from {supplier}. Current stock: 350 g." (or "Preferred supplier not set."). Daily reminder at 07:00 WIB while it stays to order. Tapping opens Stock.
- Requires a valid order quantity; To order list says so when missing.
- Device status shown in Stock and managed in Setup → Notifications.

### 4.7 Money input and formats
- Currency: Indonesian Rupiah, shown as "Rp 1.500.000" (dot thousands, no decimals).
- Money fields: prefixed Rp; digits group as you type (1500 → 1.500); accept shorthand "1,5jt", "150rb", "150k"; normalise on leaving the field; blank = zero; unreadable values flagged inline ("Use digits, for example 1.500.000 or 1,5jt.") and never saved.
- Other money values: supplier unit cost and selisih (plus/minus) are plain numbers; supplier currency code (default IDR).

### 4.8 Quantity input
- Menu portions: whole numbers ≥ 0, with −1 / +1 steps and typing; blank = 0.
- Material quantities: decimals allowed (comma or dot), always with the material's unit (g, ml, pcs); shown with up to 2 decimals, Indonesian grouping; signed (+/−) for movements and count differences.

### 4.9 Dates and periods
- Display: long dates "Monday, 13 Oct 2026"; short "Monday, 13 Oct"; weeks "Week of Monday, 6 Oct – Sunday, 12 Oct" (Monday start); months "October 2026"; times "HH:mm"; relative "12 min ago".
- **Date stepper** (Daily close): previous day, next day, Today, pick a date; shows "Today" and optionally "Future date"; asks before moving when there is unsaved work.
- **Period selector** (Reports): presets This month / Last month / Last 30 days, or custom From–To; start must not be after end.
- **Period stepping** (History, stepped Main portions): choose Day / Week / Month, step previous/next, back to Today.
- Date range filters (From/To) in History, audit trails, supplier orders, usage recap.
- Single-month choice (Home, Monthly reconciliation).

### 4.10 Diffs and history
- Before/after comparison when overwriting a saved day from a scan: per field Saved vs Sheet, changed values marked, count of changes.
- Records that keep history: stock movement audit trail (every change with source); supplier movement audit; supplier order activity log; supplier price history; recipe versions; "last saved" times on days and selisih; day source (Manual / Scanned).

### 4.11 Exports
- CSV downloads: item history; revenue daily rows; revenue grouped by month; item detail; items recap.

### 4.12 Shared vocabulary (one meaning each)
Daily close · Portions · Payments (Cash, BCA, Soundbox = QRIS/Nobu terminal, Other) · Sheet (paper ticket sheet) · Selisih (monthly bank reconciliation difference, counts once the month is over) · Recorded sales vs Reported total (recorded + selisih) · Main / Add On (item categories) · To order · On order · Stock count · Alert level · Order quantity · Preferred supplier · Usage (recipe-based material consumption) · Exclusion · Legacy rows (pre-Daily-close item records).

### 4.13 Status sets the design must express consistently
- Day close: Not started, Draft, Complete, No sales, Unsaved changes.
- Item day status: Sold, 0 sold, No sales, Not logged.
- Stock: Negative, Out, To order, On order, OK, No alert level, Alerts off, Not set up.
- Supplier order: Ordered / On the Way, Partially Received, Received, Cancelled (+ scheduled "waiting to be confirmed").
- Recipe: Draft, Needs review, Active, Retired. Review: Approved, Needs review.
- Usage day: Calculated, Calculated with exclusions, Needs review, No sales, Waiting for close.
- Import row: Excluded, Needs review, Approved, Map first.
- Active / Archived (menu items, materials, suppliers); Active / Paused (schedules); Preferred / Alternate (supplier links).
- Push: On, Off, Blocked, Checking, unavailable.
- Severity of attention items: info, warning, danger.
