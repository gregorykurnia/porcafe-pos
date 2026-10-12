import assert from "node:assert/strict";
import test from "node:test";
import { calendarMonthTrend, distinctDaysLogged, getAttentionItems, monthToDateComparison, monthTakeaway, totalThrough } from "./reporting";
import type { DailyItemLog, SalesEntry } from "./types";

const today = "2026-10-12";

function log(date: string, status: DailyItemLog["status"], quantities: Record<string, number>): DailyItemLog {
  return { id: date, date, quantities, totalQty: Object.values(quantities).reduce((a, b) => a + b, 0), status, source: "manual", createdAt: 1, updatedAt: 1 };
}

function sale(date: string, total: number): SalesEntry {
  return { id: `s-${date}`, date, bca: total, cash: 0, soundbox: 0, other: 0, total, createdAt: 1 };
}

test("today's close is flagged when it has not started, or is still a draft", () => {
  assert.deepEqual(getAttentionItems({ today, dailyLogs: [], salesEntries: [] }).map((i) => i.kind), ["today"]);
  assert.equal(getAttentionItems({ today, dailyLogs: [log(today, "draft", { a: 1 })], salesEntries: [] })[0].severity, "warning");
  const done = getAttentionItems({ today, dailyLogs: [log(today, "complete", { a: 1 }), ], salesEntries: [sale(today, 10)] });
  assert.equal(done.some((i) => i.kind === "today"), false);
});

test("drafts from the last 14 days are listed, older ones are not", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [log("2026-10-11", "draft", { a: 1 }), log("2026-09-29", "draft", { a: 1 }), log("2026-09-20", "draft", { a: 1 })],
    salesEntries: [],
  });
  // Fourteen days back from 12 October is 28 September: 29 September is listed, 20 September is not.
  assert.deepEqual(items.filter((i) => i.kind === "draft").map((i) => i.date), ["2026-10-11", "2026-09-29"]);
});

test("portions and revenue that disagree are flagged in both directions", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [log("2026-10-10", "complete", { a: 4 }), log("2026-10-09", "complete", { a: 2 })],
    salesEntries: [sale("2026-10-09", 80_000), sale("2026-10-08", 50_000)],
  });
  assert.deepEqual(items.filter((i) => i.kind === "portions-without-revenue").map((i) => i.date), ["2026-10-10"]);
  assert.deepEqual(items.filter((i) => i.kind === "revenue-without-portions").map((i) => i.date), ["2026-10-08"]);
});

test("stock and delivery items appear only when the counts are given and above zero", () => {
  const base = { today, dailyLogs: [log(today, "complete", { a: 1 })], salesEntries: [sale(today, 1)] };
  assert.equal(getAttentionItems(base).length, 0);
  const withStock = getAttentionItems({ ...base, stock: { toOrder: 3, negative: 1 }, scheduledToConfirm: 2 });
  assert.deepEqual(withStock.map((i) => i.kind), ["negative-stock", "to-order", "scheduled-to-confirm"]);
  assert.equal(withStock[1].href, "/inventory?tab=to-order");
  assert.equal(getAttentionItems({ ...base, stock: { toOrder: 0, negative: 0 }, scheduledToConfirm: 0 }).length, 0);
});

test("portions and revenue are compared only over the recent window", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [],
    salesEntries: [sale("2026-08-01", 90_000), sale("2026-10-08", 50_000)],
  });
  assert.deepEqual(items.filter((i) => i.kind === "revenue-without-portions").map((i) => i.date), ["2026-10-08"]);
});


const money = (value: number) => `Rp ${value}`;

test("compares the month so far with the same days of the previous month", () => {
  const sales = [
    { date: "2026-10-01", total: 100 },
    { date: "2026-10-12", total: 200 },
    { date: "2026-10-20", total: 999 },
    { date: "2026-09-01", total: 50 },
    { date: "2026-09-12", total: 150 },
    { date: "2026-09-30", total: 777 },
  ];
  assert.equal(totalThrough(sales, "2026-10", 12), 300);
  const comparison = monthToDateComparison(sales, "2026-10", 12);
  assert.equal(comparison.current, 300);
  assert.equal(comparison.previous, 200);
  assert.equal(comparison.label, "1–12 Sep");
  assert.equal(comparison.deltaPct, 0.5);
});

test("a short previous month is compared through its last day, and has no delta without a base", () => {
  const comparison = monthToDateComparison([{ date: "2026-03-30", total: 10 }], "2026-03", 31);
  assert.equal(comparison.label, "1–28 Feb");
  assert.equal(comparison.deltaPct, null);
});

test("the calendar trend has every day of the month, with gaps where nothing was recorded", () => {
  const trend = calendarMonthTrend([{ date: "2026-10-02", total: 5 }, { date: "2026-10-02", total: 3 }], "2026-10");
  assert.equal(trend.length, 31);
  assert.deepEqual(trend[1], { date: "2026-10-02", total: 8 });
  assert.equal(trend[0].total, null);
});

test("days logged counts each date once", () => {
  assert.equal(distinctDaysLogged([{ date: "2026-10-02" }, { date: "2026-10-02" }, { date: "2026-10-03" }, { date: "2026-09-30" }], "2026-10"), 2);
});

test("the takeaway states the average and the change against the comparable days", () => {
  assert.equal(monthTakeaway({ averagePerDay: 100, deltaPct: 0.123, comparedLabel: "1–12 Sep", formatMoney: money }), "Averaging Rp 100 a day, up 12% on 1–12 Sep.");
  assert.equal(monthTakeaway({ averagePerDay: 100, deltaPct: -0.05, comparedLabel: "1–12 Sep", formatMoney: money }), "Averaging Rp 100 a day, down 5% on 1–12 Sep.");
  assert.equal(monthTakeaway({ averagePerDay: 100, deltaPct: null, comparedLabel: "x", formatMoney: money }), "Averaging Rp 100 a day. No earlier days to compare yet.");
});
