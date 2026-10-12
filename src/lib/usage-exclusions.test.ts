import assert from "node:assert/strict";
import test from "node:test";
import { daysNeedingExclusion, excludableItemsFor, sourceStatusLabel } from "./usage-exclusions";
import type { InventoryUsageEvent, InventoryUsageIssue } from "./types";

function issue(code: InventoryUsageIssue["code"], menuItemId?: string, menuItemName?: string): InventoryUsageIssue {
  return { code, message: code, menuItemId, menuItemName };
}

function event(sourceDate: string, issues: InventoryUsageIssue[], excludedIds: string[] = []): InventoryUsageEvent {
  return {
    id: `usage-${sourceDate}`,
    sourceDate,
    sourceDailyLogId: sourceDate,
    sourceRevision: 1,
    sourceStatus: "complete",
    status: "needs-review",
    totalPortions: 0,
    lines: [],
    issues,
    excludedItems: excludedIds.map((menuItemId) => ({ menuItemId, menuItemName: menuItemId, portionQuantity: 1, reason: "recipe-unavailable" as const })),
    recipeIds: [],
    goLiveDate: "2026-10-01",
    calculatedAt: 1,
  };
}

test("only a missing or unready recipe can be excluded, and not an item already excluded", () => {
  const day = event("2026-10-05", [
    issue("missing-recipe", "nanban", "Nanban"),
    issue("recipe-not-ready", "rice", "Rice"),
    issue("unit-mismatch", "sauce", "Sauce"),
    issue("missing-recipe", "tea", "Tea"),
  ], ["tea"]);
  assert.deepEqual(excludableItemsFor(day), [
    { id: "nanban", name: "Nanban" },
    { id: "rice", name: "Rice" },
  ]);
});

test("an issue without a menu item name falls back to its id", () => {
  const day = event("2026-10-05", [issue("missing-recipe", "nanban")]);
  assert.deepEqual(excludableItemsFor(day), [{ id: "nanban", name: "nanban" }]);
});

test("bulk exclusion covers the days, in order, that need the item and do not exclude it yet", () => {
  const events = [
    event("2026-10-07", [issue("missing-recipe", "nanban", "Nanban")]),
    event("2026-10-05", [issue("missing-recipe", "nanban", "Nanban")]),
    event("2026-10-06", [issue("missing-recipe", "nanban", "Nanban")], ["nanban"]),
    event("2026-10-08", [issue("missing-recipe", "rice", "Rice")]),
  ];
  assert.deepEqual(daysNeedingExclusion(events, "nanban"), ["2026-10-05", "2026-10-07"]);
  assert.deepEqual(daysNeedingExclusion(events, "rice"), ["2026-10-08"]);
  assert.deepEqual(daysNeedingExclusion(events, "tea"), []);
});

test("an issue that is not excludable never adds a day to the bulk list", () => {
  const events = [event("2026-10-05", [issue("recipe-cycle", "nanban", "Nanban")])];
  assert.deepEqual(daysNeedingExclusion(events, "nanban"), []);
});

test("the day's saved status reads the way the recap labels it", () => {
  assert.equal(sourceStatusLabel("draft"), "Draft (not deducted)");
  assert.equal(sourceStatusLabel("complete"), "Complete");
  assert.equal(sourceStatusLabel("no_sales"), "No sales");
});
