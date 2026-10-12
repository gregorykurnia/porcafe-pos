import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalItemRows, sourceDateGaps } from "./reporting";
import type { DailyItemLog, ItemSale, MenuItem } from "./types";

const menu: MenuItem[] = [
  { id: "nanban", name: "Chicken Nanban", category: "Main", price: 50_000, active: true, createdAt: 1 },
  { id: "old", name: "Ayam Lama", category: "Main", price: 40_000, active: false, createdAt: 1 },
];

function log(date: string, quantities: Record<string, number>, updatedAt = 100): DailyItemLog {
  return { id: date, date, quantities, totalQty: Object.values(quantities).reduce((a, b) => a + b, 0), status: "complete", source: "manual", createdAt: 1, updatedAt };
}

function legacy(date: string, itemId: string, qty: number, itemName = itemId): ItemSale {
  return { id: `legacy-${date}-${itemId}`, date, itemId, itemName, category: "Main", qty, createdAt: 50 };
}

test("a daily close is the source for its date; legacy rows for that date are dropped", () => {
  const rows = getCanonicalItemRows([log("2026-10-11", { nanban: 7 })], [legacy("2026-10-11", "nanban", 99)], menu);
  assert.deepEqual(rows.map((row) => [row.date, row.itemId, row.qty]), [["2026-10-11", "nanban", 7]]);
});

test("legacy rows fill dates that have no daily close", () => {
  const rows = getCanonicalItemRows([log("2026-10-11", { nanban: 7 })], [legacy("2026-10-10", "nanban", 3)], menu);
  assert.deepEqual(rows.map((row) => [row.date, row.qty]), [["2026-10-11", 7], ["2026-10-10", 3]]);
});

test("a no-sales close with no items leaves its date empty, even if legacy rows exist", () => {
  const rows = getCanonicalItemRows([log("2026-10-11", {})], [legacy("2026-10-11", "nanban", 5)], menu);
  assert.deepEqual(rows, []);
});

test("skips zero quantities and items that are no longer in the menu", () => {
  const rows = getCanonicalItemRows([log("2026-10-11", { nanban: 0, gone: 4, old: 2 })], [], menu);
  assert.deepEqual(rows.map((row) => row.itemId), ["old"]);
});

test("an archived item keeps its name in reports", () => {
  const rows = getCanonicalItemRows([log("2026-10-11", { old: 2 })], [], menu);
  assert.equal(rows[0].itemName, "Ayam Lama");
});

test("lists the most recent date first", () => {
  const rows = getCanonicalItemRows([log("2026-10-09", { nanban: 1 }), log("2026-10-11", { nanban: 2 })], [], menu);
  assert.deepEqual(rows.map((row) => row.date), ["2026-10-11", "2026-10-09"]);
});

test("reports dates that exist in only one source", () => {
  const gaps = sourceDateGaps([log("2026-10-11", { nanban: 1 })], [legacy("2026-10-10", "nanban", 1)]);
  assert.deepEqual(gaps, { legacyOnly: ["2026-10-10"], closedOnly: ["2026-10-11"] });
});
