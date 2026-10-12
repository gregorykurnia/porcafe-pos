import assert from "node:assert/strict";
import test from "node:test";
import { COUNT_REASON_THRESHOLD, countVariance, parseCountQuantity } from "./stock-count";

test("a count that matches the system needs no reason", () => {
  assert.deepEqual(countVariance(4200, 4200), { difference: 0, percent: 0, needsReason: false });
});

test("a difference up to 20 % is accepted without a reason; more needs one", () => {
  assert.equal(COUNT_REASON_THRESHOLD, 0.2);
  assert.equal(countVariance(1000, 800).needsReason, false);
  assert.equal(countVariance(1000, 790).needsReason, true);
  const down = countVariance(1000, 790);
  assert.equal(down.difference, -210);
  assert.ok(Math.abs((down.percent ?? 0) - -21) < 1e-9);
});

test("a counted amount against a zero balance always needs a reason", () => {
  assert.deepEqual(countVariance(0, 5), { difference: 5, percent: null, needsReason: true });
});

test("a negative system balance is measured against its size", () => {
  assert.equal(countVariance(-100, -110).needsReason, false);
  assert.equal(countVariance(-100, 0).needsReason, true);
});

test("parses whole and decimal counts, with a comma as the decimal separator", () => {
  assert.equal(parseCountQuantity("4200"), 4200);
  assert.equal(parseCountQuantity("4,2"), 4.2);
  assert.equal(parseCountQuantity(" 0 "), 0);
  assert.equal(parseCountQuantity("-1"), null);
  assert.equal(parseCountQuantity("abc"), null);
  assert.equal(parseCountQuantity(""), null);
});
