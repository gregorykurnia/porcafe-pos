# Suppliers & Ordering Feature Prompt

## Current implementation status

This document is now also the launch checklist. The current implementation is a working first version, but it does **not** yet cover every item in the original prompt.

### Implemented

- Supplier master records: add, edit, archive, restore, and view.
- Multiple suppliers per inventory material.
- Supplier-material details: current unit cost, currency, SKU, minimum order quantity, lead time, preferred supplier, and notes.
- Cost history with effective dates. Orders continue to snapshot the unit cost at placement.
- Per-material reorder threshold, suggested reorder quantity, preferred supplier, and low-stock alert toggle.
- In-app **Stock Still High**, **To Order**, and **Ordered / On the Way** indicators.
- Supplier orders containing multiple materials from one supplier.
- Order reference, expected delivery date, notes, quantity, cost snapshot, total cost, and order history.
- Order-history filters by supplier, material, status, and order date range.
- Editing open orders and cancelling ordered or partially received orders. Received quantities and their cost snapshots are protected during edits.
- Partial and full receiving.
- Receiving updates inventory only after stock is received.
- Receiving creates linked inventory movements with supplier/order references and idempotency protection.
- **Received** status after all ordered stock arrives.
- Recurring supplier delivery schedules: daily, weekly, monthly, and custom day intervals.
- Scheduled deliveries create stock-in movements and system-generated audit references.
- Expanded supplier movement audit with source references and user-versus-schedule attribution.
- Protected Firebase Admin runner and per-schedule execution times for hosted background scheduling.
- Existing inventory units are reused.
- Low-stock alerts are currently in-app only.

### Not yet implemented

- Deployment registration for the background scheduler. A protected Firebase Admin runner and execution-time support are implemented in code, but the hosting cron and server credentials must be configured.
- Server-side authentication, authorization, and role-based permissions for supplier/order actions. The current app uses the existing client-side Firestore pattern.
- Multiple warehouse or storage-location support.

The movement records identify that a receipt was user-recorded, but cannot name the individual until the app has an authenticated user identity.

### Launch readiness

The current version is suitable for a controlled pilot. Before calling the feature production-ready, decide whether these are launch blockers:

1. Configure the protected hosted runner with `CRON_SECRET` and Firebase Admin credentials. The Vercel setup and frequency constraints are documented in [SUPPLIERS_ORDERING_DEPLOYMENT.md](SUPPLIERS_ORDERING_DEPLOYMENT.md).
2. Select an authentication provider and permission model for supplier management, ordering, receiving, and reorder settings.
3. Decide whether inventory needs multiple locations. Sales usage currently has no location field, so per-location consumption and reorder thresholds need a defined ownership rule.
4. Individual user attribution in the movement audit depends on the authentication decision.

## Implementation prompt

Add a new **Suppliers & Ordering** subtab under **Inventory** in the existing POS system.

Before implementing anything, inspect the existing Inventory, item/product, stock movement, record movement, movement audit trail, authentication, permissions, and UI patterns. Reuse the existing architecture, data conventions, validation patterns, and components.

### 1. Supplier management

Create a supplier section where users can:

- Add, edit, archive, and view suppliers.
- Store supplier name, contact person, phone, email, address, notes, and active/inactive status.
- Link multiple suppliers to the same inventory item.
- Mark one supplier as the preferred supplier for an item.

### 2. Supplier-item details

For every supplier linked to an item, store:

- Supplier.
- Cost per unit.
- Currency.
- Supplier SKU or code, if applicable.
- Minimum order quantity.
- Typical lead time.
- Preferred supplier status.
- Notes.
- Cost history or effective date where practical.

The item view should show current stock, supplier, cost per unit, preferred supplier, reorder threshold, reorder quantity, and current ordering status.

### 3. Stock and ordering statuses

Use clear statuses such as:

- **Stock Still High**
- **To Order**
- **Ordered / On the Way**
- **Partially Received**
- **Received**
- **Cancelled**

Determine the item status automatically where possible:

- If stock is above the reorder threshold, show **Stock Still High**.
- If stock reaches or falls below the threshold and there is no open order, show **To Order**.
- If an order has been placed but not fully received, show **Ordered / On the Way**.
- If the order has been fully received, show **Received**.
- After receiving stock, recalculate the item status based on the new stock level.

Allow users to manually create an order from the **To Order** state.

### 4. Supplier orders

Users should be able to create an order for a supplier containing one or more item lines.

Each order should support:

- Supplier.
- Order date.
- Expected delivery date.
- Order status.
- Notes.
- Order reference number.
- Multiple item lines.
- Ordered quantity.
- Unit cost snapshot at the time of ordering.
- Total cost.
- Received quantity.
- Partial receiving.
- Remaining quantity.

Changing an order to **Received** should only add the physically received quantity to inventory.

### 5. Record movement and audit trail integration

When supplier stock is received:

- Automatically create a stock-in record movement.
- Include item, quantity, unit, supplier, order reference, date, and reason.
- Update the item’s stock balance.
- Add an entry to the movement audit trail.
- Record who or what created the movement, including whether it was a user or automated schedule.
- Prevent duplicate stock movements if the same order receipt is submitted twice.

Placing an order should create an ordering history or audit entry, but should not increase inventory until stock is received.

### 6. Reorder settings

Add item-level settings for:

- Reorder threshold or minimum stock level.
- Suggested reorder quantity.
- Preferred supplier.
- Low-stock alert enabled or disabled.
- Optional supplier lead time.
- Optional minimum order quantity.

When current stock reaches the threshold, the item should appear in the **To Order** list.

For now, show low-stock alerts inside the application only. Structure the feature so email, push, WhatsApp, or other notifications can be added later.

### 7. Ordering history

Create a historical view showing all supplier orders, including:

- Supplier.
- Items.
- Ordered quantity.
- Received quantity.
- Unit cost.
- Total cost.
- Order date.
- Expected date.
- Received date.
- Current status.
- Order reference.
- Related stock movement.

Include filters for supplier, item, status, and date range.

### 8. Recurring stock-in schedules

Add a way to configure recurring supplier deliveries for an item. These schedules represent deliveries that are expected to be received on a recurring basis.

Each schedule should support:

- Item.
- Quantity.
- Unit.
- Frequency: daily, weekly, monthly, or custom.
- Start date.
- Optional end date.
- Time of execution.
- Active/inactive status.
- Optional supplier or source.
- Notes.

When a scheduled supplier delivery is received:

- Automatically add the configured quantity to stock.
- Create a stock-in movement.
- Add an entry to the movement audit trail.
- Mark the movement as system-generated.
- Update the next scheduled run.
- Prevent duplicate execution for the same schedule and period.

Use the application’s existing timezone conventions.

### 9. User interface

Add the feature as an Inventory subtab named **Suppliers & Ordering**, or another clear equivalent.

Include:

- Overview cards for items to order, items on the way, scheduled stock-ins, and recent orders.
- Supplier list.
- Item-supplier management.
- **To Order** list.
- Active orders list.
- Ordering history.
- Reorder settings.
- Recurring stock-in schedules.
- Item detail views showing stock, suppliers, reorder settings, order status, and history.

Follow the existing design system and permissions model.

### 10. Validation and acceptance criteria

Ensure that:

- An item can have multiple suppliers.
- A supplier can provide multiple items.
- Stock is not increased when an order is merely placed.
- Stock is increased when stock is received.
- Partial receipts work correctly.
- Reorder alerts do not create duplicate orders automatically.
- Recurring schedules do not execute twice for the same period.
- Every stock change is represented in the movement audit trail.
- Historical order records remain available even if a supplier is archived.
- All changes are validated server-side and tested.

Before implementation, provide a brief plan covering the proposed data model, user flow, stock movement behavior, edge cases, and any assumptions that need approval.

## Confirmed decisions

### 1. “Received” means stock has physically arrived

Use **Received** as the status name. Inventory should only increase after the supplier order has physically arrived, not when the order is placed.

### 2. One order can contain multiple items

One order can contain multiple items as long as they are being purchased from the same supplier. Orders for different suppliers should be separate.

### 3. Recurring stock-ins represent supplier deliveries

Recurring schedules represent supplier deliveries. When the scheduled delivery is received, automatically add the received quantity to inventory and create the corresponding stock movement and audit entry.

### 4. Low-stock alerts are in-app only for now

Display low-stock alerts inside the application only for the initial version. Keep the design extensible for future email, WhatsApp, or push notifications.

### 5. Use the existing inventory units

Use the units already stored in the inventory database, including units such as pieces, kilograms, litres, bottles, boxes, or packs where applicable. Do not introduce a separate unit system unless the existing data model requires it.

## Additional decisions to consider

These are not blockers, but should be decided during the implementation plan if the existing system does not already define them:

- **Open:** whether users need a separate **Draft** or **Placed** order status before **Ordered / On the Way**. The current UI creates orders directly as **Ordered / On the Way**.
- **Implemented:** supplier deliveries can be received partially across multiple receiving events.
- **Default implemented:** missed recurring deliveries are skipped and the schedule advances to the next future run; they are not backfilled automatically.
- **Default implemented:** manual supplier orders require a user to confirm receipt; recurring schedules automatically mark their due delivery as received when the schedule runner executes.
- **Open:** which roles are allowed to manage suppliers, create orders, receive stock, and edit reorder settings.
- **Open:** whether the system supports multiple storage locations or warehouses, which may require thresholds and stock movements per location.
