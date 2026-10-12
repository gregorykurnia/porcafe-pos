"use client";

import { Recipes } from "@/components/inventory/recipes";
import { AsyncSection } from "@/components/state/async-section";
import { useLoadedData } from "@/hooks/use-loaded-data";
import { listInventoryMaterials, listInventoryRecipeLines, listInventoryRecipeVersions, listMenuItems } from "@/lib/data";

async function loadRecipeData() {
  const [menuItems, materials, recipes, recipeLines] = await Promise.all([
    listMenuItems(),
    listInventoryMaterials(),
    listInventoryRecipeVersions(),
    listInventoryRecipeLines(),
  ]);
  return { menuItems, materials, recipes, recipeLines };
}

/** Recipes in Setup. Loads the menu, materials and recipe versions, and reloads them after each change. */
export function RecipesSetup() {
  const { status, data, reload } = useLoadedData(loadRecipeData, "recipes");
  return (
    <AsyncSection status={status} label="Loading recipes" onRetry={() => void reload()} errorTitle="Couldn't load recipes">
      {data && (
        <Recipes menuItems={data.menuItems} materials={data.materials} recipes={data.recipes} recipeLines={data.recipeLines} onChanged={reload} />
      )}
    </AsyncSection>
  );
}
