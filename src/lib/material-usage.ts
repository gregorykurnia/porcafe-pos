export type MaterialUsageCounts = {
  movements: number;
  recipeLines: number;
  supplierItems: number;
  schedules: number;
};

export function hasMaterialUsage(counts: MaterialUsageCounts): boolean {
  return counts.movements + counts.recipeLines + counts.supplierItems + counts.schedules > 0;
}

function countPhrase(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Why the base unit cannot change, or null when nothing uses the material yet.
 * A unit change would make existing quantities mean the wrong thing, so the
 * material must be replaced instead.
 */
export function describeUnitChangeBlock(
  material: { name: string; baseUnit: string },
  counts: MaterialUsageCounts
): string | null {
  if (!hasMaterialUsage(counts)) return null;

  const parts: string[] = [];
  if (counts.movements > 0) parts.push(countPhrase(counts.movements, "stock movement"));
  if (counts.recipeLines > 0) parts.push(countPhrase(counts.recipeLines, "recipe line"));
  if (counts.supplierItems > 0) parts.push(countPhrase(counts.supplierItems, "supplier link"));
  if (counts.schedules > 0) parts.push(countPhrase(counts.schedules, "delivery schedule"));

  return `${material.name} has ${joinPhrases(parts)} in ${material.baseUnit}. Create a new material instead.`;
}
