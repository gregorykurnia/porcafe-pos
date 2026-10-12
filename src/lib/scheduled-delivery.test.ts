import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduledDeliveryOrder, scheduledOrderId } from "./scheduled-delivery";

const schedule = {
  id: "sch-kailan-sumber",
  supplierId: "sumber",
  supplierName: "Sumber Segar",
  materialId: "kailan",
  materialName: "Kailan",
  unit: "g" as const,
  quantity: 2000,
};

test("the order id is the same for the same schedule and day", () => {
  assert.equal(scheduledOrderId(schedule.id, "2026-10-12"), scheduledOrderId(schedule.id, "2026-10-12"));
  assert.notEqual(scheduledOrderId(schedule.id, "2026-10-12"), scheduledOrderId(schedule.id, "2026-10-13"));
  assert.match(scheduledOrderId("a/b", "2026-10-12"), /^scheduled-order-a_b-2026-10-12$/);
});

test("a due delivery opens a pending order, not stock: status ordered, source schedule, no receipts", () => {
  const order = buildScheduledDeliveryOrder(schedule, "2026-10-12", 1_700_000_000_000);
  assert.equal(order.status, "ordered");
  assert.equal(order.source, "schedule");
  assert.equal(order.orderedOn, "2026-10-12");
  assert.equal(order.expectedOn, "2026-10-12");
  assert.deepEqual(order.lines.map((line) => [line.materialId, line.quantity, line.receivedQuantity]), [["kailan", 2000, 0]]);
  assert.equal(order.history?.[0].action, "created");
});

test("writes no undefined fields, which the database would reject", () => {
  const order = buildScheduledDeliveryOrder(schedule, "2026-10-12", 1);
  assert.equal(Object.values(order).some((value) => value === undefined), false);
  assert.equal("notes" in order, false);
  const withNotes = buildScheduledDeliveryOrder({ ...schedule, notes: "Pagi" }, "2026-10-12", 1);
  assert.equal(withNotes.notes, "Pagi");
});
