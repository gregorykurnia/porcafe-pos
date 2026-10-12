// A recurring delivery no longer adds stock by itself. On its day it opens a pending order
// that staff confirm when the goods arrive (decision D4, option A). Both the server runner
// and the in-app runner build it here, so they write the same thing.

import type { InventorySupplierOrder, InventoryUnit } from "./types";

export type ScheduledDeliverySource = {
  id: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
  notes?: string;
};

function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Deterministic, so running the same day twice cannot open two orders. */
export function scheduledOrderId(scheduleId: string, runDate: string): string {
  return `scheduled-order-${safePart(scheduleId)}-${safePart(runDate)}`;
}

export function buildScheduledDeliveryOrder(schedule: ScheduledDeliverySource, runDate: string, now: number): InventorySupplierOrder {
  const id = scheduledOrderId(schedule.id, runDate);
  const order: InventorySupplierOrder = {
    id,
    supplierId: schedule.supplierId,
    supplierName: schedule.supplierName,
    orderReference: `SCH-${runDate}-${schedule.id.slice(-4)}`,
    orderedOn: runDate,
    expectedOn: runDate,
    status: "ordered",
    source: "schedule",
    totalCost: 0,
    lines: [
      {
        id: `${id}-line`,
        materialId: schedule.materialId,
        materialName: schedule.materialName,
        unit: schedule.unit,
        quantity: schedule.quantity,
        receivedQuantity: 0,
        unitCost: 0,
        currency: "IDR",
      },
    ],
    history: [{ action: "created", occurredAt: now, summary: "Scheduled delivery, waiting to be confirmed" }],
    createdAt: now,
    updatedAt: now,
  };
  // Firestore rejects undefined fields, so optional values are left out rather than set to undefined.
  if (schedule.notes) order.notes = schedule.notes;
  return order;
}
