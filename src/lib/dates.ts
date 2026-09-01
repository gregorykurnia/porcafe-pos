import {
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
  return format(parseISO(dateISO), "d MMM yyyy");
}

export function formatWeekDisplay(dateISO: string): string {
  return `Week of ${format(parseISO(dateISO), "d MMM")}`;
}

export function formatMonthDisplay(monthISO: string): string {
  return format(parseISO(`${monthISO}-01`), "MMMM yyyy");
}

export function idr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}
