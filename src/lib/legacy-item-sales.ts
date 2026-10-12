// Legacy itemSales rows are mirrored for older readers. A confirmed scan replaces them:
// rows for items no longer on the sheet are removed, and only one row per item is kept.

export type LegacyRowRef = { id: string; itemId: string };

export function classifyLegacyItemSales<T extends LegacyRowRef>(
  existing: T[],
  wantedItemIds: ReadonlySet<string>
): { keep: Map<string, string>; stale: T[] } {
  const keep = new Map<string, string>();
  const stale: T[] = [];
  for (const row of existing) {
    if (!wantedItemIds.has(row.itemId) || keep.has(row.itemId)) {
      stale.push(row);
      continue;
    }
    keep.set(row.itemId, row.id);
  }
  return { keep, stale };
}
