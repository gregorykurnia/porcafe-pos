import assert from "node:assert/strict";
import test from "node:test";
import { addDaysISO, isISODate } from "./dates";

test("accepts only real calendar dates in YYYY-MM-DD form", () => {
  assert.equal(isISODate("2026-10-10"), true);
  assert.equal(isISODate("2028-02-29"), true);
  assert.equal(isISODate("2026-02-29"), false);
  assert.equal(isISODate("2026-02-31"), false);
  assert.equal(isISODate("2026-1-01"), false);
  assert.equal(isISODate("10/10/2026"), false);
  assert.equal(isISODate(""), false);
});

test("steps a calendar date forward and back across month and year ends", () => {
  assert.equal(addDaysISO("2026-10-11", 1), "2026-10-12");
  assert.equal(addDaysISO("2026-10-31", 1), "2026-11-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
});

test("keeps the calendar date without timezone shifts", () => {
  assert.equal(addDaysISO("2026-10-11", 0), "2026-10-11");
});
