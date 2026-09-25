import assert from "node:assert/strict";
import test from "node:test";
import {
  getReorderNotificationMessage,
  getInventoryReorderStatus,
  isReorderReminderDue,
  shouldSendInitialReorderAlert,
} from "./reorder-status";
import type { InventoryMaterial } from "./types";

const material: InventoryMaterial = {
  id: "chicken",
  name: "Chicken",
  normalizedName: "chicken",
  type: "raw_ingredient",
  baseUnit: "g",
  active: true,
  reviewStatus: "approved",
  sourceRefs: [],
  reorderThreshold: 500,
  reorderQuantity: 1000,
  lowStockAlertEnabled: true,
  createdAt: 1,
  updatedAt: 1,
};

test("uses the same stock and supplier-order rules as the reorder UI", () => {
  assert.equal(getInventoryReorderStatus(material, 500, true, false), "to-order");
  assert.equal(getInventoryReorderStatus(material, 501, true, false), "stock-high");
  assert.equal(getInventoryReorderStatus({ ...material, lowStockAlertEnabled: false }, 100, true, false), "alerts-off");
  assert.equal(getInventoryReorderStatus(material, 100, true, true), "on-way");
  assert.equal(getInventoryReorderStatus(material, 100, false, false), "not-initialized");
  assert.equal(getInventoryReorderStatus({ ...material, reorderThreshold: undefined }, 100, true, false), "not-configured");
});

test("initial alerts only claim a new To Order transition with a fresh key and valid quantity", () => {
  assert.equal(shouldSendInitialReorderAlert("stock-high", "to-order", "2026-09-24:chicken:100", null, true), true);
  assert.equal(shouldSendInitialReorderAlert("to-order", "to-order", "2026-09-24:chicken:100", null, true), false);
  assert.equal(shouldSendInitialReorderAlert("stock-high", "stock-high", "2026-09-24:chicken:100", null, true), false);
  assert.equal(shouldSendInitialReorderAlert("stock-high", "to-order", "2026-09-24:chicken:100", "2026-09-24:chicken:100", true), false);
  assert.equal(shouldSendInitialReorderAlert("stock-high", "to-order", "2026-09-24:chicken:100", null, false), false);
});

test("notification copy includes reorder quantity, preferred supplier, and current stock", () => {
  assert.equal(
    getReorderNotificationMessage({ ...material, preferredSupplierId: "supplier-1" }, 500, "Fresh Foods"),
    "Order 1.000 g of Chicken from Fresh Foods. Current stock: 500 g.",
  );
  assert.equal(
    getReorderNotificationMessage({ ...material, reorderQuantity: 5 }, 12.5),
    "Order 5 g of Chicken. Preferred supplier not set. Current stock: 12,5 g.",
  );
  assert.equal(
    getReorderNotificationMessage({ ...material, preferredSupplierId: "deleted-supplier" }, 500),
    "Order 1.000 g of Chicken from Archived supplier. Current stock: 500 g.",
  );
});

test("notification copy skips invalid quantity, stock, name, and unit setup", () => {
  assert.equal(getReorderNotificationMessage(material, undefined), null);
  assert.equal(getReorderNotificationMessage(material, Number.NaN), null);
  assert.equal(getReorderNotificationMessage({ ...material, reorderQuantity: undefined }, 500), null);
  assert.equal(getReorderNotificationMessage({ ...material, reorderQuantity: 0 }, 500), null);
  assert.equal(getReorderNotificationMessage({ ...material, reorderQuantity: Number.NaN }, 500), null);
  assert.equal(getReorderNotificationMessage({ ...material, name: " " }, 500), null);
  assert.equal(getReorderNotificationMessage({ ...material, baseUnit: "kg" as InventoryMaterial["baseUnit"] }, 500), null);
});

test("reminder claims are due only after their start date and once per WIB date", () => {
  assert.equal(isReorderReminderDue({ active: true, date: "2026-09-25", firstReminderOn: "2026-09-25", claimedReminderDate: null }), true);
  assert.equal(isReorderReminderDue({ active: true, date: "2026-09-25", firstReminderOn: "2026-09-26", claimedReminderDate: null }), false);
  assert.equal(isReorderReminderDue({ active: true, date: "2026-09-25", firstReminderOn: "2026-09-24", claimedReminderDate: "2026-09-25" }), false);
  assert.equal(isReorderReminderDue({ active: false, date: "2026-09-25", firstReminderOn: "2026-09-24", claimedReminderDate: null }), false);
});
