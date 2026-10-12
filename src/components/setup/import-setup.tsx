"use client";

import { ImportReview } from "@/components/inventory/import-review";
import { AsyncSection } from "@/components/state/async-section";
import { useLoadedData } from "@/hooks/use-loaded-data";
import {
  listInventoryAliasMappings,
  listInventoryMaterials,
  listInventoryRecipeLines,
  listInventoryRecipeVersions,
  listMenuItems,
} from "@/lib/data";

async function loadImportData() {
  const [menuItems, materials, aliases, recipes, recipeLines] = await Promise.all([
    listMenuItems(),
    listInventoryMaterials(),
    listInventoryAliasMappings(),
    listInventoryRecipeVersions(),
    listInventoryRecipeLines(),
  ]);
  return { menuItems, materials, aliases, recipes, recipeLines };
}

/** The workbook import review in Setup. Loads what the review matches against, and reloads it after each change. */
export function ImportSetup() {
  const { status, data, reload } = useLoadedData(loadImportData, "import review");
  return (
    <AsyncSection status={status} label="Loading import review" onRetry={() => void reload()} errorTitle="Couldn't load the import review">
      {data && (
        <ImportReview
          menuItems={data.menuItems}
          materials={data.materials}
          aliases={data.aliases}
          recipes={data.recipes}
          recipeLines={data.recipeLines}
          onChanged={reload}
        />
      )}
    </AsyncSection>
  );
}
