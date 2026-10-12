import { getOpenReceiptsForMaterial, remainingQuantity } from "./open-receipts";
import { getStockStatus, STOCK_STATUS_META, type StockStatus } from "./stock-status";
import type { InventoryMaterial, InventorySupplierOrder } from "./types";

// Rows for the Current stock table: what is on hand, the alert level, what is already on
// order, and the one status that drives the action.

export type CurrentStockRow = {
  materialId: string;
  name: string;
  unit: string;
  onHand: number | null;
  alertAt: number | null;
  onOrder: number;
  hasOpenOrder: boolean;
  status: StockStatus;
};

export type CurrentStockFilter = "all" | "attention" | "to-order" | "on-order" | "ok" | "other";

const ATTENTION: StockStatus[] = ["negative", "out", "to-order"];
const OTHER: StockStatus[] = ["no-alert-level", "alerts-off", "not-initialized"];

export function buildCurrentStockRows(input: {
  materials: InventoryMaterial[];
  balances: { materialId: string; materialName: string; unit: string; currentQuantity: number | null }[];
  openOrders: InventorySupplierOrder[];
}): CurrentStockRow[] {
  const materialById = new Map(input.materials.map((material) => [material.id, material]));
  const rows = input.balances.map((balance): CurrentStockRow => {
    const material = materialById.get(balance.materialId);
    const receipts = getOpenReceiptsForMaterial(input.openOrders, balance.materialId);
    const hasOpenOrder = receipts.length > 0;
    const onOrder = receipts.reduce((total, receipt) => total + remainingQuantity(receipt.line), 0);
    const status = material
      ? getStockStatus(material, balance.currentQuantity, { initialized: true, hasOpenOrder })
      : "not-initialized";
    return {
      materialId: balance.materialId,
      name: balance.materialName,
      unit: balance.unit,
      onHand: balance.currentQuantity,
      alertAt: material?.reorderThreshold ?? null,
      onOrder,
      hasOpenOrder,
      status,
    };
  });
  return rows.sort((a, b) => STOCK_STATUS_META[a.status].rank - STOCK_STATUS_META[b.status].rank || a.name.localeCompare(b.name));
}

export function filterCurrentStockRows(rows: CurrentStockRow[], query: string, filter: CurrentStockFilter): CurrentStockRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false;
    switch (filter) {
      case "attention": return ATTENTION.includes(row.status);
      case "to-order": return row.status === "to-order";
      case "on-order": return row.status === "on-order";
      case "ok": return row.status === "ok";
      case "other": return OTHER.includes(row.status);
      default: return true;
    }
  });
}
