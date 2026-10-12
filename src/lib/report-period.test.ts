import assert from "node:assert/strict";
import test from "node:test";
import {
  closedDayStats,
  coversWholeMonth,
  dailyRevenueRows,
  dailyRevenueSeries,
  datesInPeriod,
  entriesInPeriod,
  formatPeriodRange,
  isValidPeriod,
  latestClosedDays,
  monthsTouching,
  presetFor,
  presetRange,
  recordedTotal,
  revenueByMonth,
  revenueTakeaway,
  selisihForPeriod,
} from "./report-period";
import { monthIsOver, monthReportedView } from "./reporting";
import type { MonthlyAdjustment, SalesEntry } from "./types";

const TODAY = "2026-10-12";

function entry(id: string, date: string, total: number, createdAt = 1): SalesEntry {
  return { id, date, bca: 0, cash: 0, soundbox: 0, other: 0, total, createdAt };
}

function adjustment(month: string, amount: number): MonthlyAdjustment {
  return { id: month, month, amount, createdAt: 1 };
}

test("presets resolve to whole calendar ranges, including across a year end", () => {
  assert.deepEqual(presetRange("this-month", TODAY), { from: "2026-10-01", to: "2026-10-12" });
  assert.deepEqual(presetRange("last-month", TODAY), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(presetRange("last-month", "2026-01-05"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("last-30-days", TODAY), { from: "2026-09-13", to: "2026-10-12" });
});

test("a period matches a preset only when its dates match exactly", () => {
  assert.equal(presetFor({ from: "2026-10-01", to: "2026-10-12" }, TODAY), "this-month");
  assert.equal(presetFor({ from: "2026-09-01", to: "2026-09-30" }, TODAY), "last-month");
  assert.equal(presetFor({ from: "2026-09-13", to: "2026-10-12" }, TODAY), "last-30-days");
  assert.equal(presetFor({ from: "2026-10-01", to: "2026-10-10" }, TODAY), "custom");
});

test("formats the range for buttons and file names", () => {
  assert.equal(formatPeriodRange({ from: "2026-10-01", to: "2026-10-12" }), "1–12 Oct 2026");
  assert.equal(formatPeriodRange({ from: "2026-09-01", to: "2026-10-12" }), "1 Sep – 12 Oct 2026");
  assert.equal(formatPeriodRange({ from: "2025-12-01", to: "2026-01-31" }), "1 Dec 2025 – 31 Jan 2026");
  assert.equal(formatPeriodRange({ from: TODAY, to: TODAY }), "12 Oct 2026");
});

test("a backwards period is invalid and has no days", () => {
  assert.equal(isValidPeriod({ from: "2026-10-12", to: "2026-10-11" }), false);
  assert.deepEqual(datesInPeriod({ from: "2026-10-12", to: "2026-10-11" }), []);
});

test("lists every day of the period, across a leap-year February", () => {
  assert.deepEqual(datesInPeriod({ from: "2026-02-27", to: "2026-03-02" }), [
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
    "2026-03-02",
  ]);
});

test("lists each month the period touches, oldest first", () => {
  assert.deepEqual(monthsTouching({ from: "2026-09-15", to: "2026-10-02" }), ["2026-09", "2026-10"]);
  assert.deepEqual(monthsTouching({ from: "2025-12-20", to: "2026-01-03" }), ["2025-12", "2026-01"]);
});

test("a month counts as whole only when the period covers all of it", () => {
  assert.equal(coversWholeMonth("2026-09", { from: "2026-09-01", to: "2026-09-30" }), true);
  assert.equal(coversWholeMonth("2026-09", { from: "2026-09-01", to: "2026-09-29" }), false);
  assert.equal(coversWholeMonth("2026-09", { from: "2026-08-15", to: "2026-09-30" }), true);
});

test("selisih counts only for a closed month the period covers in full, and is never pro-rated", () => {
  const result = selisihForPeriod(
    [adjustment("2026-08", 100000), adjustment("2026-09", -50000)],
    { from: "2026-08-15", to: "2026-09-30" },
    TODAY
  );
  assert.equal(result.amount, -50000);
  assert.deepEqual(result.includedMonths, [{ month: "2026-09", amount: -50000 }]);
  assert.deepEqual(result.partialMonths, [{ month: "2026-08", amount: 100000 }]);
  assert.deepEqual(result.pendingMonths, []);
});

test("an open month waits for its end, even when the period covers all of it", () => {
  const result = selisihForPeriod([adjustment("2026-10", 30000)], { from: "2026-10-01", to: "2026-10-31" }, TODAY);
  assert.equal(result.amount, 0);
  assert.deepEqual(result.pendingMonths, [{ month: "2026-10", amount: 30000 }]);
  assert.deepEqual(result.partialMonths, []);
});

test("a period inside an open month adds no selisih and lists it as pending", () => {
  const result = selisihForPeriod([adjustment("2026-10", 30000)], { from: "2026-10-01", to: "2026-10-12" }, TODAY);
  assert.equal(result.amount, 0);
  assert.deepEqual(result.pendingMonths, [{ month: "2026-10", amount: 30000 }]);
});

test("a month is over only once today is past it", () => {
  assert.equal(monthIsOver("2026-09", TODAY), true);
  assert.equal(monthIsOver("2026-10", TODAY), false);
  assert.equal(monthIsOver("2026-11", TODAY), false);
});

test("a reported month total adds the selisih only once the month is over", () => {
  assert.deepEqual(monthReportedView({ recorded: 1000, adjustment: 200, monthOver: true }), { reported: 1200, selisih: 200 });
  assert.deepEqual(monthReportedView({ recorded: 1000, adjustment: 200, monthOver: false }), { reported: 1000, selisih: null });
});


const ENTRIES: SalesEntry[] = [
  entry("e1", "2026-09-30", 600, 1),
  entry("e2", "2026-10-01", 1500, 2),
  entry("e3", "2026-10-02", 2000, 3),
  entry("e4", "2026-10-02", 500, 4),
  entry("e5", "2026-10-12", 900, 5),
  entry("e6", "2026-10-11", 3000, 6),
];
const OCTOBER = { from: "2026-10-01", to: "2026-10-12" };

test("recorded total sums the entries inside the period only", () => {
  assert.equal(recordedTotal(ENTRIES, OCTOBER), 7900);
});

test("table rows are newest first, with same-day entries in reverse creation order", () => {
  assert.deepEqual(
    entriesInPeriod(ENTRIES, OCTOBER).map((row) => row.id),
    ["e5", "e6", "e4", "e3", "e2"]
  );
});

test("the chart keeps days without a record as gaps, not zeros", () => {
  const series = dailyRevenueSeries(ENTRIES, OCTOBER);
  assert.equal(series.length, 12);
  assert.deepEqual(series[1], { date: "2026-10-02", total: 2500 });
  assert.equal(series[2].total, null);
});

test("average, lowest and highest leave out today, which is still in progress", () => {
  const stats = closedDayStats(ENTRIES, OCTOBER, TODAY);
  assert.equal(stats.days, 3);
  assert.equal(stats.lowest, 1500);
  assert.equal(stats.highest, 3000);
  assert.equal(stats.average, (1500 + 2500 + 3000) / 3);
});

test("no closed days gives empty statistics rather than zeros", () => {
  assert.deepEqual(closedDayStats(ENTRIES, { from: TODAY, to: TODAY }, TODAY), {
    average: null,
    lowest: null,
    highest: null,
    days: 0,
  });
});

test("the takeaway compares the latest closed day with the one before it", () => {
  const result = latestClosedDays(ENTRIES, OCTOBER, TODAY);
  assert.deepEqual(result?.latest, { date: "2026-10-11", total: 3000 });
  assert.deepEqual(result?.previous, { date: "2026-10-02", total: 2500 });
  assert.equal(latestClosedDays(ENTRIES, { from: TODAY, to: TODAY }, TODAY), null);
});

test("monthly rows add up to the period tiles", () => {
  const period = { from: "2026-09-01", to: "2026-10-12" };
  const adjustments = [adjustment("2026-09", -50000), adjustment("2026-10", 30000)];
  const rows = revenueByMonth(ENTRIES, adjustments, period, TODAY);
  assert.deepEqual(
    rows.map((row) => [row.month, row.recorded, row.selisih, row.wholeMonth]),
    [
      ["2026-09", 600, -50000, true],
      ["2026-10", 7900, 0, false],
    ]
  );
  const reported = rows.reduce((sum, row) => sum + row.reported, 0);
  assert.equal(reported, recordedTotal(ENTRIES, period) + selisihForPeriod(adjustments, period, TODAY).amount);
});

test("daily export rows run oldest first and keep same-day entries in creation order", () => {
  const rows = dailyRevenueRows(ENTRIES, { from: "2026-10-01", to: "2026-10-02" });
  assert.deepEqual(
    rows.map((row) => row.total),
    [1500, 2000, 500]
  );
  assert.equal(rows[0].note, "");
});

const TAKEAWAY_FORMAT = {
  money: (value: number) => `Rp${value}`,
  day: (date: string) => `day ${date}`,
};

test("the takeaway states the change against the earlier closed day", () => {
  const up = revenueTakeaway(
    { latest: { date: "2026-10-11", total: 3000 }, previous: { date: "2026-10-02", total: 2500 } },
    TAKEAWAY_FORMAT
  );
  assert.equal(up, "day 2026-10-11 recorded Rp3000, up 20% on day 2026-10-02.");
  const down = revenueTakeaway(
    { latest: { date: "2026-10-11", total: 2000 }, previous: { date: "2026-10-02", total: 2500 } },
    TAKEAWAY_FORMAT
  );
  assert.equal(down, "day 2026-10-11 recorded Rp2000, down 20% on day 2026-10-02.");
  const level = revenueTakeaway(
    { latest: { date: "2026-10-11", total: 2500 }, previous: { date: "2026-10-02", total: 2500 } },
    TAKEAWAY_FORMAT
  );
  assert.equal(level, "day 2026-10-11 recorded Rp2500, level with day 2026-10-02.");
});

test("the takeaway admits when there is nothing to compare", () => {
  assert.equal(revenueTakeaway(null, TAKEAWAY_FORMAT), "No closed day with revenue in this period yet.");
  assert.equal(
    revenueTakeaway({ latest: { date: "2026-10-11", total: 3000 }, previous: null }, TAKEAWAY_FORMAT),
    "day 2026-10-11 recorded Rp3000. There is no earlier recorded day in this period to compare with."
  );
  assert.equal(
    revenueTakeaway(
      { latest: { date: "2026-10-11", total: 3000 }, previous: { date: "2026-10-02", total: 0 } },
      TAKEAWAY_FORMAT
    ),
    "day 2026-10-11 recorded Rp3000. day 2026-10-02 has no revenue to compare with."
  );
});
