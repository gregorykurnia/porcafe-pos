"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Boxes, FileSpreadsheet, Handshake, Loader2, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportReview } from "@/components/inventory/import-review";
import { Materials } from "@/components/inventory/materials";
import { Recipes } from "@/components/inventory/recipes";
import { UsageRecap } from "@/components/inventory/usage-recap";
import { StockDashboard } from "@/components/inventory/stock-dashboard";
import { Suppliers } from "@/components/inventory/suppliers";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await runDueInventorySupplierDeliverySchedules(todayISO());
      const [items, loadedMaterials, loadedAliases, loadedRecipes, loadedLines, loadedSuppliers, loadedSupplierItems, loadedSupplierOrders, loadedSupplierSchedules] = await Promise.all([
        listMenuItems(),
        listInventoryMaterials(),
        listInventoryAliasMappings(),
        listInventoryRecipeVersions(),
        listInventoryRecipeLines(),
        listInventorySuppliers(),
        listInventorySupplierItems(),
        listInventorySupplierOrders(),
        listInventorySupplierDeliverySchedules(),
      ]);
      setMenuItems(items);
      setMaterials(loadedMaterials);
      setAliases(loadedAliases);
      setRecipes(loadedRecipes);
      setRecipeLines(loadedLines);
      setSuppliers(loadedSuppliers);
      setSupplierItems(loadedSupplierItems);
      setSupplierOrders(loadedSupplierOrders);
      setSupplierSchedules(loadedSupplierSchedules);
    } catch (loadError) {
      console.error("Failed to load inventory foundation", loadError);
      setError(loadError instanceof Error ? loadError.message : "Could not load inventory foundation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "suppliers") {
      const frame = window.requestAnimationFrame(() => setActiveTab("suppliers"));
      return () => window.cancelAnimationFrame(frame);
    }
    return;
  }, []);

  useEffect(() => {
    if (loading || activeTab !== "suppliers" || window.location.hash !== "#reorder-overview") return;
    window.requestAnimationFrame(() => {
      document.getElementById("reorder-overview")?.scrollIntoView({ block: "start" });
    });
  }, [activeTab, loading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary/65"><Boxes className="size-4" />Inventory foundation</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Inventory foundation & usage</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Track opening stock, auditable movements, and calculated recipe consumption from new daily logs. Negative stock remains visible as a warning.</p>
        </div>
        <Badge variant="outline">Phase 3 · Ledger</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><FileSpreadsheet className="size-5 text-info" /><div><p className="text-xs text-muted-foreground">Source preview</p><p className="font-semibold">Rows 1–75 only</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><BookOpen className="size-5 text-success" /><div><p className="text-xs text-muted-foreground">Recipe versions</p><p className="font-semibold tabular-nums">{recipes.length}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><AlertTriangle className="size-5 text-warning" /><div><p className="text-xs text-muted-foreground">Stock balance</p><p className="font-semibold">Opening stock gated</p></div></CardContent></Card>
      </div>

      <PushNotificationsSettings />

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading inventory foundation…</CardContent></Card>
      ) : error ? (
        <Card className="border-danger/20 bg-danger/5"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Could not load inventory foundation</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><button type="button" onClick={() => void refresh()} className="text-sm font-medium text-primary underline underline-offset-4">Retry</button></CardContent></Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InventoryTab)}>
          <TabsList aria-label="Inventory sections" className="grid w-full grid-cols-2 gap-1 p-1 group-data-horizontal/tabs:h-auto lg:inline-flex lg:w-auto lg:gap-0 lg:group-data-horizontal/tabs:h-8">
            <TabsTrigger value="stock" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Scale className="hidden size-4 shrink-0 lg:block" /><span>Stock</span></TabsTrigger>
            <TabsTrigger value="usage" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><BookOpen className="hidden size-4 shrink-0 lg:block" /><span>Usage recap</span></TabsTrigger>
            <TabsTrigger value="import" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><FileSpreadsheet className="hidden size-4 shrink-0 lg:block" /><span>Import review</span></TabsTrigger>
            <TabsTrigger value="materials" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Boxes className="hidden size-4 shrink-0 lg:block" /><span>Materials</span></TabsTrigger>
            <TabsTrigger value="recipes" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><BookOpen className="hidden size-4 shrink-0 lg:block" /><span>Recipes</span></TabsTrigger>
            <TabsTrigger value="suppliers" className="min-h-11 min-w-0 w-full whitespace-normal px-1.5 py-2 text-xs leading-tight lg:min-h-0 lg:w-auto lg:whitespace-nowrap lg:px-3.5 lg:py-1.5 lg:text-sm"><Handshake className="hidden size-4 shrink-0 lg:block" /><span>Suppliers &amp; ordering</span></TabsTrigger>
          </TabsList>
          <TabsContent value="stock" className="mt-5"><StockDashboard materials={materials} onChanged={refresh} /></TabsContent>
          <TabsContent value="usage" className="mt-5"><UsageRecap /></TabsContent>
          <TabsContent value="import" className="mt-5"><ImportReview menuItems={menuItems} materials={materials} aliases={aliases} recipes={recipes} recipeLines={recipeLines} onChanged={refresh} /></TabsContent>
          <TabsContent value="materials" className="mt-5"><Materials materials={materials} onChanged={refresh} /></TabsContent>
          <TabsContent value="recipes" className="mt-5"><Recipes menuItems={menuItems} materials={materials} recipes={recipes} recipeLines={recipeLines} onChanged={refresh} /></TabsContent>
          <TabsContent value="suppliers" className="mt-5"><Suppliers materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={supplierOrders} schedules={supplierSchedules} onChanged={refresh} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
