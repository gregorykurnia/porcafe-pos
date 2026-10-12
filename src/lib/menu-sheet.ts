// Sheet order and names for menu items. The daily close lists items in the order of the
// paper sheet, and the scanner matches the names written on it.

export type SheetItem = {
  id: string;
  name: string;
  category: string;
  sheetOrder?: number;
  sheetAliases?: string[];
};

function compareForSheet(a: SheetItem, b: SheetItem): number {
  const aOrder = a.sheetOrder ?? Number.POSITIVE_INFINITY;
  const bOrder = b.sheetOrder ?? Number.POSITIVE_INFINITY;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.name.localeCompare(b.name);
}

/** Sheet order first, then name. Items without a sheet order come last, by name. */
export function sortForSheet<T extends SheetItem>(items: T[]): T[] {
  return [...items].sort(compareForSheet);
}

/**
 * Moves an item one place up or down within its category. Returns the new sheet
 * order for every item in that category, numbered from 1. Empty if the move is off the end.
 */
export function moveWithinCategory<T extends SheetItem>(items: T[], id: string, direction: -1 | 1): Map<string, number> {
  const target = items.find((item) => item.id === id);
  if (!target) return new Map();
  const category = sortForSheet(items.filter((item) => item.category === target.category));
  const index = category.findIndex((item) => item.id === id);
  const next = index + direction;
  if (next < 0 || next >= category.length) return new Map();
  [category[index], category[next]] = [category[next], category[index]];
  return new Map(category.map((item, position) => [item.id, position + 1]));
}

/** "Nanban, Nanban ayam" → ["Nanban", "Nanban ayam"]. Blank and repeated names are dropped. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of text.split(",")) {
    const alias = part.trim();
    const key = alias.toLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

/** Quick filter for the close: matches the item name or any sheet name, ignoring case. */
export function filterSheetItems<T extends SheetItem>(
  items: T[],
  query: string,
  options: { onlyWithQuantity?: boolean; quantities?: Record<string, number> } = {}
): T[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (options.onlyWithQuantity && !((options.quantities?.[item.id] ?? 0) > 0)) return false;
    if (!needle) return true;
    if (item.name.toLowerCase().includes(needle)) return true;
    return (item.sheetAliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
  });
}

export const ITEM_CATEGORIES = ["Main", "Add On"] as const;
