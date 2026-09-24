"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Boxes, FileSpreadsheet, Handshake, Loader2, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageRecap } from "@/components/inventory/usage-recap";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import {
  listInventoryAliasMappings,
  listInventoryMaterials,
  listInventoryRecipeLines,
  listInventoryRecipeVersions,
  listMenuItems,
  listInventorySuppliers,
  listInventorySupplierItems,
  listInventorySupplierOrders,
  listInventorySupplierDeliverySchedules,
  runDueInventorySupplierDeliverySchedules,
} from "@/lib/data";
import { todayISO } from "@/lib/dates";
import type {
  InventoryAliasMapping,
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  InventorySupplier,
  InventorySupplierOrder,
  InventorySupplierDeliverySchedule,
  InventorySupplierItem,
  MenuItem,
} from "@/lib/types";

type InventoryTab = "stock" | "usage" | "import" | "materials" | "recipes" | "suppliers";
type DataTab = Exclude<InventoryTab, "usage">;

function preloadInventoryTab(tab: DataTab) {
  switch (tab) {
    case "stock":
      void import("@/components/inventory/stock-dashboard");
      break;
    case "import":
      void import("@/components/inventory/import-review");
      break;
    case "materials":
      void import("@/components/inventory/materials");
      break;
    case "recipes":
      void import("@/components/inventory/recipes");
      break;
    case "suppliers":
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

const ImportReview = dynamic(
  () => import("@/components/inventory/import-review").then((module) => module.ImportReview),
  { loading: InventoryTabLoading }
);
const Materials = dynamic(
  () => import("@/components/inventory/materials").then((module) => module.Materials),
  { loading: InventoryTabLoading }
);
const Recipes = dynamic(
  () => import("@/components/inventory/recipes").then((module) => module.Recipes),
  { loading: InventoryTabLoading }
);
const StockDashboard = dynamic(
  () => import("@/components/inventory/stock-dashboard").then((module) => module.StockDashboard),
  { loading: InventoryTabLoading }
);
const Suppliers = dynamic(
  () => import("@/components/inventory/suppliers").then((module) => module.Suppliers),
  { loading: InventoryTabLoading }
);

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("usage");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [aliases, setAliases] = useState<InventoryAliasMapping[]>([]);
  const [recipes, setRecipes] = useState<InventoryRecipeVersion[]>([]);
  const [recipeLines, setRecipeLines] = useState<InventoryRecipeLine[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [supplierItems, setSupplierItems] = useState<InventorySupplierItem[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<InventorySupplierOrder[]>([]);
  const [supplierSchedules, setSupplierSchedules] = useState<InventorySupplierDeliverySchedule[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<InventoryTab>>(() => new Set());
  const [loadingTabs, setLoadingTabs] = useState<Set<DataTab>>(() => new Set());
  const [tabErrors, setTabErrors] = useState<Partial<Record<DataTab, string>>>({});

  const materialsLoadedRef = useRef(false);
  const foundationLoadedRef = useRef(false);
  const suppliersLoadedRef = useRef(false);
  const scheduleRunRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightTabsRef = useRef<Partial<Record<DataTab, Promise<void>>>>({});

  const refresh = useCallback(async (requestedTab: InventoryTab = activeTab, force = true) => {
    if (requestedTab === "usage") return;
    const tab = requestedTab;
    const existingRequest = inFlightTabsRef.current[tab];
    if (existingRequest) {
      await existingRequest;
      if (!force) return;
    }

    const task = (async () => {
      setLoadingTabs((current) => new Set(current).add(tab));
      setTabErrors((current) => {
        const next = { ...current };
        delete next[tab];
        return next;
      });

      try {
        if (tab === "stock") {
          const shouldLoadMaterials = force || !materialsLoadedRef.current;
          const [materialsResult] = await Promise.all([
            shouldLoadMaterials ? listInventoryMaterials() : Promise.resolve(null),
            scheduleRunRef.current,
          ]);
          if (materialsResult) {
            setMaterials(materialsResult);
            materialsLoadedRef.current = true;
          }
        } else if (tab === "materials") {
          if (force || !materialsLoadedRef.current) {
            setMaterials(await listInventoryMaterials());
            materialsLoadedRef.current = true;
          }
        } else if (tab === "import" || tab === "recipes") {
          if (force || !foundationLoadedRef.current) {
            const [items, loadedMaterials, loadedAliases, loadedRecipes, loadedLines] = await Promise.all([
              listMenuItems(),
              listInventoryMaterials(),
              listInventoryAliasMappings(),
              listInventoryRecipeVersions(),
              listInventoryRecipeLines(),
            ]);
            setMenuItems(items);
            setMaterials(loadedMaterials);
            setAliases(loadedAliases);
            setRecipes(loadedRecipes);
            setRecipeLines(loadedLines);
            materialsLoadedRef.current = true;
            foundationLoadedRef.current = true;
          }
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
      } finally {
        setLoadingTabs((current) => {
          const next = new Set(current);
          next.delete(tab);
          return next;
        });
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
    scheduleRunRef.current = runDueInventorySupplierDeliverySchedules(todayISO())
      .then(() => undefined)
      .catch((loadError) => {
        console.error("Could not process due supplier deliveries", loadError);
      });
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "suppliers") {
      const frame = window.requestAnimationFrame(() => {
        preloadInventoryTab("suppliers");
        setActiveTab("suppliers");
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "usage" && !loadedTabs.has(activeTab)) {
      void refresh(activeTab, false);
    }
  }, [activeTab, loadedTabs, refresh]);

  useEffect(() => {
    if (!loadedTabs.has("suppliers") || activeTab !== "suppliers" || window.location.hash !== "#reorder-overview") return;
    window.requestAnimationFrame(() => {
      document.getElementById("reorder-overview")?.scrollIntoView({ block: "start" });
    });
  }, [activeTab, loadedTabs]);

  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as InventoryTab;
    if (nextTab !== "usage") {
      preloadInventoryTab(nextTab);
      void refresh(nextTab, false);
    }
    setActiveTab(nextTab);
  }, [refresh]);

  const section = (tab: DataTab, children: React.ReactNode) => {
    if (loadingTabs.has(tab)) return <InventoryTabLoading />;
    if (tabErrors[tab]) return <InventoryTabError message={tabErrors[tab]!} onRetry={() => void refresh(tab)} />;
    if (!loadedTabs.has(tab)) return <InventoryTabLoading />;
    return children;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary/65"><Boxes className="size-4" />Inventory foundation</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Inventory foundation &amp; usage</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track opening stock, auditable movements, and calculated recipe consumption from new daily logs. Negative stock remains visible as a warning.</p>
        </div>
        <Badge variant="outline">Phase 3 · Ledger</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><FileSpreadsheet className="size-5 text-info" /><div><p className="text-xs text-muted-foreground">Source preview</p><p className="font-semibold">Rows 1–75 only</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><BookOpen className="size-5 text-success" /><div><p className="text-xs text-muted-foreground">Recipe versions</p><p className="font-semibold tabular-nums">{loadedTabs.has("recipes") || loadedTabs.has("import") ? recipes.length : "—"}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><AlertTriangle className="size-5 text-warning" /><div><p className="text-xs text-muted-foreground">Stock balance</p><p className="font-semibold">Opening stock gated</p></div></CardContent></Card>
      </div>

      <PushNotificationsSettings />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Inventory sections" className="grid w-full grid-cols-2 gap-1 p-1 group-data-horizontal/tabs:h-auto lg:inline-flex lg:w-auto lg:gap-0 lg:group-data-horizontal/tabs:h-8">
          <TabsTrigger value="stock" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Scale className="hidden size-4 shrink-0 lg:block" /><span>Stock</span></TabsTrigger>
          <TabsTrigger value="usage" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><BookOpen className="hidden size-4 shrink-0 lg:block" /><span>Usage recap</span></TabsTrigger>
          <TabsTrigger value="import" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><FileSpreadsheet className="hidden size-4 shrink-0 lg:block" /><span>Import review</span></TabsTrigger>
          <TabsTrigger value="materials" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Boxes className="hidden size-4 shrink-0 lg:block" /><span>Materials</span></TabsTrigger>
          <TabsTrigger value="recipes" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><BookOpen className="hidden size-4 shrink-0 lg:block" /><span>Recipes</span></TabsTrigger>
          <TabsTrigger value="suppliers" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Handshake className="hidden size-4 shrink-0 lg:block" /><span>Suppliers &amp; ordering</span></TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-5">
          {section("stock", <StockDashboard materials={materials} onChanged={refresh} />)}
        </TabsContent>
        <TabsContent value="usage" className="mt-5"><UsageRecap /></TabsContent>
        <TabsContent value="import" className="mt-5">
          {section("import", <ImportReview menuItems={menuItems} materials={materials} aliases={aliases} recipes={recipes} recipeLines={recipeLines} onChanged={refresh} />)}
        </TabsContent>
        <TabsContent value="materials" className="mt-5">
          {section("materials", <Materials materials={materials} onChanged={refresh} />)}
        </TabsContent>
        <TabsContent value="recipes" className="mt-5">
          {section("recipes", <Recipes menuItems={menuItems} materials={materials} recipes={recipes} recipeLines={recipeLines} onChanged={refresh} />)}
        </TabsContent>
        <TabsContent value="suppliers" className="mt-5">
          {section("suppliers", <Suppliers materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={supplierOrders} schedules={supplierSchedules} onChanged={refresh} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
