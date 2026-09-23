import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryRecipeLine, InventoryRecipeVersion } from "./types";
import {
  normalizeRecipeBoxLines,
  RECIPE_BOX_MATERIAL_ID,
  recipeRequiresBox,
} from "./inventory";

function recipe(targetName: string): InventoryRecipeVersion {
  return {
    id: `recipe-${targetName}`,
    targetType: "menu_item",
    targetId: targetName,
    targetName,
    version: 1,
    status: "draft",
    basis: "per_portion",
    effectiveFrom: null,
    yieldQuantity: null,
    yieldUnit: null,
    reviewStatus: "approved",
    sourceRefs: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function line(id: string, ingredientId: string): InventoryRecipeLine {
  return {
    id,
    recipeId: "recipe",
    ingredientType: "material",
    ingredientId,
    ingredientName: ingredientId === RECIPE_BOX_MATERIAL_ID ? "Box" : "Rice",
    quantity: ingredientId === RECIPE_BOX_MATERIAL_ID ? 4 : 75,
    unit: ingredientId === RECIPE_BOX_MATERIAL_ID ? "g" : "g",
    sourceRef: null,
    reviewStatus: "approved",
    createdAt: 0,
    updatedAt: 0,
  };
}

test("requires Box only for the specified menu recipes", () => {
  const boxRecipes = [
    "Chicken Nanban",
    "Crispy Pork Belly and Egg",
    "Crispy Pork Belly and Satay",
    "Crispy Pork Belly Mentai",
    "Pork Belly Satay and Egg",
    "Pork Satay and Egg",
    "Smokey Pork",
  ];

  for (const targetName of boxRecipes) {
    assert.equal(recipeRequiresBox(recipe(targetName)), true, targetName);
    const normalized = normalizeRecipeBoxLines(recipe(targetName), [line("rice", "material-rice")], 123);
    assert.deepEqual(
      normalized.find((candidate) => candidate.ingredientId === RECIPE_BOX_MATERIAL_ID),
      {
        id: `recipe-${targetName}-line-box`,
        recipeId: `recipe-${targetName}`,
        ingredientType: "material",
        ingredientId: RECIPE_BOX_MATERIAL_ID,
        ingredientName: "Box",
        quantity: 1,
        unit: "pcs",
        sourceRef: null,
        reviewStatus: "approved",
        note: "Required packaging",
        createdAt: 123,
        updatedAt: 123,
      },
    );
  }
});

test("removes Box from recipes outside the specified menu list", () => {
  const otherRecipe = recipe("Sambal Matah");
  assert.equal(recipeRequiresBox(otherRecipe), false);
  const normalized = normalizeRecipeBoxLines(
    otherRecipe,
    [line("box", RECIPE_BOX_MATERIAL_ID), line("rice", "material-rice")],
    123,
  );
  assert.equal(normalized.some((candidate) => candidate.ingredientId === RECIPE_BOX_MATERIAL_ID), false);
  assert.equal(normalized.length, 1);
});

test("accepts source names that use ampersands", () => {
  assert.equal(recipeRequiresBox(recipe("Crispy Pork Belly & egg")), true);
  assert.equal(recipeRequiresBox(recipe("Pork satay & egg")), true);
  assert.equal(recipeRequiresBox(recipe("Sambal Matah")), false);
});
