import assert from "node:assert/strict";
import test from "node:test";
import { calculateDailyInventoryUsage, isInventoryUsageEnabledForDate } from "./inventory-usage";
import type {
  DailyItemLog,
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  MenuItem,
} from "./types";

const timestamp = 100;

function material(id: string, name: string, baseUnit: "g" | "pcs" = "g"): InventoryMaterial {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    type: "raw_ingredient",
    baseUnit,
    active: true,
    reviewStatus: "approved",
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function recipe(
  id: string,
  targetType: "menu_item" | "prepared_component",
  targetId: string,
  targetName: string,
  basis: "per_portion" | "batch" = "per_portion",
  yieldQuantity: number | null = null,
  yieldUnit: "g" | "pcs" | null = null
): InventoryRecipeVersion {
  return {
    id,
    targetType,
    targetId,
    targetName,
    version: 1,
    status: "active",
    basis,
    effectiveFrom: "2026-09-21",
    yieldQuantity,
    yieldUnit,
    reviewStatus: "approved",
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function line(
  id: string,
  recipeId: string,
  ingredientType: "material" | "component",
  ingredientId: string,
  ingredientName: string,
  quantity: number,
  unit: "g" | "pcs",
  sourceRef: string
): InventoryRecipeLine {
  return {
    id,
    recipeId,
    ingredientType,
    ingredientId,
    ingredientName,
    quantity,
    unit,
    sourceRef,
    reviewStatus: "approved",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function log(status: DailyItemLog["status"] = "draft"): DailyItemLog {
  return {
    id: "2026-09-21",
    date: "2026-09-21",
    quantities: { "menu-nanban": 2 },
    totalQty: 2,
    status,
    source: "manual",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const menuItem: MenuItem = {
  id: "menu-nanban",
  name: "Chicken Nanban",
  category: "Main",
  price: 100,
  active: true,
  createdAt: timestamp,
};

test("expands direct, per-portion, and batch recipe lines from saved portions", () => {
  const menuRecipe = recipe("recipe-menu", "menu_item", menuItem.id, menuItem.name);
  const sauceRecipe = recipe("recipe-sauce", "prepared_component", "component-sauce", "Saus Mentai", "batch", 150, "g");
  const eggRecipe = recipe("recipe-egg", "prepared_component", "component-egg", "Egg Salad");
  const event = calculateDailyInventoryUsage({
    log: log(),
    menuItems: [menuItem],
    materials: [material("rice", "Rice"), material("mentai", "Mentai"), material("mayo", "Mayonnaise"), material("egg", "Egg", "pcs")],
    recipes: [menuRecipe, sauceRecipe, eggRecipe],
    recipeLines: [
      line("menu-rice", menuRecipe.id, "material", "rice", "Rice", 75, "g", "D1:F1"),
      line("menu-sauce", menuRecipe.id, "component", sauceRecipe.targetId, sauceRecipe.targetName, 25, "g", "D2:F2"),
      line("menu-egg", menuRecipe.id, "component", eggRecipe.targetId, eggRecipe.targetName, 30, "g", "D3:F3"),
      line("sauce-mentai", sauceRecipe.id, "material", "mentai", "Mentai", 100, "g", "D4:F4"),
      line("sauce-mayo", sauceRecipe.id, "material", "mayo", "Mayonnaise", 50, "g", "D5:F5"),
      line("egg-egg", eggRecipe.id, "material", "egg", "Egg", 6, "pcs", "D6:F6"),
    ],
    calculatedAt: timestamp,
  });

  assert.equal(event.status, "calculated");
  assert.equal(event.totalPortions, 2);
  const usage = Object.fromEntries(event.lines.map((entry) => [entry.materialId, entry.quantity]));
  assert.equal(usage.rice, 150);
  assert.equal(usage.egg, 12);
  assert.ok(Math.abs(usage.mentai - 100 / 3) < 1e-9);
  assert.ok(Math.abs(usage.mayo - 50 / 3) < 1e-9);
});

test("surfaces unit problems and does not publish partial material usage", () => {
  const menuRecipe = recipe("recipe-menu", "menu_item", menuItem.id, menuItem.name);
  const event = calculateDailyInventoryUsage({
    log: log("complete"),
    menuItems: [menuItem],
    materials: [material("rice", "Rice", "pcs")],
    recipes: [menuRecipe],
    recipeLines: [line("menu-rice", menuRecipe.id, "material", "rice", "Rice", 75, "g", "D1:F1")],
    calculatedAt: timestamp,
  });

  assert.equal(event.status, "needs-review");
  assert.equal(event.lines.length, 0);
  assert.equal(event.issues[0]?.code, "unit-mismatch");
});

test("keeps no-sales at zero and gates dates before go-live", () => {
  const noSales = calculateDailyInventoryUsage({
    log: log("no_sales"),
    menuItems: [],
    materials: [],
    recipes: [],
    recipeLines: [],
    calculatedAt: timestamp,
  });
  assert.equal(noSales.status, "no-sales");
  assert.equal(noSales.lines.length, 0);
  assert.equal(noSales.totalPortions, 0);
  assert.equal(isInventoryUsageEnabledForDate("2026-09-20"), false);
  assert.equal(isInventoryUsageEnabledForDate("2026-09-21"), true);
});
