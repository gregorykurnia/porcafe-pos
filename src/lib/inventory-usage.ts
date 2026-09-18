import {
  listInventoryMaterials,
  listInventoryRecipeLines,
  listInventoryRecipeVersions,
  listInventoryUsageEvents,
  listMenuItems,
  upsertInventoryUsageEvent,
} from "./data";
import { syncInventoryConsumption } from "./inventory-ledger";
import type {
  DailyItemLog,
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  InventoryUsageEvent,
  InventoryUsageIssue,
  InventoryUsageLine,
  InventoryUnit,
  MenuItem,
  RecipeTargetType,
} from "./types";

// Phase 0 recorded that the first new entries are expected to begin next week.
// Keep a safe default so existing daily logs cannot be silently backfilled; a
// public deployment variable lets the owner change the date before go-live.
const DEFAULT_INVENTORY_USAGE_GO_LIVE_DATE = "2026-09-21";
const configuredGoLiveDate = process.env.NEXT_PUBLIC_INVENTORY_USAGE_GO_LIVE_DATE;
export const INVENTORY_USAGE_GO_LIVE_DATE =
  configuredGoLiveDate && /^\d{4}-\d{2}-\d{2}$/.test(configuredGoLiveDate)
    ? configuredGoLiveDate
    : DEFAULT_INVENTORY_USAGE_GO_LIVE_DATE;

type CalculationContext = {
  sourceDate: string;
  menuItemId: string;
  menuItemName: string;
  materialsById: Map<string, InventoryMaterial>;
  recipesByTarget: Map<string, InventoryRecipeVersion[]>;
  linesByRecipeId: Map<string, InventoryRecipeLine[]>;
  issues: InventoryUsageIssue[];
  recipeIds: Set<string>;
  visitedRecipeIds: Set<string>;
};

type ExpandedCalculation = {
  lines: InventoryUsageLine[];
  issues: InventoryUsageIssue[];
};

function usageEventId(date: string): string {
  return `usage-${date}`;
}

export function isInventoryUsageEnabledForDate(
  date: string,
  goLiveDate = INVENTORY_USAGE_GO_LIVE_DATE
): boolean {
  return date >= goLiveDate;
}

function addIssue(context: CalculationContext, issue: InventoryUsageIssue) {
  const duplicate = context.issues.some(
    (candidate) =>
      candidate.code === issue.code &&
      candidate.message === issue.message &&
      candidate.menuItemId === issue.menuItemId &&
      candidate.recipeId === issue.recipeId &&
      candidate.sourceRef === issue.sourceRef
  );
  if (!duplicate) context.issues.push(issue);
}

function recipeCandidates(
  context: CalculationContext,
  targetType: RecipeTargetType,
  targetId: string
): InventoryRecipeVersion[] {
  return (context.recipesByTarget.get(targetId) ?? []).filter(
    (recipe) => recipe.targetType === targetType
  );
}

function selectRecipe(
  context: CalculationContext,
  targetType: RecipeTargetType,
  targetId: string,
  targetName: string
): InventoryRecipeVersion | null {
  const candidates = recipeCandidates(context, targetType, targetId);
  const eligible = candidates
    .filter(
      (recipe) =>
        recipe.status === "active" &&
        recipe.reviewStatus === "approved" &&
        Boolean(recipe.effectiveFrom) &&
        recipe.effectiveFrom! <= context.sourceDate
    )
    .sort(
      (a, b) =>
        (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? "") || b.version - a.version
    );

  if (eligible[0]) return eligible[0];

  addIssue(context, {
    code: candidates.length > 0 ? "recipe-not-ready" : "missing-recipe",
    message:
      candidates.length > 0
        ? `No approved active recipe is effective for ${targetName} on ${context.sourceDate}.`
        : `No recipe was found for ${targetName}.`,
    menuItemId: context.menuItemId,
    menuItemName: context.menuItemName,
  });
  return null;
}

function recipeLabel(recipe: InventoryRecipeVersion): string {
  return `${recipe.targetName} v${recipe.version}`;
}

function issueForLine(
  context: CalculationContext,
  code: InventoryUsageIssue["code"],
  message: string,
  recipe: InventoryRecipeVersion,
  line: InventoryRecipeLine
) {
  addIssue(context, {
    code,
    message,
    menuItemId: context.menuItemId,
    menuItemName: context.menuItemName,
    recipeId: recipe.id,
    sourceRef: line.sourceRef,
  });
}

function expandRecipe(
  context: CalculationContext,
  recipe: InventoryRecipeVersion,
  multiplier: number,
  recipePath: string[],
  portionQuantity: number,
  rootRecipe: InventoryRecipeVersion
): ExpandedCalculation {
  if (context.visitedRecipeIds.has(recipe.id)) {
    addIssue(context, {
      code: "recipe-cycle",
      message: `Recipe cycle detected through ${recipeLabel(recipe)}.`,
      menuItemId: context.menuItemId,
      menuItemName: context.menuItemName,
      recipeId: recipe.id,
    });
    return { lines: [], issues: [{ code: "recipe-cycle", message: "cycle" }] };
  }

  const lines = context.linesByRecipeId.get(recipe.id) ?? [];
  if (lines.length === 0) {
    addIssue(context, {
      code: "recipe-not-ready",
      message: `${recipeLabel(recipe)} has no recipe lines.`,
      menuItemId: context.menuItemId,
      menuItemName: context.menuItemName,
      recipeId: recipe.id,
    });
    return { lines: [], issues: [{ code: "recipe-not-ready", message: "empty" }] };
  }

  context.visitedRecipeIds.add(recipe.id);
  context.recipeIds.add(recipe.id);
  const expanded: InventoryUsageLine[] = [];
  const localIssues: InventoryUsageIssue[] = [];

  for (const line of lines) {
    if (line.reviewStatus !== "approved") {
      issueForLine(
        context,
        "missing-mapping",
        `${recipeLabel(recipe)} has an unapproved mapping for ${line.ingredientName}.`,
        recipe,
        line
      );
      localIssues.push({ code: "missing-mapping", message: line.ingredientName });
      continue;
    }

    if (
      line.quantity === null ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !line.unit
    ) {
      issueForLine(
        context,
        "invalid-quantity",
        `${recipeLabel(recipe)} has an invalid quantity or unit for ${line.ingredientName}.`,
        recipe,
        line
      );
      localIssues.push({ code: "invalid-quantity", message: line.ingredientName });
      continue;
    }

    if (line.ingredientType === "material") {
      const material = context.materialsById.get(line.ingredientId);
      if (!material) {
        issueForLine(
          context,
          "missing-mapping",
          `${recipeLabel(recipe)} points to a material that no longer exists: ${line.ingredientName}.`,
          recipe,
          line
        );
        localIssues.push({ code: "missing-mapping", message: line.ingredientName });
        continue;
      }

      if (material.reviewStatus !== "approved" || !material.active) {
        issueForLine(
          context,
          "missing-mapping",
          `${material.name} is not approved and active for usage calculation.`,
          recipe,
          line
        );
        localIssues.push({ code: "missing-mapping", message: material.name });
        continue;
      }

      if (material.baseUnit !== line.unit) {
        issueForLine(
          context,
          "unit-mismatch",
          `${recipeLabel(recipe)} uses ${line.unit} for ${material.name}, but its base unit is ${material.baseUnit}; no conversion is configured.`,
          recipe,
          line
        );
        localIssues.push({ code: "unit-mismatch", message: material.name });
        continue;
      }

      const quantity = line.quantity * multiplier;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        issueForLine(
          context,
          "invalid-quantity",
          `${recipeLabel(recipe)} produced an invalid calculated quantity for ${material.name}.`,
          recipe,
          line
        );
        localIssues.push({ code: "invalid-quantity", message: material.name });
        continue;
      }

      expanded.push({
        id: `${context.sourceDate}-${context.menuItemId}-${material.id}-${recipePath.join("|")}-${line.id}`,
        menuItemId: context.menuItemId,
        menuItemName: context.menuItemName,
        portionQuantity,
        materialId: material.id,
        materialName: material.name,
        quantity,
        unit: material.baseUnit,
        rootRecipeId: rootRecipe.id,
        rootRecipeVersion: rootRecipe.version,
        recipePath: [...recipePath, material.name],
        sourceRefs: [
          ...new Set(
            [...recipePath]
              .map((pathPart) => pathPart.match(/\[(.*?)\]$/)?.[1])
              .filter((value): value is string => Boolean(value))
          ),
          ...(line.sourceRef ? [line.sourceRef] : []),
        ],
      });
      continue;
    }

    const child = selectRecipe(context, "prepared_component", line.ingredientId, line.ingredientName);
    if (!child) {
      localIssues.push({ code: "missing-recipe", message: line.ingredientName });
      continue;
    }

    if (child.basis !== "per_portion" && child.basis !== "batch") {
      issueForLine(
        context,
        "missing-component-basis",
        `${child.targetName} has no supported component basis. Choose per portion or batch with yield.`,
        recipe,
        line
      );
      localIssues.push({ code: "missing-component-basis", message: child.targetName });
      continue;
    }

    if (child.basis === "batch") {
      if (
        child.yieldQuantity === null ||
        !Number.isFinite(child.yieldQuantity) ||
        child.yieldQuantity <= 0 ||
        !child.yieldUnit
      ) {
        issueForLine(
          context,
          "missing-component-basis",
          `${recipeLabel(child)} needs a positive yield quantity and unit before it can be expanded.`,
          recipe,
          line
        );
        localIssues.push({ code: "missing-component-basis", message: child.targetName });
        continue;
      }
      if (line.unit !== child.yieldUnit) {
        issueForLine(
          context,
          "unit-mismatch",
          `${recipeLabel(recipe)} uses ${line.unit} for ${child.targetName}, but its yield unit is ${child.yieldUnit}; no conversion is configured.`,
          recipe,
          line
        );
        localIssues.push({ code: "unit-mismatch", message: child.targetName });
        continue;
      }
    }

    // A per-portion component is intentionally expanded once per menu portion.
    // This preserves the approved Nanban interpretation. Batch components scale
    // by the parent line quantity divided by the component yield.
    const childMultiplier =
      child.basis === "batch"
        ? multiplier * (line.quantity / child.yieldQuantity!)
        : multiplier;
    const childResult = expandRecipe(
      context,
      child,
      childMultiplier,
      [...recipePath, `${child.targetName} [${line.sourceRef ?? line.id}]`],
      portionQuantity,
      rootRecipe
    );
    expanded.push(...childResult.lines);
    localIssues.push(...childResult.issues);
  }

  context.visitedRecipeIds.delete(recipe.id);
  return { lines: expanded, issues: localIssues };
}

function buildContext(
  log: DailyItemLog,
  materials: InventoryMaterial[],
  recipes: InventoryRecipeVersion[],
  recipeLines: InventoryRecipeLine[],
  menuItem: MenuItem
): CalculationContext {
  const recipesByTarget = new Map<string, InventoryRecipeVersion[]>();
  for (const recipe of recipes) {
    const targetRecipes = recipesByTarget.get(recipe.targetId) ?? [];
    targetRecipes.push(recipe);
    recipesByTarget.set(recipe.targetId, targetRecipes);
  }
  const linesByRecipeId = new Map<string, InventoryRecipeLine[]>();
  for (const line of recipeLines) {
    const recipeLinesForId = linesByRecipeId.get(line.recipeId) ?? [];
    recipeLinesForId.push(line);
    linesByRecipeId.set(line.recipeId, recipeLinesForId);
  }
  return {
    sourceDate: log.date,
    menuItemId: menuItem.id,
    menuItemName: menuItem.name,
    materialsById: new Map(materials.map((material) => [material.id, material])),
    recipesByTarget,
    linesByRecipeId,
    issues: [],
    recipeIds: new Set<string>(),
    visitedRecipeIds: new Set<string>(),
  };
}

export type InventoryUsageCalculationInput = {
  log: DailyItemLog;
  menuItems: MenuItem[];
  materials: InventoryMaterial[];
  recipes: InventoryRecipeVersion[];
  recipeLines: InventoryRecipeLine[];
  goLiveDate?: string;
  calculatedAt?: number;
};

export function calculateDailyInventoryUsage({
  log,
  menuItems,
  materials,
  recipes,
  recipeLines,
  goLiveDate = INVENTORY_USAGE_GO_LIVE_DATE,
  calculatedAt = Date.now(),
}: InventoryUsageCalculationInput): InventoryUsageEvent {
  if (log.status === "no_sales") {
    return {
      id: usageEventId(log.date),
      sourceDate: log.date,
      sourceDailyLogId: log.id,
      sourceRevision: log.updatedAt,
      sourceStatus: log.status,
      status: "no-sales",
      totalPortions: 0,
      lines: [],
      issues: [],
      recipeIds: [],
      goLiveDate,
      calculatedAt,
    };
  }

  const allIssues: InventoryUsageIssue[] = [];
  const allLines: InventoryUsageLine[] = [];
  const recipeIds = new Set<string>();
  let totalPortions = 0;

  for (const [menuItemId, portionQuantity] of Object.entries(log.quantities).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Number.isFinite(portionQuantity) || portionQuantity <= 0) {
      allIssues.push({
        code: "invalid-quantity",
        message: `Daily log contains an invalid quantity for menu item ${menuItemId}.`,
        menuItemId,
      });
      continue;
    }
    totalPortions += portionQuantity;

    const menuItem = menuItems.find((candidate) => candidate.id === menuItemId);
    if (!menuItem) {
      allIssues.push({
        code: "missing-menu-item",
        message: `Daily log references a menu item that no longer exists: ${menuItemId}.`,
        menuItemId,
      });
      continue;
    }

    const context = buildContext(log, materials, recipes, recipeLines, menuItem);
    const recipe = selectRecipe(context, "menu_item", menuItem.id, menuItem.name);
    if (!recipe) {
      allIssues.push(...context.issues);
      continue;
    }

    if (recipe.basis !== "per_portion") {
      context.issues.push({
        code: "missing-component-basis",
        message: `${recipeLabel(recipe)} must use a per-portion basis for a menu item.`,
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        recipeId: recipe.id,
      });
    }

    const expanded =
      context.issues.length > 0
        ? { lines: [], issues: context.issues }
        : expandRecipe(context, recipe, portionQuantity, [recipeLabel(recipe)], portionQuantity, recipe);
    const result = context.issues.length > 0 ? { lines: [], issues: context.issues } : expanded;
    allLines.push(...result.lines);
    allIssues.push(...context.issues, ...result.issues);
    for (const recipeId of context.recipeIds) recipeIds.add(recipeId);
  }

  const uniqueIssues = allIssues.filter(
    (issue, index, issues) =>
      issues.findIndex(
        (candidate) =>
          candidate.code === issue.code &&
          candidate.message === issue.message &&
          candidate.menuItemId === issue.menuItemId &&
          candidate.recipeId === issue.recipeId &&
          candidate.sourceRef === issue.sourceRef
      ) === index
  );

  return {
    id: usageEventId(log.date),
    sourceDate: log.date,
    sourceDailyLogId: log.id,
    sourceRevision: log.updatedAt,
    sourceStatus: log.status,
    status: uniqueIssues.length > 0 ? "needs-review" : "calculated",
    totalPortions,
    lines: allLines,
    issues: uniqueIssues,
    recipeIds: [...recipeIds],
    goLiveDate,
    calculatedAt,
  };
}

export async function calculateAndPersistDailyInventoryUsage(
  log: DailyItemLog,
  options?: { goLiveDate?: string; calculatedAt?: number }
): Promise<InventoryUsageEvent | null> {
  const goLiveDate = options?.goLiveDate ?? INVENTORY_USAGE_GO_LIVE_DATE;
  if (!isInventoryUsageEnabledForDate(log.date, goLiveDate)) return null;

  const [menuItems, materials, recipes, recipeLines] = await Promise.all([
    listMenuItems(),
    listInventoryMaterials(),
    listInventoryRecipeVersions(),
    listInventoryRecipeLines(),
  ]);
  const event = calculateDailyInventoryUsage({
    log,
    menuItems,
    materials,
    recipes,
    recipeLines,
    goLiveDate,
    calculatedAt: options?.calculatedAt,
  });
  await upsertInventoryUsageEvent(event);
  await syncInventoryConsumption(event);
  return event;
}

export async function listInventoryUsageRecap(
  startDate: string,
  endDate: string
): Promise<InventoryUsageEvent[]> {
  return listInventoryUsageEvents(startDate, endDate);
}

export function summarizeInventoryUsage(events: InventoryUsageEvent[]) {
  const byMaterial = new Map<
    string,
    { materialId: string; materialName: string; quantity: number; unit: InventoryUnit }
  >();
  for (const event of events) {
    if (event.status !== "calculated") continue;
    for (const line of event.lines) {
      const key = `${line.materialId}:${line.unit}`;
      const existing = byMaterial.get(key) ?? {
        materialId: line.materialId,
        materialName: line.materialName,
        quantity: 0,
        unit: line.unit,
      };
      existing.quantity += line.quantity;
      byMaterial.set(key, existing);
    }
  }
  return [...byMaterial.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function formatInventoryUsageQuantity(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
