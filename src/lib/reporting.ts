// Shared figures for the dashboard, the item reports and exports. Every screen must read
// item sales through here, so the same month gives the same portions everywhere.

import type { DailyItemLog, ItemSale, MenuItem, SalesEntry } from "./types";

/**
 * Item sales for reporting. For each date with a daily close, the close is the only source:
 * a "no sales" close with no items means the day has no rows, even if legacy rows exist. Legacy
 * item rows fill only dates that have no daily close. Names come from the menu, which keeps
 * archived items, so an archived item still reports under its name.
 */
export function getCanonicalItemRows(dailyLogs: DailyItemLog[], legacySales: ItemSale[], menuItems: MenuItem[]): ItemSale[] {
  const closedDates = new Set(dailyLogs.map((log) => log.date));
  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const fromCloses: ItemSale[] = [];

  for (const log of dailyLogs) {
    for (const [itemId, qty] of Object.entries(log.quantities)) {
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const item = menuById.get(itemId);
      if (!item) continue;
      fromCloses.push({
        id: `daily-${log.date}-${itemId}`,
        date: log.date,
        itemId,
        itemName: item.name,
        category: item.category,
        qty,
        createdAt: log.updatedAt,
      });
    }
  }

  const legacyOnDatesWithoutClose = legacySales.filter((sale) => !closedDates.has(sale.date));
  return [...fromCloses, ...legacyOnDatesWithoutClose].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Dates that appear in only one of the two sources. Used to show migration gaps. */
export function sourceDateGaps(dailyLogs: DailyItemLog[], legacySales: ItemSale[]): { legacyOnly: string[]; closedOnly: string[] } {
  const closed = new Set(dailyLogs.map((log) => log.date));
  const legacy = new Set(legacySales.map((sale) => sale.date));
  return {
    legacyOnly: [...legacy].filter((date) => !closed.has(date)).sort(),
    closedOnly: [...closed].filter((date) => !legacy.has(date)).sort(),
  };
}

export type AttentionItem = {
  kind: "today" | "draft" | "portions-without-revenue" | "revenue-without-portions" | "to-order" | "negative-stock" | "scheduled-to-confirm";
  label: string;
  href: string;
  severity: "danger" | "warning" | "info";
  date?: string;
};

function daysBefore(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * What needs doing, in one list: today's close, recent drafts, days whose portions and revenue
 * disagree, and the stock and delivery items when the caller has loaded them.
 */
export function getAttentionItems(input: {
  today: string;
  dailyLogs: DailyItemLog[];
  salesEntries: SalesEntry[];
  draftLookbackDays?: number;
  reconciliationDays?: number;
  stock?: { toOrder: number; negative: number };
  scheduledToConfirm?: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const lookback = input.draftLookbackDays ?? 14;
  const logByDate = new Map(input.dailyLogs.map((log) => [log.date, log]));
  const revenueByDate = new Map<string, number>();
  for (const entry of input.salesEntries) revenueByDate.set(entry.date, (revenueByDate.get(entry.date) ?? 0) + entry.total);
  const portionsOn = (date: string) => Object.values(logByDate.get(date)?.quantities ?? {}).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);

  const todayLog = logByDate.get(input.today);
  if (!todayLog) {
    items.push({ kind: "today", label: "Today's close has not started", href: "/items", severity: "info", date: input.today });
  } else if (todayLog.status === "draft") {
    items.push({ kind: "today", label: "Today is saved as a draft", href: "/items", severity: "warning", date: input.today });
  }

  const earliest = daysBefore(input.today, lookback);
  const drafts = input.dailyLogs
    .filter((log) => log.status === "draft" && log.date < input.today && log.date >= earliest)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const log of drafts) {
    items.push({ kind: "draft", label: `${log.date} is still a draft`, href: "/items", severity: "warning", date: log.date });
  }

  // Portions and revenue are compared over a recent window; older history predates the daily close.
  const recentFrom = daysBefore(input.today, input.reconciliationDays ?? 30);
  const dates = new Set([...logByDate.keys(), ...revenueByDate.keys()].filter((date) => date >= recentFrom));
  for (const date of [...dates].sort((a, b) => b.localeCompare(a))) {
    const portions = portionsOn(date);
    const revenue = revenueByDate.get(date) ?? 0;
    if (portions > 0 && revenue <= 0) {
      items.push({ kind: "portions-without-revenue", label: `${date}: items entered, no revenue recorded`, href: "/items", severity: "warning", date });
    } else if (revenue > 0 && portions <= 0) {
      items.push({ kind: "revenue-without-portions", label: `${date}: revenue recorded, no items closed`, href: "/items", severity: "warning", date });
    }
  }

  if (input.stock && input.stock.negative > 0) {
    items.push({ kind: "negative-stock", label: `${input.stock.negative} material${input.stock.negative === 1 ? " is" : "s are"} below zero`, href: "/inventory", severity: "danger" });
  }
  if (input.stock && input.stock.toOrder > 0) {
    items.push({ kind: "to-order", label: `${input.stock.toOrder} material${input.stock.toOrder === 1 ? " is" : "s are"} to order`, href: "/inventory?tab=to-order", severity: "warning" });
  }
  if (input.scheduledToConfirm && input.scheduledToConfirm > 0) {
    items.push({ kind: "scheduled-to-confirm", label: `${input.scheduledToConfirm} scheduled deliver${input.scheduledToConfirm === 1 ? "y" : "ies"} to confirm`, href: "/inventory?tab=orders", severity: "warning" });
  }
  return items;
}
