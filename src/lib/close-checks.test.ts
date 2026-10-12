import assert from "node:assert/strict";
import test from "node:test";
import { REVENUE_MISMATCH_THRESHOLD, getCloseWarnings, type CloseCheckInput } from "./close-checks";

const base: CloseCheckInput = {
  date: "2026-10-11",
  today: "2026-10-12",
  quantities: { nanban: 2, taichan: 1 },
  items: [
    { id: "nanban", price: 50_000 },
    { id: "taichan", price: 30_000 },
  ],
  payments: 130_000,
  previous: null,
};

const codes = (input: CloseCheckInput) => getCloseWarnings(input).map((warning) => warning.code);

test("a day that adds up to its menu prices raises no warnings", () => {
  assert.deepEqual(codes(base), []);
});

test("a day with no portions suggests No sales", () => {
  assert.deepEqual(codes({ ...base, quantities: {}, payments: 0 }), ["no-portions"]);
});

test("items without payments are flagged, and payments are not compared", () => {
  assert.deepEqual(codes({ ...base, payments: 0 }), ["no-revenue"]);
});

test("payments more than 15 % away from the estimate are flagged with both numbers", () => {
  assert.equal(REVENUE_MISMATCH_THRESHOLD, 0.15);
  const flagged = getCloseWarnings({ ...base, payments: 91_000 });
  assert.deepEqual(flagged.map((warning) => warning.code), ["revenue-mismatch"]);
  assert.match(flagged[0].message, /Rp\s?91\.000/);
  assert.match(flagged[0].message, /Rp\s?130\.000/);
  assert.deepEqual(codes({ ...base, payments: 115_000 }), []); // about 11.5 % away
});

test("sold items without a price make the estimate partial, and the count is singular or plural", () => {
  assert.deepEqual(codes({ ...base, items: [{ id: "nanban", price: null }, { id: "taichan", price: 30_000 }], payments: 30_000 }), ["missing-price"]);
  const plural = getCloseWarnings({ ...base, items: [{ id: "nanban", price: null }, { id: "taichan", price: null }], payments: 0 });
  assert.match(plural.find((warning) => warning.code === "missing-price")?.message ?? "", /2 sold items have/);
});

test("a date in the future is flagged", () => {
  assert.deepEqual(codes({ ...base, date: "2026-10-13" }), ["future-date"]);
});

test("completing a day that was already complete says it will be replaced", () => {
  const warnings = getCloseWarnings({ ...base, previous: { status: "complete", source: "scan", updatedAt: Date.UTC(2026, 9, 11, 12, 0) } });
  assert.deepEqual(warnings.map((warning) => warning.code), ["editing-completed"]);
  assert.match(warnings[0].message, /from the sheet/);
  assert.match(warnings[0].message, /Completing again replaces it/);
});
