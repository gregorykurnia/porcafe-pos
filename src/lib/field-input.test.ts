import assert from "node:assert/strict";
import test from "node:test";
import { acceptDateInput, acceptQuantityInput, isISODate, stepQuantity } from "./field-input";

test("whole-number quantities reject decimals and letters unless allowed", () => {
  assert.equal(acceptQuantityInput("12"), "12");
  assert.equal(acceptQuantityInput(""), "");
  assert.equal(acceptQuantityInput("1.5"), null);
  assert.equal(acceptQuantityInput("1.5", true), "1.5");
  assert.equal(acceptQuantityInput("a1"), null);
});

test("stepping keeps whole numbers and never goes below the minimum", () => {
  assert.equal(stepQuantity("", 1), "1");
  assert.equal(stepQuantity("3", -1), "2");
  assert.equal(stepQuantity("0", -1), "0");
  assert.equal(stepQuantity("1.5", 1), "3");
  assert.equal(stepQuantity("1.5", 1, { allowDecimal: true }), "2.5");
  assert.equal(stepQuantity("2", -5, { min: 1 }), "1");
});

test("date fields accept only full ISO dates and keep the current date otherwise", () => {
  assert.equal(isISODate("2026-10-11"), true);
  assert.equal(isISODate("2026-1-1"), false);
  assert.equal(acceptDateInput("2026-10-13", "2026-10-12"), "2026-10-13");
  assert.equal(acceptDateInput("", "2026-10-12"), "2026-10-12");
  assert.equal(acceptDateInput("2026-10", "2026-10-12"), "2026-10-12");
});
