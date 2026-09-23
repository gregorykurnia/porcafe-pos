# Suppliers & Ordering Feature Prompt

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
- **Received / Done**
- **Cancelled**

Determine the item status automatically where possible:

- If stock is above the reorder threshold, show **Stock Still High**.
- If stock reaches or falls below the threshold and there is no open order, show **To Order**.
- If an order has been placed but not fully received, show **Ordered / On the Way**.
- If the order has been fully received, show **Received / Done**.
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

Changing an order to **Received / Done** should only add the physically received quantity to inventory.

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

Initially, alerts can be shown inside the application. Structure the feature so email, push, WhatsApp, or other notifications can be added later.

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

Add a way to configure recurring stock additions for an item.

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

When a schedule runs:

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

## Five things to confirm before implementation

### 1. What does “Done” mean?

Recommended: **Done** means the supplier order has been physically received. Inventory should only increase after receipt, not when the order is placed.

### 2. Can one order contain multiple items?

Recommended: yes, as long as all items in that order are being purchased from the same supplier. Orders for different suppliers should be separate.

### 3. What do recurring stock-ins represent?

Should they represent actual scheduled supplier deliveries, or internal/expected stock additions? The answer determines whether the schedule should automatically increase inventory or only create an expected delivery record.

### 4. Where should alerts appear?

Should low-stock alerts initially appear only inside the app, or should they also be sent by email, WhatsApp, push notification, or another channel?

### 5. What units do inventory items use?

Do items have fixed units such as pieces, kilograms, litres, bottles, boxes, or packs? This is important for quantities, costs, reorder levels, and minimum order amounts.

## Recommended initial defaults

If no other preference is specified, use these defaults:

- **Done** means fully received.
- One order can contain multiple items from one supplier.
- Recurring stock-ins automatically increase inventory and create an audit entry.
- Low-stock alerts appear in-app first.
- Each item uses its existing inventory unit, with conversion support deferred unless already available.
