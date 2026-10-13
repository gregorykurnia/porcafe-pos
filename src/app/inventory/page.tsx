"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UsageRecap } from "@/components/inventory/usage-recap";
import type { StockSummary } from "@/components/inventory/stock-dashboard";
import { PushAlertsChip } from "@/components/push-notifications-settings";
import { PageTabs, type PageTab } from "@/components/patterns/page-tabs";
import { StatStrip, type StatCell } from "@/components/patterns/stat-strip";
import { ToneShape } from "@/components/patterns/status-chip";
import { AsyncSection, type AsyncStatus } from "@/components/state/async-section";
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
const STOCK_PAGE_TABS: PageTab<StockTab>[] = [
  { value: "stock", label: "Stock" },
  { value: "to-order", label: "To order" },
  { value: "orders", label: "Orders" },
  { value: "usage", label: "Usage recap" },
];

/** A short date for the summary figure: "Mon, 12 Oct". */
function formatCountDate(dateISO: string): string {
  return format(parseISO(dateISO), "EEE, d MMM");
}

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
      <CardContent className="flex items-center justify-center gap-2 p-10 text-table text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />Loading inventory section…
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
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);

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
    const status: AsyncStatus = loadedTabs.has(tab) ? "ready" : tabErrors[tab] ? "error" : "loading";
    return (
      <AsyncSection
        status={status}
        label="Loading inventory section"
        onRetry={() => void refresh(tab)}
        errorTitle="Could not load this inventory section"
        errorDescription={tabErrors[tab]}
      >
        {children}
      </AsyncSection>
    );
  };

  // To order and Orders share one Suppliers panel, so an order being drafted survives a switch between them.
  const supplierView: SupplierView = activeTab === "orders" ? "orders" : "to-order";

  // Figures for the summary strip. A warning shape marks To order above zero, and only Negative takes the danger tone.
  const toOrderCount = stockSummary?.toOrder ?? null;
  const negativeCount = stockSummary?.negative ?? null;
  const summaryCells: StatCell[] = [
    {
      label: "To order",
      value: (
        <span className="inline-flex items-center gap-2">
          {toOrderCount !== null && toOrderCount > 0 ? <ToneShape tone="warn" className="text-warn-mark" /> : null}
          {toOrderCount ?? "—"}
        </span>
      ),
      note: "At or below alert level",
    },
    { label: "Materials on order", value: stockSummary?.onOrder ?? "—" },
    {
      label: "Negative",
      value: (
        <span className="inline-flex items-center gap-2">
          {negativeCount !== null && negativeCount > 0 ? <ToneShape tone="danger" className="text-danger" /> : null}
          {negativeCount ?? "—"}
        </span>
      ),
      tone: negativeCount !== null && negativeCount > 0 ? "danger" : undefined,
      note: "Warnings only",
    },
    { label: "Last count", value: stockSummary?.lastCount ? formatCountDate(stockSummary.lastCount) : "—" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium text-brand tablet:text-title-1">Stock</h1>
          <p className="mt-1 text-small text-ink-muted">Stock on hand, movements, and what the menu used. Negative stock is flagged for review.</p>
        </div>
        <PushAlertsChip />
      </header>

      <StatStrip label="Stock summary" cells={summaryCells} />

      <PageTabs label="Inventory sections" value={activeTab} tabs={STOCK_PAGE_TABS} onChange={handleTabChange} />

      {visitedTabs.has("stock") && (
        <div role="tabpanel" aria-label="Stock" hidden={activeTab !== "stock"}>
          {section("stock", <StockDashboard materials={materials} onChanged={refresh} scheduleRefreshKey={scheduleRefreshKey} openOrders={supplierOrders} onReceiveAgainst={openReceiveAgainst} onOrderMaterial={openOrderFor} onSummaryChange={setStockSummary} />)}
        </div>
      )}
      {visitedTabs.has("usage") && (
        <div role="tabpanel" aria-label="Usage recap" hidden={activeTab !== "usage"}>
          <UsageRecap />
        </div>
      )}
      {(activeTab === "to-order" || activeTab === "orders") && (
        <div role="tabpanel" aria-label={supplierView === "orders" ? "Orders" : "To order"}>
          {section(supplierView, <Suppliers view={supplierView} onViewChange={handleTabChange} materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={supplierOrders} schedules={supplierSchedules} receiveRequest={receiveRequest} orderRequest={orderRequest} onChanged={refresh} />)}
        </div>
      )}
    </div>
  );
}
