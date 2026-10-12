import { getInventoryReorderStatus, type InventoryReorderStatus } from "./reorder-status";
import type { InventoryMaterial } from "./types";

// One definition of a material's stock status, for the stock table, the to-order list, the
// dashboard and push copy. It wraps getInventoryReorderStatus, which push logic also uses.

export type StockStatus =
  | "negative"
  | "out"
  | "to-order"
  | "on-order"
  | "ok"
  | "no-alert-level"
  | "alerts-off"
  | "not-initialized";

export type StockTone = "danger" | "warning" | "info" | "success" | "neutral";

/** Lower rank = needs attention sooner. Used to sort the stock table. */
export const STOCK_STATUS_META: Record<StockStatus, { label: string; tone: StockTone; rank: number }> = {
  negative: { label: "Negative", tone: "danger", rank: 1 },
  out: { label: "Out", tone: "danger", rank: 2 },
  "to-order": { label: "To order", tone: "warning", rank: 3 },
  "on-order": { label: "On order", tone: "info", rank: 4 },
  ok: { label: "OK", tone: "success", rank: 5 },
  "no-alert-level": { label: "No alert level", tone: "neutral", rank: 6 },
  "alerts-off": { label: "Alerts off", tone: "neutral", rank: 7 },
  "not-initialized": { label: "Not set up", tone: "neutral", rank: 8 },
};

const FROM_REORDER: Record<InventoryReorderStatus, StockStatus> = {
  "on-way": "on-order",
  "to-order": "to-order",
  "stock-high": "ok",
  "not-configured": "no-alert-level",
  "alerts-off": "alerts-off",
  "not-initialized": "not-initialized",
};

// The stock status for a reorder state. Screens that list by reorder state use the stock labels,
// so one material reads the same on every screen.
export function stockStatusFromReorder(reorder: InventoryReorderStatus): StockStatus {
  return FROM_REORDER[reorder];
}

export function getStockStatus(
  material: InventoryMaterial,
  currentQuantity: number | null | undefined,
  options: { initialized: boolean; hasOpenOrder: boolean }
): StockStatus {
  const reorder = getInventoryReorderStatus(material, currentQuantity, options.initialized, options.hasOpenOrder);
  if (reorder === "not-initialized") return "not-initialized";
  // Negative and out depend on the quantity alone, so they show even without an alert level.
  const quantity = currentQuantity ?? 0;
  if (quantity < 0) return "negative";
  if (quantity === 0) return "out";
  return FROM_REORDER[reorder];
}
