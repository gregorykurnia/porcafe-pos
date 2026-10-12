import assert from "node:assert/strict";
import test from "node:test";
import { addDaysISO } from "./dates";

test("steps a calendar date forward and back across month and year ends", () => {
  assert.equal(addDaysISO("2026-10-11", 1), "2026-10-12");
  assert.equal(addDaysISO("2026-10-31", 1), "2026-11-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
});

test("keeps the calendar date without timezone shifts", () => {
  assert.equal(addDaysISO("2026-10-11", 0), "2026-10-11");
});
