// The shared period for the Reports area. One period drives the Revenue, Items and Weekday
// tabs. Dates are YYYY-MM-DD, and both ends are included.

import { addDaysISO, monthKey } from "./dates";
import { daysInMonth, monthIsOver, previousMonthOf } from "./reporting";
import type { MonthlyAdjustment, SalesEntry } from "./types";

export type ReportPeriod = { from: string; to: string };

export type ReportPresetKey = "this-month" | "last-month" | "last-30-days";
export type ReportPeriodPreset = ReportPresetKey | "custom";

export const REPORT_PRESETS: { key: ReportPresetKey; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-30-days", label: "Last 30 days" },
];

export const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function firstDayOf(month: string): string {
  return `${month}-01`;
}

function lastDayOf(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

function nextMonthOf(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, index, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function presetRange(preset: ReportPresetKey, today: string): ReportPeriod {
  if (preset === "this-month") return { from: firstDayOf(monthKey(today)), to: today };
  if (preset === "last-month") {
    const month = previousMonthOf(monthKey(today));
    return { from: firstDayOf(month), to: lastDayOf(month) };
  }
  return { from: addDaysISO(today, -29), to: today };
}

/** The preset whose dates match this period exactly, or "custom" when none does. */
export function presetFor(period: ReportPeriod, today: string): ReportPeriodPreset {
  const match = REPORT_PRESETS.find(({ key }) => {
    const range = presetRange(key, today);
    return range.from === period.from && range.to === period.to;
  });
  return match?.key ?? "custom";
}

export function isValidPeriod(period: ReportPeriod): boolean {
  return period.from <= period.to;
}

export function inPeriod(date: string, period: ReportPeriod): boolean {
  return date >= period.from && date <= period.to;
}

/** Every calendar day in the period, oldest first. Empty when the period is backwards. */
export function datesInPeriod(period: ReportPeriod): string[] {
  if (!isValidPeriod(period)) return [];
  const dates: string[] = [];
  for (let date = period.from; date <= period.to; date = addDaysISO(date, 1)) dates.push(date);
  return dates;
}

/** Each month, as YYYY-MM, that the period touches at least once. Oldest first. */
export function monthsTouching(period: ReportPeriod): string[] {
  if (!isValidPeriod(period)) return [];
  const months: string[] = [];
  const last = monthKey(period.to);
  for (let month = monthKey(period.from); month <= last; month = nextMonthOf(month)) months.push(month);
  return months;
}

/** A month counts toward a period only when the period covers all of it. */
export function coversWholeMonth(month: string, period: ReportPeriod): boolean {
  return period.from <= firstDayOf(month) && period.to >= lastDayOf(month);
}

/**
 * Compact label for buttons and file names: "12 Oct 2026", "1–12 Oct 2026",
 * "1 Sep – 12 Oct 2026" or "1 Sep 2025 – 12 Oct 2026".
 */
export function formatPeriodRange({ from, to }: ReportPeriod): string {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const fromLabel = SHORT_MONTHS[fromMonth - 1];
  const toLabel = SHORT_MONTHS[toMonth - 1];
  if (from === to) return `${fromDay} ${fromLabel} ${fromYear}`;
  if (fromYear === toYear && fromMonth === toMonth) return `${fromDay}–${toDay} ${fromLabel} ${fromYear}`;
  if (fromYear === toYear) return `${fromDay} ${fromLabel} – ${toDay} ${toLabel} ${toYear}`;
  return `${fromDay} ${fromLabel} ${fromYear} – ${toDay} ${toLabel} ${toYear}`;
}

export type PeriodSelisih = {
  /** Sum of the adjustments for whole months in the period. */
  amount: number;
  includedMonths: { month: string; amount: number }[];
  /** Closed months the period covers only in part. These are not added. */
  partialMonths: { month: string; amount: number }[];
  /** Months that are still open. Their selisih waits until the month ends. */
  pendingMonths: { month: string; amount: number }[];
};

/**
 * The bank reconciliation adjustment for a period. A monthly adjustment is added only when
 * the period covers its whole month. A partial month is listed, never pro-rated, so the
 * figure does not invent a split. Daily figures never change.
 */
export function selisihForPeriod(adjustments: MonthlyAdjustment[], period: ReportPeriod, today: string): PeriodSelisih {
  const includedMonths: PeriodSelisih["includedMonths"] = [];
  const partialMonths: PeriodSelisih["partialMonths"] = [];
  const pendingMonths: PeriodSelisih["pendingMonths"] = [];
  const touching = new Set(monthsTouching(period));
  for (const adjustment of [...adjustments].sort((a, b) => a.month.localeCompare(b.month))) {
    if (!touching.has(adjustment.month)) continue;
    const item = { month: adjustment.month, amount: adjustment.amount };
    if (!monthIsOver(adjustment.month, today)) pendingMonths.push(item);
    else if (coversWholeMonth(adjustment.month, period)) includedMonths.push(item);
    else partialMonths.push(item);
  }
  return {
    amount: includedMonths.reduce((sum, item) => sum + item.amount, 0),
    includedMonths,
    partialMonths,
    pendingMonths,
  };
}

/** Entries inside the period, newest first, for the table. */
export function entriesInPeriod(entries: SalesEntry[], period: ReportPeriod): SalesEntry[] {
  return entries
    .filter((entry) => inPeriod(entry.date, period))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function recordedTotal(entries: SalesEntry[], period: ReportPeriod): number {
  return entriesInPeriod(entries, period).reduce((sum, entry) => sum + entry.total, 0);
}

/** One total per date. Two entries on one date are summed. Optionally stops before a date. */
function recordedByDate(entries: SalesEntry[], period: ReportPeriod, before?: string): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    if (!inPeriod(entry.date, period)) continue;
    if (before !== undefined && entry.date >= before) continue;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.total);
  }
  return byDate;
}

/**
 * Every calendar day in the period, with its recorded total or null. A null stays a gap on the
 * chart, so a day with no record never reads as a zero.
 */
export function dailyRevenueSeries(entries: SalesEntry[], period: ReportPeriod): { date: string; total: number | null }[] {
  const byDate = recordedByDate(entries, period);
  return datesInPeriod(period).map((date) => ({ date, total: byDate.get(date) ?? null }));
}

export type DayStats = {
  average: number | null;
  lowest: number | null;
  highest: number | null;
  days: number;
};

/**
 * Average, lowest and highest over the days that have a record and are already closed. Today
 * is still in progress, so it is left out until the day is over.
 */
export function closedDayStats(entries: SalesEntry[], period: ReportPeriod, today: string): DayStats {
  const totals = [...recordedByDate(entries, period, today).values()];
  if (totals.length === 0) return { average: null, lowest: null, highest: null, days: 0 };
  return {
    average: totals.reduce((sum, value) => sum + value, 0) / totals.length,
    lowest: totals.reduce((low, value) => Math.min(low, value)),
    highest: totals.reduce((high, value) => Math.max(high, value)),
    days: totals.length,
  };
}

export type DayTotal = { date: string; total: number };

/** The latest closed day with a record, and the record before it, for the takeaway. */
export function latestClosedDays(
  entries: SalesEntry[],
  period: ReportPeriod,
  today: string
): { latest: DayTotal; previous: DayTotal | null } | null {
  const days = [...recordedByDate(entries, period, today)].sort((a, b) => b[0].localeCompare(a[0]));
  const [latest, previous] = days;
  if (!latest) return null;
  return {
    latest: { date: latest[0], total: latest[1] },
    previous: previous ? { date: previous[0], total: previous[1] } : null,
  };
}

export type MonthRevenueRow = {
  month: string;
  recorded: number;
  selisih: number;
  reported: number;
  daysRecorded: number;
  /** True when the period covers the whole month, so its adjustment is included in `selisih`. */
  wholeMonth: boolean;
};

/**
 * Totals for each month the period touches. The rows add up to the period's tiles: the sum of
 * `reported` equals recorded sales plus the selisih for whole months.
 */
export function revenueByMonth(entries: SalesEntry[], adjustments: MonthlyAdjustment[], period: ReportPeriod, today: string): MonthRevenueRow[] {
  return monthsTouching(period).map((month) => {
    const inMonth = entriesInPeriod(entries, period).filter((entry) => entry.date.startsWith(`${month}-`));
    const recorded = inMonth.reduce((sum, entry) => sum + entry.total, 0);
    const wholeMonth = coversWholeMonth(month, period);
    const adjustment = adjustments.find((item) => item.month === month)?.amount ?? 0;
    const selisih = wholeMonth && monthIsOver(month, today) ? adjustment : 0;
    return {
      month,
      recorded,
      selisih,
      reported: recorded + selisih,
      daysRecorded: new Set(inMonth.map((entry) => entry.date)).size,
      wholeMonth,
    };
  });
}

export type DailyRevenueRow = {
  date: string;
  bca: number;
  cash: number;
  soundbox: number;
  other: number;
  total: number;
  note: string;
};

/** Daily rows for export, oldest first, with the payment split. */
export function dailyRevenueRows(entries: SalesEntry[], period: ReportPeriod): DailyRevenueRow[] {
  return entries
    .filter((entry) => inPeriod(entry.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((entry) => ({
      date: entry.date,
      bca: entry.bca,
      cash: entry.cash,
      soundbox: entry.soundbox,
      other: entry.other,
      total: entry.total,
      note: entry.note ?? "",
    }));
}

/**
 * The one-line takeaway for the chart: the latest closed day against the day before it. The
 * percentage is shown only when the earlier day has revenue to compare with.
 */
export function revenueTakeaway(
  result: { latest: DayTotal; previous: DayTotal | null } | null,
  format: { money: (value: number) => string; day: (date: string) => string }
): string {
  if (!result) return "No closed day with revenue in this period yet.";
  const { latest, previous } = result;
  const latestText = `${format.day(latest.date)} recorded ${format.money(latest.total)}`;
  if (!previous) return `${latestText}. There is no earlier recorded day in this period to compare with.`;
  if (previous.total <= 0) return `${latestText}. ${format.day(previous.date)} has no revenue to compare with.`;
  const change = (latest.total - previous.total) / previous.total;
  const percent = Math.round(Math.abs(change) * 100);
  if (percent === 0) return `${latestText}, level with ${format.day(previous.date)}.`;
  return `${latestText}, ${change > 0 ? "up" : "down"} ${percent}% on ${format.day(previous.date)}.`;
}
