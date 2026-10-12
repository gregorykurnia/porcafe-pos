"use client";

import { Materials } from "@/components/inventory/materials";
import { AsyncSection } from "@/components/state/async-section";
import { useLoadedData } from "@/hooks/use-loaded-data";
import { listInventoryMaterials } from "@/lib/data";

/** Materials in Setup. Loads the list, and reloads it after each change. */
export function MaterialsSetup() {
  const { status, data, reload } = useLoadedData(listInventoryMaterials, "materials");
  return (
    <AsyncSection status={status} label="Loading materials" onRetry={() => void reload()} errorTitle="Couldn't load materials">
      {data && <Materials materials={data} onChanged={reload} />}
    </AsyncSection>
  );
}
