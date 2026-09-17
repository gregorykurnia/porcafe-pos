import {
  addDays,
  format,
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

export function idr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}
