import type {
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  InventoryUnit,
} from "./types";
import { normalizeSourceLabel } from "./inventory-source";

export type RecipeValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export const INVENTORY_UNITS: Array<{ value: InventoryUnit; label: string }> = [
  { value: "g", label: "grams (g)" },
  { value: "ml", label: "milliliters (ml)" },
  { value: "pcs", label: "pieces (pcs)" },
];

export function normalizeInventoryName(value: string): string {
  return normalizeSourceLabel(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findMaterialByName(materials: InventoryMaterial[], name: string): InventoryMaterial | undefined {
  const normalized = normalizeInventoryName(name);
  return materials.find((material) => material.normalizedName === normalized);
}

export function validateRecipe(
  recipe: InventoryRecipeVersion,
  lines: InventoryRecipeLine[],
  materials: InventoryMaterial[],
  recipes: InventoryRecipeVersion[],
  allRecipeLines: InventoryRecipeLine[] = lines
): RecipeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const recipeByTargetId = new Map<string, InventoryRecipeVersion>();

  for (const candidate of recipes) {
    const existing = recipeByTargetId.get(candidate.targetId);
    if (!existing || candidate.version > existing.version) recipeByTargetId.set(candidate.targetId, candidate);
  }
  recipeByTargetId.set(recipe.targetId, recipe);
  const linesByRecipeId = new Map<string, InventoryRecipeLine[]>();
  for (const line of allRecipeLines) {
    const recipeLines = linesByRecipeId.get(line.recipeId) ?? [];
    recipeLines.push(line);
    linesByRecipeId.set(line.recipeId, recipeLines);
  }
  linesByRecipeId.set(recipe.id, lines);

  if (!recipe.targetId || !recipe.targetName.trim()) {
    errors.push("Choose a recipe target before saving.");
  }

  if (recipe.targetType === "prepared_component" && recipe.basis === "batch") {
    if (recipe.yieldQuantity === null || !Number.isFinite(recipe.yieldQuantity) || recipe.yieldQuantity <= 0) {
      errors.push("Batch components need a positive yield quantity.");
    }
    if (!recipe.yieldUnit) errors.push("Batch components need a yield unit.");
  }

  if (recipe.targetType === "menu_item" && recipe.basis !== "per_portion") {
    errors.push("Menu-item recipes must use a per-portion basis.");
  }

  if (recipe.status === "active" && !recipe.effectiveFrom) {
    errors.push("Active recipes need an effective-from date.");
  }

  const seenLineIds = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const lineLabel = `Recipe line ${index + 1}`;
    if (seenLineIds.has(line.id)) errors.push(`${lineLabel} has a duplicate line id.`);
    seenLineIds.add(line.id);

    if (!line.ingredientId || !line.ingredientName.trim()) {
      errors.push(`${lineLabel} needs an ingredient or component mapping.`);
    }
    if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      errors.push(`${lineLabel} needs a positive quantity.`);
    }
    if (!line.unit) errors.push(`${lineLabel} needs a normalized unit.`);

    if (line.ingredientType === "material") {
      const material = materialById.get(line.ingredientId);
      if (!material) {
        errors.push(`${lineLabel} points to a material that does not exist.`);
      } else if (line.unit && material.baseUnit !== line.unit) {
        warnings.push(`${lineLabel} uses ${line.unit}, while ${material.name} is stored in ${material.baseUnit}; no conversion is configured.`);
      }
    } else {
      const child = recipeByTargetId.get(line.ingredientId);
      if (!child) {
        errors.push(`${lineLabel} points to a component without a recipe definition.`);
      } else if (child.targetId === recipe.targetId) {
        errors.push(`${lineLabel} creates a component cycle.`);
      } else if (child.targetType !== "prepared_component") {
        errors.push(`${lineLabel} must point to a prepared component recipe.`);
      }
    }
  }

  // A small DFS catches indirect component cycles without making recipe saves
  // depend on a server-side calculation engine in Phase 1.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(targetId: string): boolean {
    if (visiting.has(targetId)) return true;
    if (visited.has(targetId)) return false;
    visiting.add(targetId);
    const candidate = recipeByTargetId.get(targetId);
    const cycle = Boolean(candidate && linesForTarget(candidate.targetId).some((line) =>
      line.ingredientType === "component" && visit(line.ingredientId)
    ));
    visiting.delete(targetId);
    visited.add(targetId);
    return cycle;
  }

  function linesForTarget(targetId: string): InventoryRecipeLine[] {
    const candidate = recipeByTargetId.get(targetId);
    if (!candidate) return [];
    return linesByRecipeId.get(candidate.id) ?? [];
  }

  if (visit(recipe.targetId)) errors.push("The component graph contains a cycle.");

  return { valid: errors.length === 0, errors, warnings };
}

export function recipeStatusLabel(status: InventoryRecipeVersion["status"]): string {
  return status === "needs-review" ? "Needs review" : status.charAt(0).toUpperCase() + status.slice(1);
}
