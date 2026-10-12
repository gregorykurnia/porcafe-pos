import assert from "node:assert/strict";
import test from "node:test";
import { buildCurrentStockRows, filterCurrentStockRows } from "./current-stock";
import type { InventoryMaterial, InventorySupplierOrder } from "./types";

function material(id: string, name: string, extra: Partial<InventoryMaterial> = {}): InventoryMaterial {
  return { id, name, normalizedName: name.toLowerCase(), type: "raw_ingredient", baseUnit: "g", active: true, reviewStatus: "approved", sourceRefs: [], createdAt: 1, updatedAt: 1, ...extra } as InventoryMaterial;
}

const materials = [
  material("kailan", "Kailan", { reorderThreshold: 5000, lowStockAlertEnabled: true }),
  material("telur", "Telur", { reorderThreshold: 10, lowStockAlertEnabled: true }),
  material("garam", "Garam"),
  material("beras", "Beras", { reorderThreshold: 1000, lowStockAlertEnabled: true }),
];

const openOrders = [
  { id: "o1", orderedOn: "2026-10-08", status: "ordered", lines: [{ id: "l1", materialId: "kailan", quantity: 8000, receivedQuantity: 3000 }] },
] as unknown as InventorySupplierOrder[];

const balances = [
  { materialId: "kailan", materialName: "Kailan", unit: "g", currentQuantity: 2000 },
  { materialId: "telur", materialName: "Telur", unit: "g", currentQuantity: 5 },
  { materialId: "garam", materialName: "Garam", unit: "g", currentQuantity: 500 },
  { materialId: "beras", materialName: "Beras", unit: "g", currentQuantity: 0 },
];

test("rows carry the alert level, what is on order, and a status from the shared model", () => {
  const rows = buildCurrentStockRows({ materials, balances, openOrders });
  const kailan = rows.find((row) => row.materialId === "kailan");
  assert.equal(kailan?.alertAt, 5000);
  assert.equal(kailan?.onOrder, 5000);
  assert.equal(kailan?.status, "on-order");
  assert.equal(rows.find((row) => row.materialId === "garam")?.status, "no-alert-level");
  assert.equal(rows.find((row) => row.materialId === "beras")?.status, "out");
});

test("sorts the most urgent first, then by name", () => {
  const order = buildCurrentStockRows({ materials, balances, openOrders }).map((row) => row.materialId);
  assert.deepEqual(order, ["beras", "telur", "kailan", "garam"]);
});

test("filters by name and by attention group", () => {
  const rows = buildCurrentStockRows({ materials, balances, openOrders });
  assert.deepEqual(filterCurrentStockRows(rows, "tel", "all").map((row) => row.materialId), ["telur"]);
  assert.deepEqual(filterCurrentStockRows(rows, "", "attention").map((row) => row.materialId), ["beras", "telur"]);
  assert.deepEqual(filterCurrentStockRows(rows, "", "other").map((row) => row.materialId), ["garam"]);
  assert.deepEqual(filterCurrentStockRows(rows, "", "on-order").map((row) => row.materialId), ["kailan"]);
  assert.equal(rows.length, 4);
});
