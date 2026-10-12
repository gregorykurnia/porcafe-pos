import assert from "node:assert/strict";
import test from "node:test";
import {
  chartLabel,
  itemDetailRows,
  itemDetailSummary,
  mainQtyInBucket,
  qtyByPeriod,
  shiftCursor,
  summarizeItemPeriod,
  topMainItemByWeekday,
  topSellers,
} from "./item-report";
import type { DailyItemLog, ItemSale } from "./types";

const OCTOBER_FIRST_TO_TENTH = { from: "2026-10-01", to: "2026-10-10" };

function sale(date: string, itemId: string, itemName: string, qty: number): ItemSale {
  return { id: `${date}-${itemId}`, date, itemId, itemName, category: itemId === "m1" || itemId === "m2" ? "Main" : "Add On", qty, createdAt: 1 };
}

function log(date: string, status: DailyItemLog["status"]): DailyItemLog {
  return { id: date, date, quantities: {}, totalQty: 0, status, source: "manual", createdAt: 1, updatedAt: 1 };
}

const isMain = (row: ItemSale) => row.itemId === "m1" || row.itemId === "m2";

const ROWS: ItemSale[] = [
  sale("2026-10-01", "m1", "Nasi", 5),
  sale("2026-10-01", "a1", "Telur", 3),
  sale("2026-10-02", "m1", "Nasi", 4),
  sale("2026-09-30", "m1", "Nasi", 10),
  sale("2026-10-03", "a1", "Telur", 2),
];

test("the Main average divides by selling days, not by every logged day", () => {
  const summary = summarizeItemPeriod({
    rows: ROWS,
    loggedDates: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-09-30"],
    isMain,
    period: OCTOBER_FIRST_TO_TENTH,
  });
  assert.equal(summary.totalQty, 14);
  assert.equal(summary.loggedDays, 4);
  assert.equal(summary.mainQty, 9);
  assert.equal(summary.sellingDays, 2);
  assert.equal(summary.averageMainQty, 4.5);
  assert.deepEqual(summary.bestMainDay, { date: "2026-10-01", qty: 5 });
  assert.deepEqual(summary.topItem, { name: "Nasi", qty: 9 });
});

test("with no Main portions the average is empty, not zero", () => {
  const summary = summarizeItemPeriod({
    rows: [sale("2026-10-03", "a1", "Telur", 2)],
    loggedDates: [],
    isMain,
    period: OCTOBER_FIRST_TO_TENTH,
  });
  assert.equal(summary.averageMainQty, null);
  assert.equal(summary.bestMainDay, null);
  assert.deepEqual(summary.topItem, { name: "Telur", qty: 2 });
});

test("item detail gives each day one status: sold, 0 sold, no sales, or not logged", () => {
  const rows = [sale("2026-10-01", "m1", "Nasi", 5)];
  const logs = [log("2026-10-01", "complete"), log("2026-10-02", "no_sales"), log("2026-10-04", "complete")];
  const detail = itemDetailRows({ rows, dailyLogs: logs, itemId: "m1", period: { from: "2026-10-01", to: "2026-10-04" } });
  assert.deepEqual(
    detail.map((row) => [row.date, row.status]),
    [
      ["2026-10-01", "Sold"],
      ["2026-10-02", "No sales"],
      ["2026-10-03", "Not logged"],
      ["2026-10-04", "0 sold"],
    ]
  );
  const summary = itemDetailSummary(detail);
  assert.equal(summary.totalQty, 5);
  assert.equal(summary.loggedDays, 3);
  assert.equal(summary.salesDays, 1);
  assert.equal(summary.noSalesDays, 1);
  assert.equal(summary.unloggedDays, 1);
});

test("a backwards item-detail period gives no rows", () => {
  assert.deepEqual(itemDetailRows({ rows: ROWS, dailyLogs: [], itemId: "m1", period: { from: "2026-10-05", to: "2026-10-01" } }), []);
});

test("buckets by week and month, inside the period only, oldest first", () => {
  const rows = [...ROWS, sale("2026-10-05", "m1", "Nasi", 1)];
  // 1–4 Oct and 5 Oct fall in different weeks: the week of 28 Sep and the week of 5 Oct.
  assert.deepEqual(qtyByPeriod(rows, "week", OCTOBER_FIRST_TO_TENTH), [
    { key: "2026-09-28", qty: 14 },
    { key: "2026-10-05", qty: 1 },
  ]);
  assert.deepEqual(qtyByPeriod(rows, "month", OCTOBER_FIRST_TO_TENTH), [{ key: "2026-10", qty: 15 }]);
});

test("top sellers rank by quantity, then name, and respect the limit", () => {
  assert.deepEqual(topSellers(ROWS, OCTOBER_FIRST_TO_TENTH), [
    { name: "Nasi", qty: 9 },
    { name: "Telur", qty: 5 },
  ]);
  assert.deepEqual(topSellers(ROWS, OCTOBER_FIRST_TO_TENTH, 1), [{ name: "Nasi", qty: 9 }]);
});

test("the Main navigator sums one bucket of Main portions only", () => {
  assert.equal(mainQtyInBucket(ROWS, isMain, "day", "2026-10-01"), 5);
  assert.equal(mainQtyInBucket(ROWS, isMain, "month", "2026-10"), 9);
});

test("the top Main item for each weekday ignores add-ons and ranks within the day", () => {
  const rows = [
    sale("2026-10-01", "m1", "Nasi", 5),
    sale("2026-10-01", "a1", "Telur", 9),
    sale("2026-10-02", "m1", "Nasi", 4),
    sale("2026-10-02", "m2", "Ayam", 6),
  ];
  const byDay = topMainItemByWeekday(rows, isMain, OCTOBER_FIRST_TO_TENTH);
  assert.equal(byDay.length, 7);
  assert.deepEqual(byDay.find((row) => row.weekday === "Thursday")?.top, { name: "Nasi", qty: 5 });
  assert.deepEqual(byDay.find((row) => row.weekday === "Friday")?.top, { name: "Ayam", qty: 6 });
  assert.equal(byDay.find((row) => row.weekday === "Monday")?.top, null);
});

test("chart labels stay short for each grain", () => {
  assert.equal(chartLabel("2026-10-12", "day"), "12 Oct");
  assert.equal(chartLabel("2026-09-28", "week"), "28 Sep – 4 Oct 2026");
  assert.equal(chartLabel("2026-10", "month"), "Oct 2026");
});

test("the navigator steps by day, week and month, keeping a month-end day inside a shorter month", () => {
  assert.equal(shiftCursor("2026-10-01", "day", -1), "2026-09-30");
  assert.equal(shiftCursor("2026-10-01", "week", 1), "2026-10-08");
  assert.equal(shiftCursor("2026-10-31", "month", 1), "2026-11-30");
  assert.equal(shiftCursor("2026-01-31", "month", -1), "2025-12-31");
});
