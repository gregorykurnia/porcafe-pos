// One mapping from each domain status to the label and tone it shows. StatusBadge renders these,
// so a status reads the same on every screen. The labels are the ones the screens already show.
// Changing the wording belongs to the copy work (WP-5.3).

import { STOCK_STATUS_META, type StockStatus } from "./stock-status";
import type {
  DailyItemLogStatus,
  InventoryRecipeVersion,
  InventoryReviewStatus,
  InventorySupplierOrder,
  InventoryUsageStatus,
} from "./types";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

export type StatusView = { label: string; tone: StatusTone };

const CLOSE: Record<DailyItemLogStatus, StatusView> = {
  complete: { label: "Complete", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  no_sales: { label: "No sales", tone: "neutral" },
};

const ORDER: Record<InventorySupplierOrder["status"], StatusView> = {
  ordered: { label: "Ordered / On the Way", tone: "info" },
  partially_received: { label: "Partially Received", tone: "primary" },
  received: { label: "Received", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const RECIPE: Record<InventoryRecipeVersion["status"], StatusView> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  retired: { label: "Retired", tone: "neutral" },
  "needs-review": { label: "Needs review", tone: "warning" },
};

const USAGE: Record<InventoryUsageStatus, StatusView> = {
  calculated: { label: "Calculated", tone: "success" },
  "calculated-with-exclusions": { label: "Calculated with exclusions", tone: "info" },
  "needs-review": { label: "Needs review", tone: "warning" },
  "no-sales": { label: "No sales", tone: "neutral" },
  "pending-draft": { label: "Waiting for close", tone: "neutral" },
};

const REVIEW: Record<InventoryReviewStatus, StatusView> = {
  approved: { label: "Approved", tone: "success" },
  "needs-review": { label: "Needs review", tone: "warning" },
};

/**
 * The status of one day's close. Unsaved edits take precedence over the saved status. A day with
 * no record yet is "Not started".
 */
export function closeStatusView(status: DailyItemLogStatus | null, options: { unsaved?: boolean } = {}): StatusView {
  if (options.unsaved) return { label: "Unsaved changes", tone: "warning" };
  return status ? CLOSE[status] : { label: "Not started", tone: "neutral" };
}

export function stockStatusView(status: StockStatus): StatusView {
  const meta = STOCK_STATUS_META[status];
  return { label: meta.label, tone: meta.tone };
}

export function orderStatusView(status: InventorySupplierOrder["status"]): StatusView {
  return ORDER[status];
}

export function recipeStatusView(status: InventoryRecipeVersion["status"]): StatusView {
  return RECIPE[status];
}

export function usageStatusView(status: InventoryUsageStatus): StatusView {
  return USAGE[status];
}

export function reviewStatusView(status: InventoryReviewStatus): StatusView {
  return REVIEW[status];
}
