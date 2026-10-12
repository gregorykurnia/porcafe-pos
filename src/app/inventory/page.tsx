"use client";

import { PageHeader } from "@/components/page-header";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Handshake, Loader2, Scale, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageRecap } from "@/components/inventory/usage-recap";
import { PushAlertsChip } from "@/components/push-notifications-settings";
import {
  listInventoryMaterials,
  listInventorySupplierDeliverySchedules,
  listInventorySupplierItems,
  listInventorySupplierOrders,
  listInventorySuppliers,
  runDueInventorySupplierDeliverySchedules,
} from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { isOffline } from "@/lib/connection";
import { stockTabFromParam, type StockTab } from "@/lib/workspace-tabs";
import type {
  InventoryMaterial,
  InventorySupplier,
  InventorySupplierDeliverySchedule,
  InventorySupplierItem,
  InventorySupplierOrder,
} from "@/lib/types";

type DataTab = Exclude<StockTab, "usage">;
type SupplierView = "to-order" | "orders";

const INVENTORY_MATERIALS_CACHE_KEY = "porcafe.inventory.materials.v1";
const TAB_CLASS =
  "min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm";
const TAB_ICON_CLASS = "hidden size-4 shrink-0 lg:block";

function readCachedMaterials(): InventoryMaterial[] | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(INVENTORY_MATERIALS_CACHE_KEY) ?? "null");
    if (!Array.isArray(value)) return null;
    if (!value.every((material) =>
      material &&
      typeof material.id === "string" &&
      typeof material.name === "string" &&
      typeof material.baseUnit === "string" &&
      typeof material.active === "boolean"
    )) return null;
    return value as InventoryMaterial[];
  } catch {
    return null;
  }
}

function writeCachedMaterials(materials: InventoryMaterial[]) {
  try {
    window.localStorage.setItem(INVENTORY_MATERIALS_CACHE_KEY, JSON.stringify(materials));
  } catch {
    // Storage can be unavailable or full; the live Firestore data still works.
  }
}

function preloadInventoryTab(tab: DataTab) {
  switch (tab) {
    case "stock":
      void import("@/components/inventory/stock-dashboard");
      break;
    case "to-order":
    case "orders":
      void import("@/components/inventory/suppliers");
      break;
  }
}

function InventoryTabLoading() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />Loading inventory section…
      </CardContent>
    </Card>
  );
}

function InventoryTabError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-danger/20 bg-danger/5">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Could not load this inventory section</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </CardContent>
    </Card>
  );
}

const StockDashboard = dynamic(
  () => import("@/components/inventory/stock-dashboard").then((module) => module.StockDashboard),
  { loading: InventoryTabLoading }
);
const Suppliers = dynamic(
  () => import("@/components/inventory/suppliers").then((module) => module.Suppliers),
  { loading: InventoryTabLoading }
);

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<StockTab>("stock");
  const [tabPreferencesLoaded, setTabPreferencesLoaded] = useState(false);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [supplierItems, setSupplierItems] = useState<InventorySupplierItem[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<InventorySupplierOrder[]>([]);
  const [supplierSchedules, setSupplierSchedules] = useState<InventorySupplierDeliverySchedule[]>([]);
  const [receiveRequest, setReceiveRequest] = useState<{ orderId: string; requestId: number } | null>(null);
  const [orderRequest, setOrderRequest] = useState<{ materialId: string; requestId: number } | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<StockTab>>(() => new Set());
  const [visitedTabs, setVisitedTabs] = useState<Set<StockTab>>(() => new Set(["stock"]));
  const [tabErrors, setTabErrors] = useState<Partial<Record<DataTab, string>>>({});
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  const materialsLoadedRef = useRef(false);
  const suppliersLoadedRef = useRef(false);
  const cachedMaterialsLoadedRef = useRef(false);
  const cachedDataRefreshStartedRef = useRef(false);
  const scheduleRunRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightTabsRef = useRef<Partial<Record<DataTab, Promise<void>>>>({});

  const refresh = useCallback(async (requestedTab: StockTab = activeTab, force = true) => {
    if (requestedTab === "usage") return;
    const tab = requestedTab;
    const existingRequest = inFlightTabsRef.current[tab];
    if (existingRequest) {
      await existingRequest;
      if (!force) return;
    }

    const task = (async () => {
      setTabErrors((current) => {
        const next = { ...current };
        delete next[tab];
        return next;
      });

      try {
        if (tab === "stock") {
          const shouldLoadMaterials = force || !materialsLoadedRef.current;
          const materialsResult = shouldLoadMaterials ? await listInventoryMaterials() : null;
          if (materialsResult) {
            setMaterials(materialsResult);
            materialsLoadedRef.current = true;
            writeCachedMaterials(materialsResult);
          }
          // Open orders let a receipt be recorded against the order it belongs to.
          setSupplierOrders(await listInventorySupplierOrders());
        } else {
          await scheduleRunRef.current;
          if (force || !suppliersLoadedRef.current || !materialsLoadedRef.current) {
            const [loadedMaterials, loadedSuppliers, loadedSupplierItems, loadedSupplierOrders, loadedSupplierSchedules] = await Promise.all([
              force || !materialsLoadedRef.current ? listInventoryMaterials() : Promise.resolve(null),
              listInventorySuppliers(),
              listInventorySupplierItems(),
              listInventorySupplierOrders(),
              listInventorySupplierDeliverySchedules(),
            ]);
            if (loadedMaterials) {
              setMaterials(loadedMaterials);
              materialsLoadedRef.current = true;
              writeCachedMaterials(loadedMaterials);
            }
            setSuppliers(loadedSuppliers);
            setSupplierItems(loadedSupplierItems);
            setSupplierOrders(loadedSupplierOrders);
            setSupplierSchedules(loadedSupplierSchedules);
            suppliersLoadedRef.current = true;
          }
        }

        setLoadedTabs((current) => new Set(current).add(tab));
      } catch (loadError) {
        console.error(`Failed to load inventory ${tab} section`, loadError);
        setTabErrors((current) => ({
          ...current,
          [tab]: loadError instanceof Error ? loadError.message : "Could not load this inventory section.",
        }));
      }
    })();

    inFlightTabsRef.current[tab] = task;
    try {
      await task;
    } finally {
      if (inFlightTabsRef.current[tab] === task) delete inFlightTabsRef.current[tab];
    }
  }, [activeTab]);

  useEffect(() => {
    // Recurring deliveries are only created when the device is online. A manual run still reports offline.
    if (isOffline()) return;
    scheduleRunRef.current = runDueInventorySupplierDeliverySchedules(todayISO())
      .then((result) => {
        if (result.schedulesRun > 0) setScheduleRefreshKey((current) => current + 1);
      })
      .then(() => undefined)
      .catch((loadError) => {
        console.error("Could not process due supplier deliveries", loadError);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = stockTabFromParam(params.get("tab"));
    const requestedReceiveOrderId = params.get("receive");
    const cachedMaterials = readCachedMaterials();
    setActiveTab(initialTab);
    setVisitedTabs(new Set([initialTab]));
    if (requestedReceiveOrderId) setReceiveRequest({ orderId: requestedReceiveOrderId, requestId: Date.now() });
    if (cachedMaterials) {
      setMaterials(cachedMaterials);
      materialsLoadedRef.current = true;
      cachedMaterialsLoadedRef.current = true;
      setLoadedTabs((current) => new Set(current).add("stock"));
    }
    if (initialTab !== "usage") preloadInventoryTab(initialTab);
    setTabPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!tabPreferencesLoaded || !cachedMaterialsLoadedRef.current || cachedDataRefreshStartedRef.current) return;
    cachedDataRefreshStartedRef.current = true;
    if (activeTab !== "usage") void refresh(activeTab, true);
  }, [activeTab, refresh, tabPreferencesLoaded]);

  useEffect(() => {
    if (tabPreferencesLoaded && activeTab !== "usage" && !loadedTabs.has(activeTab)) {
      void refresh(activeTab, false);
    }
  }, [activeTab, loadedTabs, refresh, tabPreferencesLoaded]);

  useEffect(() => {
    if (!loadedTabs.has("to-order") || activeTab !== "to-order" || window.location.hash !== "#reorder-overview") return;
    window.requestAnimationFrame(() => {
      document.getElementById("reorder-overview")?.scrollIntoView({ block: "start" });
    });
  }, [activeTab, loadedTabs]);

  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as StockTab;
    if (nextTab !== "usage") {
      preloadInventoryTab(nextTab);
      void refresh(nextTab, false);
    }
    setVisitedTabs((current) => new Set(current).add(nextTab));
    setActiveTab(nextTab);
  }, [refresh]);

  // Receiving against an order and ordering a material both happen on the Orders tab.
  const openOrderFor = useCallback((materialId: string) => {
    handleTabChange("orders");
    setOrderRequest({ materialId, requestId: Date.now() });
  }, [handleTabChange]);

  const openReceiveAgainst = useCallback((orderId: string) => {
    handleTabChange("orders");
    setReceiveRequest({ orderId, requestId: Date.now() });
    window.history.replaceState(null, "", `/inventory?tab=orders&receive=${encodeURIComponent(orderId)}`);
  }, [handleTabChange]);

  const section = (tab: DataTab, children: React.ReactNode) => {
    if (loadedTabs.has(tab)) return children;
    if (tabErrors[tab]) return <InventoryTabError message={tabErrors[tab]!} onRetry={() => void refresh(tab)} />;
    return <InventoryTabLoading />;
  };

  // To order and Orders share one Suppliers panel, so an order being drafted survives a switch between them.
  const supplierView: SupplierView = activeTab === "orders" ? "orders" : "to-order";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="Stock on hand, movements, and what the menu used. Negative stock is flagged for review."
        actions={<PushAlertsChip />}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Inventory sections" className="grid w-full grid-cols-2 gap-1 p-1 group-data-horizontal/tabs:h-auto lg:inline-flex lg:w-auto lg:gap-0 lg:group-data-horizontal/tabs:h-8">
          <TabsTrigger value="stock" className={TAB_CLASS}><Scale className={TAB_ICON_CLASS} /><span>Stock</span></TabsTrigger>
          <TabsTrigger value="to-order" className={TAB_CLASS}><Handshake className={TAB_ICON_CLASS} /><span>To order</span></TabsTrigger>
          <TabsTrigger value="orders" className={TAB_CLASS}><Truck className={TAB_ICON_CLASS} /><span>Orders</span></TabsTrigger>
          <TabsTrigger value="usage" className={TAB_CLASS}><BookOpen className={TAB_ICON_CLASS} /><span>Usage recap</span></TabsTrigger>
        </TabsList>

        <TabsContent value="stock" forceMount={visitedTabs.has("stock") ? true : undefined} className={activeTab === "stock" ? "mt-5" : "mt-5 hidden"}>
          {visitedTabs.has("stock") && section("stock", <StockDashboard materials={materials} onChanged={refresh} scheduleRefreshKey={scheduleRefreshKey} openOrders={supplierOrders} onReceiveAgainst={openReceiveAgainst} onOrderMaterial={openOrderFor} />)}
        </TabsContent>
        <TabsContent value="usage" forceMount={visitedTabs.has("usage") ? true : undefined} className={activeTab === "usage" ? "mt-5" : "mt-5 hidden"}>
          {visitedTabs.has("usage") && <UsageRecap />}
        </TabsContent>
        <TabsContent key="suppliers" value={supplierView} className="mt-5">
          {section(supplierView, <Suppliers view={supplierView} onViewChange={handleTabChange} materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={supplierOrders} schedules={supplierSchedules} receiveRequest={receiveRequest} orderRequest={orderRequest} onChanged={refresh} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
