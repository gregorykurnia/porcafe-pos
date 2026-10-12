// Item figures for the Items and Weekday tabs. Every figure reads the canonical item rows
// (getCanonicalItemRows), so the same days give the same portions here and on the Dashboard.

import { addMonths, parseISO } from "date-fns";
import { addDaysISO, formatDisplay, formatMonthDisplay, formatWeekDisplay, monthKey, toISODate, weekKey } from "./dates";
import { datesInPeriod, formatPeriodRange, inPeriod, SHORT_MONTHS, type ReportPeriod } from "./report-period";
import { WEEKDAY_DEFINITIONS, weekdayIndex } from "./weekday-analysis";
import type { DailyItemLog, ItemSale } from "./types";

export function formatQuantity(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

export type ItemPeriodSummary = {
  totalQty: number;
  /** Days with a daily close or legacy item rows, including explicit no-sales days. */
  loggedDays: number;
  mainQty: number;
  /** Days with at least one Main portion sold. The Main average divides by these, not by all logged days. */
  sellingDays: number;
  averageMainQty: number | null;
  bestMainDay: { date: string; qty: number } | null;
  topItem: { name: string; qty: number } | null;
};

/**
 * The period's summary. A selling day is a day with at least one Main portion, so days with
 * no sales, and days with only add-ons, do not pull the Main average down.
 */
export function summarizeItemPeriod(input: {
  rows: ItemSale[];
  loggedDates: string[];
  isMain: (row: ItemSale) => boolean;
  period: ReportPeriod;
}): ItemPeriodSummary {
  let totalQty = 0;
  let mainQty = 0;
  const itemTotals = new Map<string, { name: string; qty: number }>();
  const mainByDate = new Map<string, number>();

  for (const row of input.rows) {
    if (!inPeriod(row.date, input.period)) continue;
    totalQty += row.qty;
    const item = itemTotals.get(row.itemId) ?? { name: row.itemName, qty: 0 };
    item.qty += row.qty;
    itemTotals.set(row.itemId, item);
    if (input.isMain(row)) {
      mainQty += row.qty;
      mainByDate.set(row.date, (mainByDate.get(row.date) ?? 0) + row.qty);
    }
  }

  const sellingDays = mainByDate.size;
  const loggedDays = new Set(input.loggedDates.filter((date) => inPeriod(date, input.period))).size;
  const bestMainDay = [...mainByDate].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const topItem = [...itemTotals.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))[0];

  return {
    totalQty,
    loggedDays,
    mainQty,
    sellingDays,
    averageMainQty: sellingDays > 0 ? mainQty / sellingDays : null,
    bestMainDay: bestMainDay ? { date: bestMainDay[0], qty: bestMainDay[1] } : null,
    topItem: topItem ?? null,
  };
}

export type ItemDetailStatus = "Sold" | "0 sold" | "No sales" | "Not logged";
export type ItemDetailRow = { date: string; qty: number; status: ItemDetailStatus };

function itemDetailStatus(log: DailyItemLog | undefined, qty: number): ItemDetailStatus {
  if (!log) return qty > 0 ? "Sold" : "Not logged";
  if (log.status === "no_sales") return "No sales";
  return qty > 0 ? "Sold" : "0 sold";
}

/** One item's quantity for every day of the period, with the status of that day. */
export function itemDetailRows(input: {
  rows: ItemSale[];
  dailyLogs: DailyItemLog[];
  itemId: string;
  period: ReportPeriod;
}): ItemDetailRow[] {
  const qtyByDate = new Map<string, number>();
  for (const row of input.rows) {
    if (row.itemId !== input.itemId || !inPeriod(row.date, input.period)) continue;
    qtyByDate.set(row.date, (qtyByDate.get(row.date) ?? 0) + row.qty);
  }
  const logByDate = new Map(input.dailyLogs.map((log) => [log.date, log]));
  return datesInPeriod(input.period).map((date) => {
    const qty = qtyByDate.get(date) ?? 0;
    return { date, qty, status: itemDetailStatus(logByDate.get(date), qty) };
  });
}

export function itemDetailSummary(rows: ItemDetailRow[]) {
  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const loggedDays = rows.filter((row) => row.status !== "Not logged").length;
  return {
    totalQty,
    loggedDays,
    averageQty: loggedDays > 0 ? totalQty / loggedDays : null,
    salesDays: rows.filter((row) => row.qty > 0).length,
    noSalesDays: rows.filter((row) => row.status === "No sales").length,
    unloggedDays: rows.filter((row) => row.status === "Not logged").length,
  };
}

export type Grain = "day" | "week" | "month";

/** The bucket a date falls in: the date itself, its Monday, or its first of the month, as YYYY-MM. */
export function periodKey(date: string, grain: Grain): string {
  if (grain === "day") return date;
  return grain === "week" ? weekKey(date) : monthKey(date);
}

/** The full label used in exports and tooltips. */
export function periodLabel(key: string, grain: Grain): string {
  if (grain === "day") return formatDisplay(key);
  return grain === "week" ? formatWeekDisplay(key) : formatMonthDisplay(key);
}

/** A short axis label: "12 Oct", "6–12 Oct 2026", "Oct 2026". */
export function chartLabel(key: string, grain: Grain): string {
  if (grain === "week") return formatPeriodRange({ from: key, to: addDaysISO(key, 6) });
  if (grain === "month") {
    const [year, month] = key.split("-");
    return `${SHORT_MONTHS[Number(month) - 1]} ${year}`;
  }
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}

/** Quantity per bucket for the period, oldest first. Every bucket with a sale appears; none is cut off. */
export function qtyByPeriod(rows: ItemSale[], grain: Grain, period: ReportPeriod): { key: string; qty: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!inPeriod(row.date, period)) continue;
    const key = periodKey(row.date, grain);
    totals.set(key, (totals.get(key) ?? 0) + row.qty);
  }
  return [...totals]
    .map(([key, qty]) => ({ key, qty }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function topSellers(rows: ItemSale[], period: ReportPeriod, limit = 8): { name: string; qty: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!inPeriod(row.date, period)) continue;
    totals.set(row.itemName, (totals.get(row.itemName) ?? 0) + row.qty);
  }
  return [...totals]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The date one day, week or month away from a cursor. A month step keeps the day, or the last day of a shorter month. */
export function shiftCursor(date: string, grain: Grain, direction: 1 | -1): string {
  if (grain === "day") return addDaysISO(date, direction);
  if (grain === "week") return addDaysISO(date, 7 * direction);
  return toISODate(addMonths(parseISO(date), direction));
}

/** Main portions in one bucket, for the step-through navigator. */
export function mainQtyInBucket(rows: ItemSale[], isMain: (row: ItemSale) => boolean, grain: Grain, key: string): number {
  return rows
    .filter((row) => isMain(row) && periodKey(row.date, grain) === key)
    .reduce((sum, row) => sum + row.qty, 0);
}

/** The leading Main item for each weekday in the period, in calendar order. Null where none sold. */
export function topMainItemByWeekday(
  rows: ItemSale[],
  isMain: (row: ItemSale) => boolean,
  period: ReportPeriod
): { weekday: string; top: { name: string; qty: number } | null }[] {
  const byWeekday = new Map<number, Map<string, { name: string; qty: number }>>();
  for (const row of rows) {
    if (!isMain(row) || !inPeriod(row.date, period)) continue;
    const index = weekdayIndex(row.date);
    if (index === null) continue;
    const items = byWeekday.get(index) ?? new Map<string, { name: string; qty: number }>();
    const item = items.get(row.itemId) ?? { name: row.itemName, qty: 0 };
    item.qty += row.qty;
    items.set(row.itemId, item);
    byWeekday.set(index, items);
  }
  return WEEKDAY_DEFINITIONS.map((day) => {
    const top = [...(byWeekday.get(day.index)?.values() ?? [])]
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))[0];
    return { weekday: day.label, top: top ?? null };
  });
}
