// Which menu items can be excluded from a day's material usage, and on which days. The usage recap
// uses these to offer the exclusion for one day or for every day in the range that needs it.

import type { InventoryUsageEvent } from "./types";

// Only a missing or unready recipe can be excluded. Other issues need the recipe fixed, not skipped.
const EXCLUDABLE_ISSUES = new Set(["missing-recipe", "recipe-not-ready"]);

/** Menu items with an excludable issue on this day, which are not already excluded. */
export function excludableItemsFor(event: InventoryUsageEvent): { id: string; name: string }[] {
  const alreadyExcluded = new Set((event.excludedItems ?? []).map((item) => item.menuItemId));
  const items = new Map<string, string>();
  for (const issue of event.issues) {
    if (issue.menuItemId && EXCLUDABLE_ISSUES.has(issue.code) && !alreadyExcluded.has(issue.menuItemId)) {
      items.set(issue.menuItemId, issue.menuItemName ?? issue.menuItemId);
    }
  }
  return [...items].map(([id, name]) => ({ id, name }));
}

/**
 * The days, oldest first, where this item needs excluding: the day has an excludable issue for it, and
 * the item is not excluded yet. Days that already exclude it are skipped, so a repeat run is harmless.
 */
export function daysNeedingExclusion(events: InventoryUsageEvent[], menuItemId: string): string[] {
  return events
    .filter((event) =>
      event.issues.some((issue) => issue.menuItemId === menuItemId && EXCLUDABLE_ISSUES.has(issue.code)) &&
      !(event.excludedItems ?? []).some((item) => item.menuItemId === menuItemId)
    )
    .map((event) => event.sourceDate)
    .sort();
}

/** How the day's saved close is described in the recap. A draft is not deducted from stock. */
export function sourceStatusLabel(status: InventoryUsageEvent["sourceStatus"]): string {
  if (status === "draft") return "Draft (not deducted)";
  if (status === "complete") return "Complete";
  return "No sales";
}
