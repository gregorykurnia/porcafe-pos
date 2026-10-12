// Shared figures for the dashboard, the item reports and exports. Every screen must read
// item sales through here, so the same month gives the same portions everywhere.

import type { DailyItemLog, ItemSale, MenuItem } from "./types";

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
