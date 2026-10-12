/**
 * True when the typed quantities differ from the saved log. Blank and zero are the
 * same, and an item missing from either side counts as zero.
 */
export function quantitiesDiffer(typed: Record<string, string>, saved: Record<string, number>): boolean {
  const itemIds = new Set([...Object.keys(typed), ...Object.keys(saved)]);
  for (const itemId of itemIds) {
    const typedValue = parseFloat(typed[itemId] ?? "") || 0;
    const savedValue = saved[itemId] ?? 0;
    if (typedValue !== savedValue) return true;
  }
  return false;
}
