import {
  addDays,
  format,
  isValid,
  startOfWeek,
  startOfMonth,
  parseISO,
} from "date-fns";

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** True for a YYYY-MM-DD string that is a real calendar date. Used to validate URL values. */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && toISODate(parsed) === value;
}

export function addDaysISO(dateISO: string, days: number): string {
  return toISODate(addDays(parseISO(dateISO), days));
}

export function weekKey(dateISO: string): string {
  return toISODate(startOfWeek(parseISO(dateISO), { weekStartsOn: 1 }));
}

export function monthKey(dateISO: string): string {
  return format(startOfMonth(parseISO(dateISO)), "yyyy-MM");
}

export function formatDisplay(dateISO: string): string {
  return format(parseISO(dateISO), "EEEE, d MMM yyyy");
}

export function formatDayDisplay(dateISO: string): string {
  return format(parseISO(dateISO), "EEEE, d MMM");
}

export function formatWeekDisplay(dateISO: string): string {
  const start = parseISO(dateISO);
  return `Week of ${formatDayDisplay(dateISO)} – ${format(addDays(start, 6), "EEEE, d MMM")}`;
}

export function formatMonthDisplay(monthISO: string): string {
  return format(parseISO(`${monthISO}-01`), "MMMM yyyy");
}

export function formatDateTime(timestamp: number): string {
  return format(new Date(timestamp), "EEEE, d MMM yyyy, HH:mm");
}

export function formatTimeOfDay(timestamp: number): string {
  return format(new Date(timestamp), "HH:mm");
}

export function idr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}
