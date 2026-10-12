"use client";

import { Suppliers } from "@/components/inventory/suppliers";
import { AsyncSection } from "@/components/state/async-section";
import { useLoadedData } from "@/hooks/use-loaded-data";
import {
  listInventoryMaterials,
  listInventorySupplierDeliverySchedules,
  listInventorySupplierItems,
  listInventorySupplierOrders,
  listInventorySuppliers,
} from "@/lib/data";

async function loadSupplierData() {
  const [materials, suppliers, supplierItems, orders, schedules] = await Promise.all([
    listInventoryMaterials(),
    listInventorySuppliers(),
    listInventorySupplierItems(),
    listInventorySupplierOrders(),
    listInventorySupplierDeliverySchedules(),
  ]);
  return { materials, suppliers, supplierItems, orders, schedules };
}

/** Supplier setup in Setup: suppliers and prices, reorder settings and delivery schedules. */
export function SuppliersSetup() {
  const { status, data, reload } = useLoadedData(loadSupplierData, "suppliers");
  return (
    <AsyncSection status={status} label="Loading suppliers" onRetry={() => void reload()} errorTitle="Couldn't load suppliers">
      {data && (
        <Suppliers
          view="setup"
          onViewChange={() => undefined}
          materials={data.materials}
          suppliers={data.suppliers}
          supplierItems={data.supplierItems}
          orders={data.orders}
          schedules={data.schedules}
          receiveRequest={null}
          orderRequest={null}
          onChanged={reload}
        />
      )}
    </AsyncSection>
  );
}
