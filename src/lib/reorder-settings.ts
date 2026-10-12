// Reorder settings for many materials at once. A blank number clears the setting. The draft
// is compared with the saved material, so only changed rows are written.

import type { InventoryMaterial } from "./types";

export type ReorderDraft = {
  threshold: string;
  quantity: string;
  preferredSupplierId: string;
  alertEnabled: boolean;
};

/** Reads a typed number, with a comma accepted as the decimal separator. */
function parseTyped(text: string): number {
  return Number(text.trim().replace(",", "."));
}

export function draftFromMaterial(material: InventoryMaterial): ReorderDraft {
  return {
    threshold: material.reorderThreshold === undefined ? "" : String(material.reorderThreshold),
    quantity: material.reorderQuantity === undefined ? "" : String(material.reorderQuantity),
    preferredSupplierId: material.preferredSupplierId ?? "",
    alertEnabled: material.lowStockAlertEnabled ?? false,
  };
}

export function isDraftDirty(draft: ReorderDraft, material: InventoryMaterial): boolean {
  const saved = draftFromMaterial(material);
  return draft.threshold.trim() !== saved.threshold.trim()
    || draft.quantity.trim() !== saved.quantity.trim()
    || draft.preferredSupplierId !== saved.preferredSupplierId
    || draft.alertEnabled !== saved.alertEnabled;
}

/** The first problem with a draft, or null when it can be saved. */
export function validateDraft(draft: ReorderDraft): string | null {
  const threshold = draft.threshold.trim() ? parseTyped(draft.threshold) : undefined;
  const quantity = draft.quantity.trim() ? parseTyped(draft.quantity) : undefined;
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0)) return "Reorder threshold must be zero or greater.";
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) return "Suggested reorder quantity must be greater than zero.";
  if (draft.alertEnabled && threshold === undefined) return "Set a reorder threshold before turning on the alert.";
  return null;
}

/**
 * The fields to write for a draft. A cleared number is null, which the writer turns into
 * a field delete, so the old value does not survive the merge.
 */
export function patchFromDraft(draft: ReorderDraft): {
  reorderThreshold: number | null;
  reorderQuantity: number | null;
  preferredSupplierId: string;
  lowStockAlertEnabled: boolean;
} {
  return {
    reorderThreshold: draft.threshold.trim() ? parseTyped(draft.threshold) : null,
    reorderQuantity: draft.quantity.trim() ? parseTyped(draft.quantity) : null,
    preferredSupplierId: draft.preferredSupplierId,
    lowStockAlertEnabled: draft.alertEnabled,
  };
}
