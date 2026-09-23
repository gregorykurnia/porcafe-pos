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

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading inventory foundation…</CardContent></Card>
      ) : error ? (
        <Card className="border-danger/20 bg-danger/5"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Could not load inventory foundation</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><button type="button" onClick={() => void refresh()} className="text-sm font-medium text-primary underline underline-offset-4">Retry</button></CardContent></Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InventoryTab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="stock"><Scale className="size-4" />Stock</TabsTrigger>
            <TabsTrigger value="usage"><BookOpen className="size-4" />Usage recap</TabsTrigger>
            <TabsTrigger value="import"><FileSpreadsheet className="size-4" />Import review</TabsTrigger>
            <TabsTrigger value="materials"><Boxes className="size-4" />Materials</TabsTrigger>
            <TabsTrigger value="recipes"><BookOpen className="size-4" />Recipes</TabsTrigger>
            <TabsTrigger value="suppliers"><Handshake className="size-4" />Suppliers & ordering</TabsTrigger>
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
