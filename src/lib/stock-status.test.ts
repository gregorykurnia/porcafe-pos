import assert from "node:assert/strict";
import test from "node:test";
import { getStockStatus, STOCK_STATUS_META } from "./stock-status";
import type { InventoryMaterial } from "./types";

const configured: InventoryMaterial = {
  id: "kailan",
  name: "Kailan",
  normalizedName: "kailan",
  type: "raw_ingredient",
  baseUnit: "g",
  active: true,
  reviewStatus: "approved",
  sourceRefs: [],
  reorderThreshold: 5000,
  lowStockAlertEnabled: true,
  createdAt: 1,
  updatedAt: 1,
} as InventoryMaterial;

const noAlertLevel = { ...configured, reorderThreshold: undefined } as InventoryMaterial;
const alertsOff = { ...configured, lowStockAlertEnabled: false } as InventoryMaterial;
const on = { initialized: true, hasOpenOrder: false };

test("a material with no stock setup is Not set up, whatever its quantity", () => {
  assert.equal(getStockStatus(configured, 100, { initialized: false, hasOpenOrder: false }), "not-initialized");
  assert.equal(getStockStatus(configured, null, on), "not-initialized");
});

test("a negative balance is Negative, and zero is Out, even when no alert is configured", () => {
  assert.equal(getStockStatus(configured, -3, on), "negative");
  assert.equal(getStockStatus(noAlertLevel, 0, on), "out");
  assert.equal(getStockStatus(configured, 0, { initialized: true, hasOpenOrder: true }), "out");
});

test("at or below the alert level is To order; above it is OK", () => {
  assert.equal(getStockStatus(configured, 5000, on), "to-order");
  assert.equal(getStockStatus(configured, 5001, on), "ok");
});

test("an open order makes it On order, unless it is out or negative", () => {
  assert.equal(getStockStatus(configured, 2000, { initialized: true, hasOpenOrder: true }), "on-order");
  assert.equal(getStockStatus(configured, -1, { initialized: true, hasOpenOrder: true }), "negative");
});

test("a material without an alert level or with alerts off says so", () => {
  assert.equal(getStockStatus(noAlertLevel, 200, on), "no-alert-level");
  assert.equal(getStockStatus(alertsOff, 200, on), "alerts-off");
});

test("every status has a label and a rank, and ranks are unique", () => {
  const ranks = Object.values(STOCK_STATUS_META).map((meta) => meta.rank);
  assert.equal(new Set(ranks).size, ranks.length);
  assert.equal(STOCK_STATUS_META["to-order"].label, "To order");
  assert.equal(STOCK_STATUS_META["not-initialized"].label, "Not set up");
});
