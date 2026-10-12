import assert from "node:assert/strict";
import test from "node:test";
import { fitWithin, normalizeScanDate, planQuantities, quantityDiffRows, rowsFromScan, scanErrorMessage, type ScanRow } from "./scan-review";

const menu = [
  { id: "chicken-nanban", name: "Chicken Nanban" },
  { id: "taichan", name: "Taichan" },
];

function row(id: string, menuItemId: string, qty: string, rawName = id): ScanRow {
  return { id, rawName, menuItemId, qty };
}

test("builds review rows from the scan, keeping sheet text and suggested matches", () => {
  const rows = rowsFromScan(
    [
      { menuItemId: "chicken-nanban", rawName: "Nanban", qty: 4 },
      { menuItemId: null, rawName: "Kopi susu", qty: 2 },
    ],
    (index) => `row-${index}`
  );
  assert.deepEqual(rows, [
    { id: "row-0", rawName: "Nanban", menuItemId: "chicken-nanban", qty: "4" },
    { id: "row-1", rawName: "Kopi susu", menuItemId: "", qty: "2" },
  ]);
});

test("sums rows for the same item and reports which items were merged", () => {
  const plan = planQuantities(
    [row("a", "taichan", "2"), row("b", "taichan", "3"), row("c", "chicken-nanban", "1")],
    menu
  );
  assert.deepEqual(plan.quantities, { taichan: 5, "chicken-nanban": 1 });
  assert.deepEqual(plan.merged, ["Taichan"]);
  assert.deepEqual(plan.unmatched, []);
});

test("rows with a quantity but no menu item block saving; blank and zero rows are ignored", () => {
  const plan = planQuantities([row("a", "", "2", "Mystery"), row("b", "taichan", ""), row("c", "taichan", "0")], menu);
  assert.deepEqual(plan.unmatched.map((item) => item.rawName), ["Mystery"]);
  assert.deepEqual(plan.quantities, {});
});

test("quantities must be whole numbers of zero or more", () => {
  const plan = planQuantities([row("a", "taichan", "1.5"), row("b", "taichan", "-1"), row("c", "taichan", "abc")], menu);
  assert.equal(plan.invalid.length, 3);
  assert.deepEqual(plan.quantities, {});
});

test("diffs current against scanned quantities in name order and hides untouched items", () => {
  assert.deepEqual(
    quantityDiffRows({ taichan: 2, "chicken-nanban": 1 }, { taichan: 4, "chicken-nanban": 1 }, menu),
    [{ label: "Taichan", current: 2, next: 4 }]
  );
  assert.deepEqual(quantityDiffRows({}, { taichan: 1 }, menu), [{ label: "Taichan", current: 0, next: 1 }]);
});

test("scales only photos larger than the limit, keeping the aspect ratio", () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(fitWithin(1200, 800, 2000), { width: 1200, height: 800 });
  assert.deepEqual(fitWithin(800, 3000, 2000), { width: 533, height: 2000 });
});

test("explains a failed scan without losing the photo", () => {
  assert.match(scanErrorMessage({ aborted: true }), /cancelled/);
  assert.match(scanErrorMessage({ status: 413 }), /too large/);
  assert.match(scanErrorMessage({ status: 504 }), /took too long/);
  assert.match(scanErrorMessage({ message: "Failed to fetch" }), /No connection/);
  assert.match(scanErrorMessage({ status: 500, message: "Scan failed: boom" }), /could not be read/);
  assert.equal(scanErrorMessage({ status: 400, message: "Unsupported image format" }), "Unsupported image format");
});

test("normalises the sheet date, including non-padded days, and falls back to today", () => {
  assert.equal(normalizeScanDate("2026-08-02", "2026-10-12"), "2026-08-02");
  assert.equal(normalizeScanDate("2026-8-2", "2026-10-12"), "2026-08-02");
  assert.equal(normalizeScanDate("not a date", "2026-10-12"), "2026-10-12");
  assert.equal(normalizeScanDate(null, "2026-10-12"), "2026-10-12");
});
