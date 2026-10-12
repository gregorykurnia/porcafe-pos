import assert from "node:assert/strict";
import test from "node:test";
import { getOpenReceiptsForMaterial, remainingQuantity } from "./open-receipts";
import type { InventorySupplierOrder, InventorySupplierOrderLine } from "./types";

function line(id: string, materialId: string, quantity: number, receivedQuantity = 0): InventorySupplierOrderLine {
  return { id, materialId, materialName: materialId, unit: "g", quantity, receivedQuantity, unitCost: 1, currency: "IDR" };
}

function order(id: string, orderedOn: string, status: InventorySupplierOrder["status"], lines: InventorySupplierOrderLine[]): InventorySupplierOrder {
  return {
    id,
    supplierId: "sumber",
    supplierName: "Sumber Segar",
    orderReference: `PO-${id}`,
    orderedOn,
    status,
    totalCost: 0,
    lines,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("remaining quantity never goes below zero", () => {
  assert.equal(remainingQuantity(line("a", "kailan", 5, 2)), 3);
  assert.equal(remainingQuantity(line("a", "kailan", 5, 9)), 0);
});

test("lists only open lines for the material with something still due, oldest first", () => {
  const orders = [
    order("2", "2026-10-10", "partially_received", [line("l2", "kailan", 4, 1), line("l3", "telur", 2)]),
    order("1", "2026-10-08", "ordered", [line("l1", "kailan", 5)]),
    order("3", "2026-10-01", "received", [line("l4", "kailan", 9, 9)]),
    order("4", "2026-10-02", "cancelled", [line("l5", "kailan", 3)]),
    order("5", "2026-10-09", "ordered", [line("l6", "kailan", 2, 2)]),
  ];

  const receipts = getOpenReceiptsForMaterial(orders, "kailan");
  assert.deepEqual(
    receipts.map((receipt) => [receipt.order.id, receipt.line.id, receipt.remaining]),
    [
      ["1", "l1", 5],
      ["2", "l2", 3],
    ]
  );
});

test("returns nothing when no open order carries the material", () => {
  assert.deepEqual(getOpenReceiptsForMaterial([order("1", "2026-10-08", "ordered", [line("l1", "telur", 5)])], "kailan"), []);
});
