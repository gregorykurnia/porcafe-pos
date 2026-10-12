import assert from "node:assert/strict";
import test from "node:test";
import { describeSourceRef } from "./source-ref";

test("names daily close usage and its reversals by date", () => {
  assert.equal(describeSourceRef("consumption:usage-2026-10-11:revision:1700000000000")?.label, "Recipe use from daily close 2026-10-11");
  assert.equal(describeSourceRef("consumption:usage-2026-10-11:reversal:1700000000000")?.label, "Reversed daily close 2026-10-11");
});

test("names stock counts, openings, schedules and supplier receipts", () => {
  assert.equal(describeSourceRef("stock-count:2026-10-11:abc123")?.label, "Stock count 2026-10-11");
  assert.equal(describeSourceRef("opening-balance:2026-09-01:kailan")?.label, "Opening stock 2026-09-01");
  assert.equal(describeSourceRef("supplier-delivery-schedule:sch1:2026-10-12")?.label, "Scheduled delivery 2026-10-12");
  assert.equal(describeSourceRef("supplier-order:o1:receipt:r1")?.label, "Delivery against a supplier order");
});

test("keeps the raw reference for anything unrecognised, and returns null when there is none", () => {
  assert.deepEqual(describeSourceRef("D12:F12"), { label: "D12:F12", raw: "D12:F12" });
  assert.equal(describeSourceRef(""), null);
  assert.equal(describeSourceRef(undefined), null);
});
