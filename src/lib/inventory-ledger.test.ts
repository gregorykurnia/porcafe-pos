import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUsageMaterials, summarizeInventoryBalances } from "./inventory-ledger";
import type {
  InventoryMaterial,
  InventoryMovement,
  InventoryStockSetup,
  InventoryUsageEvent,
} from "./types";

const timestamp = 100;

function material(id: string, name: string): InventoryMaterial {
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    type: "raw_ingredient",
    baseUnit: "g",
    active: true,
    reviewStatus: "approved",
    sourceRefs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function movement(id: string, materialId: string, quantity: number): InventoryMovement {
  return {
    id,
    materialId,
    materialName: materialId,
    unit: "g",
    quantity,
    movementType: "manual_adjustment",
    occurredOn: "2026-09-21",
    reason: "test",
    sourceRef: "test",
    createdAt: timestamp,
  };
}

const initializedSetup: InventoryStockSetup = {
  id: "default",
  initialized: true,
  openingDate: "2026-09-21",
  materialCount: 1,
  initializedAt: timestamp,
  updatedAt: timestamp,
};

const usageEvent: InventoryUsageEvent = {
  id: "usage-2026-09-21",
  sourceDate: "2026-09-21",
  sourceDailyLogId: "2026-09-21",
  sourceRevision: 200,
  sourceStatus: "draft",
  status: "calculated",
  totalPortions: 2,
  lines: [
    {
      id: "line-1",
      menuItemId: "menu-1",
      menuItemName: "Dish",
      portionQuantity: 2,
      materialId: "rice",
      materialName: "Rice",
      quantity: 150,
      unit: "g",
      rootRecipeId: "recipe-1",
      rootRecipeVersion: 1,
      recipePath: ["Dish v1", "Rice"],
      sourceRefs: ["D1:F1"],
    },
    {
      id: "line-2",
      menuItemId: "menu-2",
      menuItemName: "Side",
      portionQuantity: 1,
      materialId: "rice",
      materialName: "Rice",
      quantity: 50,
      unit: "g",
      rootRecipeId: "recipe-2",
      rootRecipeVersion: 1,
      recipePath: ["Side v1", "Rice"],
      sourceRefs: ["D2:F2"],
    },
  ],
  issues: [],
  recipeIds: ["recipe-1", "recipe-2"],
  goLiveDate: "2026-09-21",
  calculatedAt: timestamp,
};

test("hides current quantities until opening stock is initialized", () => {
  const [balance] = summarizeInventoryBalances([material("rice", "Rice")], [movement("m1", "rice", -50)], null);
  assert.equal(balance.currentQuantity, null);
  assert.equal(balance.isNegative, false);
  assert.equal(balance.movementQuantity, -50);
});

test("sums ledger movements and flags zero or negative stock", () => {
  const balances = summarizeInventoryBalances(
    [material("rice", "Rice"), material("egg", "Egg")],
    [movement("opening", "rice", 100), movement("consume", "rice", -120), movement("egg-opening", "egg", 0)],
    initializedSetup
  );
  const rice = balances.find((balance) => balance.materialId === "rice");
  const egg = balances.find((balance) => balance.materialId === "egg");
  assert.equal(rice?.currentQuantity, -20);
  assert.equal(rice?.isNegative, true);
  assert.equal(egg?.currentQuantity, 0);
  assert.equal(egg?.isNegative, false);
});

test("aggregates calculated usage by material before ledger application", () => {
  const aggregated = aggregateUsageMaterials(usageEvent);
  assert.deepEqual(aggregated, [{ materialId: "rice", materialName: "Rice", unit: "g", quantity: 200 }]);
  assert.deepEqual(aggregateUsageMaterials({ ...usageEvent, status: "needs-review" }), []);
});

