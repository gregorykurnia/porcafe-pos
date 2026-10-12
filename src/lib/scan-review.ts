import { isValid, parseISO } from "date-fns";
import { toISODate } from "./dates";

// Pure rules for reviewing a scanned daily sheet. The scan screen only renders these results.

export type ScanSheetItem = {
  menuItemId: string | null;
  rawName: string;
  qty: number;
};

export type ScanRow = {
  id: string;
  rawName: string;
  menuItemId: string;
  qty: string;
};

/** Turns the scan's items into editable review rows. `makeId` keeps ids stable in tests. */
export function rowsFromScan(items: ScanSheetItem[], makeId: (index: number) => string): ScanRow[] {
  return items.map((item, index) => ({
    id: makeId(index),
    rawName: item.rawName,
    menuItemId: item.menuItemId ?? "",
    qty: String(item.qty ?? ""),
  }));
}

export type QuantityPlan = {
  /** Menu item id → portions for the day. Rows for the same item are summed. */
  quantities: Record<string, number>;
  /** Rows with a quantity but no menu item. These block saving. */
  unmatched: ScanRow[];
  /** Rows whose quantity is not a whole number of zero or more. These block saving. */
  invalid: ScanRow[];
  /** Names of items that appeared on more than one row, shown as a note. */
  merged: string[];
};

export function planQuantities(rows: ScanRow[], menuItems: { id: string; name: string }[]): QuantityPlan {
  const names = new Map(menuItems.map((item) => [item.id, item.name]));
  const quantities: Record<string, number> = {};
  const unmatched: ScanRow[] = [];
  const invalid: ScanRow[] = [];
  const rowCount = new Map<string, number>();

  for (const row of rows) {
    const text = row.qty.trim();
    if (text === "") continue;
    const qty = Number(text);
    if (!Number.isInteger(qty) || qty < 0) {
      invalid.push(row);
      continue;
    }
    if (qty === 0) continue;
    if (!row.menuItemId || !names.has(row.menuItemId)) {
      unmatched.push(row);
      continue;
    }
    rowCount.set(row.menuItemId, (rowCount.get(row.menuItemId) ?? 0) + 1);
    quantities[row.menuItemId] = (quantities[row.menuItemId] ?? 0) + qty;
  }

  const merged = [...rowCount]
    .filter(([, count]) => count > 1)
    .map(([itemId]) => names.get(itemId) ?? itemId);

  return { quantities, unmatched, invalid, merged };
}

/** Current → scanned quantities for items whose quantity changes, in name order. */
export function quantityDiffRows(
  saved: Record<string, number>,
  next: Record<string, number>,
  menuItems: { id: string; name: string }[]
): { label: string; current: number; next: number }[] {
  const names = new Map(menuItems.map((item) => [item.id, item.name]));
  const itemIds = new Set([...Object.keys(saved), ...Object.keys(next)]);
  return [...itemIds]
    .map((itemId) => ({
      label: names.get(itemId) ?? itemId,
      current: saved[itemId] ?? 0,
      next: next[itemId] ?? 0,
    }))
    .filter((row) => row.current !== row.next)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Scales a photo so its longest edge is at most `maxEdge`. Smaller photos are not enlarged. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export type ScanProblem = {
  status?: number;
  message?: string;
  aborted?: boolean;
};

/** Plain-language message for a failed scan. The photo is always kept so the scan can be retried. */
export function scanErrorMessage(problem: ScanProblem): string {
  if (problem.aborted) return "Scan cancelled. Your photo is kept, so you can try again.";
  if (problem.status === 413 || problem.message === "image-too-large") {
    return "This photo is too large to send. Choose a closer or smaller photo.";
  }
  if (problem.status === 408 || problem.status === 504) {
    return "The scan took too long. Check the connection and try again.";
  }
  if (problem.status === 0 || problem.message === "Failed to fetch") {
    return "No connection. Reconnect and try again. Your photo is kept.";
  }
  if (problem.status !== undefined && problem.status >= 500) {
    return "The sheet could not be read this time. Try again, or choose another photo.";
  }
  return problem.message || "The sheet could not be read. Try again.";
}

/**
 * The date the model read from the sheet, as a canonical YYYY-MM-DD. Accepts a
 * non-padded "2026-8-2". Anything unreadable falls back to `today`. Every lookup is an
 * exact string match, so a non-canonical date would silently miss its day.
 */
export function normalizeScanDate(raw: string | null | undefined, today: string): string {
  if (!raw) return today;
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const padded = match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : trimmed;
  const parsed = parseISO(padded);
  return isValid(parsed) ? toISODate(parsed) : today;
}
