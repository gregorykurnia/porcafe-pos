import type { InventorySupplierOrder, InventorySupplierOrderLine } from "./types";

export type OpenReceipt = {
  order: InventorySupplierOrder;
  line: InventorySupplierOrderLine;
  remaining: number;
};

export function remainingQuantity(line: InventorySupplierOrderLine): number {
  return Math.max(0, line.quantity - line.receivedQuantity);
}

/**
 * Lines still due on open orders for one material, oldest order first. Used to
 * steer a receipt toward the order it belongs to.
 */
export function getOpenReceiptsForMaterial(orders: InventorySupplierOrder[], materialId: string): OpenReceipt[] {
  return orders
    .filter((order) => order.status === "ordered" || order.status === "partially_received")
    .flatMap((order) =>
      order.lines
        .filter((line) => line.materialId === materialId)
        .map((line) => ({ order, line, remaining: remainingQuantity(line) }))
        .filter((receipt) => receipt.remaining > 0)
    )
    .sort((a, b) => a.order.orderedOn.localeCompare(b.order.orderedOn));
}
