import assert from "node:assert/strict";
import test from "node:test";
import { classifyLegacyItemSales } from "./legacy-item-sales";

test("keeps one row per wanted item and marks the rest for removal", () => {
  const rows = [
    { id: "r1", itemId: "taichan" },
    { id: "r2", itemId: "taichan" },
    { id: "r3", itemId: "old-item" },
    { id: "r4", itemId: "nanban" },
  ];
  const { keep, stale } = classifyLegacyItemSales(rows, new Set(["taichan", "nanban"]));
  assert.deepEqual([...keep], [
    ["taichan", "r1"],
    ["nanban", "r4"],
  ]);
  assert.deepEqual(stale.map((row) => row.id), ["r2", "r3"]);
});

test("removes every row when nothing is wanted", () => {
  const { keep, stale } = classifyLegacyItemSales([{ id: "r1", itemId: "taichan" }], new Set());
  assert.equal(keep.size, 0);
  assert.deepEqual(stale.map((row) => row.id), ["r1"]);
});
