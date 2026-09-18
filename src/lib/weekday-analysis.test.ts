import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWeekdayPattern, countCalendarDays, weekdayIndex } from "./weekday-analysis";

test("keeps a stable Monday-to-Sunday order and counts calendar occurrences", () => {
  const result = analyzeWeekdayPattern(
    [
      { date: "2026-09-14", value: 100 },
      { date: "2026-09-16", value: 200 },
      { date: "2026-09-20", value: 0 },
    ],
    {
      from: "2026-09-14",
      to: "2026-09-20",
      getDate: (record) => record.date,
      getValue: (record) => record.value,
    }
  );

  assert.deepEqual(
    result.rows.map((row) => row.shortLabel),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  );
  assert.equal(result.rangeDays, 7);
  assert.equal(result.rows[0].occurrences, 1);
  assert.equal(result.rows[0].average, 100);
  assert.equal(result.rows[2].average, 200);
  assert.equal(result.rows[6].total, 0);
  assert.equal(result.best?.key, "wednesday");
  assert.equal(result.weakest?.key, "sunday");
});

test("normalizes averages by weekday occurrences across longer ranges", () => {
  const result = analyzeWeekdayPattern(
    [
      { date: "2026-09-14", value: 100 },
      { date: "2026-09-21", value: 300 },
    ],
    {
      from: "2026-09-14",
      to: "2026-09-27",
      getDate: (record) => record.date,
      getValue: (record) => record.value,
    }
  );

  assert.equal(result.rows[0].occurrences, 2);
  assert.equal(result.rows[0].average, 200);
  assert.equal(result.rows[0].observedDays, 2);
  assert.equal(result.observedDays, 2);
});

test("can count only observed selling days as weekday occurrences", () => {
  const result = analyzeWeekdayPattern(
    [{ date: "2026-09-14", value: 100 }],
    {
      from: "2026-09-14",
      to: "2026-09-27",
      getDate: (record) => record.date,
      getValue: (record) => record.value,
      occurrenceMode: "observed",
    }
  );

  assert.equal(result.rows[0].occurrences, 1);
  assert.equal(result.rows[0].average, 100);
  assert.equal(result.rows[1].occurrences, 0);
  assert.equal(result.rows[1].average, 0);
});

test("retains duplicate records while counting one observed calendar day", () => {
  const result = analyzeWeekdayPattern(
    [
      { date: "2026-09-14", value: 100 },
      { date: "2026-09-14", value: 50 },
    ],
    {
      from: "2026-09-14",
      to: "2026-09-20",
      getDate: (record) => record.date,
      getValue: (record) => record.value,
    }
  );

  assert.equal(result.rows[0].recordCount, 2);
  assert.equal(result.rows[0].observedDays, 1);
  assert.equal(result.rows[0].total, 150);
  assert.equal(result.recordCount, 2);
  assert.equal(result.observedDays, 1);
});

test("uses calendar dates without local timezone shifts", () => {
  assert.equal(weekdayIndex("2026-09-20"), 0);
  assert.equal(weekdayIndex("2026-09-21"), 1);
  assert.equal(countCalendarDays("2026-09-20", "2026-09-21"), 2);
});

test("returns an empty analysis for an invalid or reversed range", () => {
  const result = analyzeWeekdayPattern(
    [{ date: "2026-09-14", value: 100 }],
    {
      from: "2026-09-21",
      to: "2026-09-14",
      getDate: (record) => record.date,
      getValue: (record) => record.value,
    }
  );

  assert.equal(result.rangeDays, 0);
  assert.equal(result.total, 0);
  assert.equal(result.best, null);
  assert.equal(result.rows.every((row) => row.occurrences === 0), true);
});
