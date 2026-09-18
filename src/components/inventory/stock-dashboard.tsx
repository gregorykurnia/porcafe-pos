"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ClipboardCheck,
  PackagePlus,
  RefreshCw,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayISO, formatDisplay } from "@/lib/dates";
import {
  createInventoryMovement,
  getInventoryStockSetup,
  initializeInventoryOpeningBalances,
  listInventoryMovements,
  recordInventoryStockCount,
} from "@/lib/data";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { summarizeInventoryBalances, type InventoryBalance } from "@/lib/inventory-ledger";
import type {
  InventoryMaterial,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockSetup,
} from "@/lib/types";

type StockDashboardProps = {
  materials: InventoryMaterial[];
  onChanged: () => Promise<void>;
};

type ManualMovementType = "receiving" | "waste_spoilage" | "manual_adjustment" | "correction";

const MANUAL_MOVEMENT_TYPES: Array<{ value: ManualMovementType; label: string }> = [
  { value: "receiving", label: "Receive stock" },
  { value: "waste_spoilage", label: "Waste / spoilage" },
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "correction", label: "Correction" },
];

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  opening_balance: "Opening balance",
  receiving: "Receiving",
  waste_spoilage: "Waste / spoilage",
  manual_adjustment: "Manual adjustment",
  stock_count: "Stock count",
  recipe_consumption: "Recipe consumption",
  reversal: "Reversal",
  correction: "Correction",
};

function formatMovementQuantity(quantity: number, unit: string): string {
  const prefix = quantity > 0 ? "+" : "";
  return `${prefix}${formatInventoryUsageQuantity(quantity)} ${unit}`;
}

function movementQuantityClass(quantity: number): string {
  if (quantity > 0) return "text-success";
  if (quantity < 0) return "text-danger";
  return "text-muted-foreground";
}

function materialBalanceLabel(balance: InventoryBalance): string {
  if (balance.currentQuantity === null) return "Not initialized";
  return `${formatInventoryUsageQuantity(balance.currentQuantity)} ${balance.unit}`;
}

export function StockDashboard({ materials, onChanged }: StockDashboardProps) {
  const [setup, setSetup] = useState<InventoryStockSetup | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingDate, setOpeningDate] = useState(todayISO());
  const [openingQuantities, setOpeningQuantities] = useState<Record<string, string>>({});
  const [movementType, setMovementType] = useState<ManualMovementType>("receiving");
  const [movementMaterialId, setMovementMaterialId] = useState("");
  const [movementDate, setMovementDate] = useState(todayISO());
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementDirection, setMovementDirection] = useState<"add" | "remove">("add");
  const [movementReason, setMovementReason] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [countMaterialId, setCountMaterialId] = useState("");
  const [countDate, setCountDate] = useState(todayISO());
  const [countQuantity, setCountQuantity] = useState("");
  const [countReason, setCountReason] = useState("");

  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const balances = useMemo(() => summarizeInventoryBalances(materials, movements, setup), [materials, movements, setup]);
  const lowStockBalances = balances.filter((balance) => balance.currentQuantity !== null && balance.currentQuantity <= 0);
  const selectedMovementMaterialId = movementMaterialId || activeMaterials[0]?.id || "";
  const selectedCountMaterialId = countMaterialId || activeMaterials[0]?.id || "";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSetup, nextMovements] = await Promise.all([
        getInventoryStockSetup(),
        listInventoryMovements(),
      ]);
      setSetup(nextSetup);
      setMovements(nextMovements);
    } catch (loadError) {
      console.error("Failed to load inventory stock", loadError);
      setError(loadError instanceof Error ? loadError.message : "Could not load stock balances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  async function initializeOpeningStock() {
    if (activeMaterials.length === 0) {
      toast.error("Add at least one active material before initializing stock.");
      return;
    }
    const balancesToSave = activeMaterials.map((material) => ({
      materialId: material.id,
      materialName: material.name,
      unit: material.baseUnit,
      quantity: Number(openingQuantities[material.id]),
    }));
    if (balancesToSave.some((balance) => !Number.isFinite(balance.quantity) || balance.quantity < 0)) {
      toast.error("Enter zero or more for every active material before initializing stock.");
      return;
    }
    setSaving(true);
    try {
      await initializeInventoryOpeningBalances(openingDate, balancesToSave);
      toast.success("Opening stock initialized");
      await Promise.all([refresh(), onChanged()]);
    } catch (saveError) {
      console.error("Failed to initialize opening stock", saveError);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to initialize opening stock.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMovement() {
    const material = activeMaterials.find((candidate) => candidate.id === selectedMovementMaterialId);
    const quantity = Number(movementQuantity);
    if (!material) {
      toast.error("Choose a material.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    if (!movementReason.trim()) {
      toast.error("Add a reason for this movement.");
      return;
    }
    const signedQuantity = movementType === "receiving"
      ? quantity
      : movementType === "waste_spoilage"
        ? -quantity
        : movementDirection === "add" ? quantity : -quantity;
    setSaving(true);
    try {
      await createInventoryMovement({
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        quantity: signedQuantity,
        movementType,
        occurredOn: movementDate,
        reason: movementReason,
        notes: movementNotes,
      });
      setMovementQuantity("");
      setMovementReason("");
      setMovementNotes("");
      toast.success("Movement recorded");
      await refresh();
    } catch (saveError) {
      console.error("Failed to save inventory movement", saveError);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to record movement.");
    } finally {
      setSaving(false);
    }
  }

  async function saveStockCount() {
    const material = activeMaterials.find((candidate) => candidate.id === selectedCountMaterialId);
    const quantity = Number(countQuantity);
    if (!material) {
      toast.error("Choose a material.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error("Enter a stock count of zero or greater.");
      return;
    }
    if (!countReason.trim()) {
      toast.error("Add a reason for this count.");
      return;
    }
    setSaving(true);
    try {
      await recordInventoryStockCount({
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        observedQuantity: quantity,
        occurredOn: countDate,
        reason: countReason,
      });
      setCountQuantity("");
      setCountReason("");
      toast.success("Stock count recorded");
      await refresh();
    } catch (saveError) {
      console.error("Failed to save stock count", saveError);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to record stock count.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading stock ledger…</CardContent></Card>;
  }

  if (error) {
    return <Card className="border-danger/20 bg-danger/5"><CardContent className="flex items-center justify-between gap-3 p-5"><div><p className="font-medium">Could not load stock ledger</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => void refresh()}>Retry</Button></CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      {!setup?.initialized ? (
        <Card className="border-warning/25 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-warning" />Opening stock required</CardTitle>
            <CardDescription>Enter the current quantity for every active material. Until this one-time setup is saved, balances stay uninitialized and low-stock alerts remain disabled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeMaterials.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add active materials in the Materials tab first.</p>
            ) : (
              <>
                <div className="max-w-52 space-y-1.5"><Label htmlFor="opening-stock-date">Opening date</Label><Input id="opening-stock-date" type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} /></div>
                <div className="overflow-hidden rounded-xl border bg-background">
                  <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Base unit</TableHead><TableHead className="w-44 text-right">Opening quantity</TableHead></TableRow></TableHeader><TableBody>{activeMaterials.map((material) => <TableRow key={material.id}><TableCell className="font-medium">{material.name}</TableCell><TableCell className="text-muted-foreground">{material.baseUnit}</TableCell><TableCell className="p-1"><Input aria-label={`Opening quantity for ${material.name}`} type="number" min="0" step="0.01" value={openingQuantities[material.id] ?? ""} onChange={(event) => setOpeningQuantities((current) => ({ ...current, [material.id]: event.target.value }))} className="h-8 text-right" /></TableCell></TableRow>)}</TableBody></Table>
                </div>
                <Button onClick={() => void initializeOpeningStock()} disabled={saving}><Scale className="size-4" />{saving ? "Initializing…" : "Initialize opening stock"}</Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Stock status</p><p className="mt-1 font-semibold text-success">Initialized</p><p className="mt-1 text-xs text-muted-foreground">{setup.openingDate ? `From ${formatDisplay(setup.openingDate)}` : "Opening date not recorded"}</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Active materials</p><p className="mt-1 text-xl font-semibold tabular-nums">{balances.length}</p><p className="mt-1 text-xs text-muted-foreground">Numeric balances enabled</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Low / negative</p><p className={`mt-1 text-xl font-semibold tabular-nums ${lowStockBalances.length > 0 ? "text-danger" : "text-success"}`}>{lowStockBalances.length}</p><p className="mt-1 text-xs text-muted-foreground">At or below zero; warnings only</p></CardContent></Card>
          </div>

          {lowStockBalances.length > 0 && <Card className="border-danger/25 bg-danger/5"><CardContent className="flex gap-3 p-4"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" /><div><p className="font-medium text-danger">Low or negative stock needs attention</p><p className="mt-1 text-sm text-muted-foreground">{lowStockBalances.map((balance) => `${balance.materialName} (${materialBalanceLabel(balance)})`).join(" · ")}. You can keep recording movements while the balance is negative.</p></div></CardContent></Card>}

          <Card>
            <CardHeader><CardTitle>Current stock</CardTitle><CardDescription>Balances are the sum of opening stock, manual movements, stock-count corrections, recipe consumption, and reversals.</CardDescription></CardHeader>
            <CardContent>{balances.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No active materials.</p> : <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Current balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{balances.map((balance) => <TableRow key={balance.materialId}><TableCell className="font-medium">{balance.materialName}</TableCell><TableCell className="text-muted-foreground">{balance.unit}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${balance.isNegative ? "text-danger" : ""}`}>{materialBalanceLabel(balance)}</TableCell><TableCell>{balance.isNegative ? <Badge variant="destructive">Negative</Badge> : balance.currentQuantity === 0 ? <Badge variant="destructive">Low stock</Badge> : <Badge variant="secondary">Available</Badge>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="size-4" />Record movement</CardTitle><CardDescription>Use signed stock changes for receipts, waste, adjustments, and corrections. Every entry needs a reason.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Movement type</Label><Select value={movementType} onValueChange={(value) => setMovementType(value as typeof movementType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MANUAL_MOVEMENT_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Material</Label><Select value={selectedMovementMaterialId} onValueChange={setMovementMaterialId}><SelectTrigger className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger><SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label>Date</Label><Input type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} /></div><div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min="0" step="0.01" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} placeholder="0" /></div>{movementType !== "receiving" && movementType !== "waste_spoilage" ? <div className="space-y-1.5"><Label>Direction</Label><Select value={movementDirection} onValueChange={(value) => setMovementDirection(value as typeof movementDirection)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">Add stock</SelectItem><SelectItem value="remove">Remove stock</SelectItem></SelectContent></Select></div> : <div className="flex items-end text-xs text-muted-foreground">{movementType === "receiving" ? "Adds stock" : "Removes stock"}</div>}</div>
                <div className="space-y-1.5"><Label>Reason</Label><Input value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="e.g. Supplier delivery #123" /></div>
                <div className="space-y-1.5"><Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={movementNotes} onChange={(event) => setMovementNotes(event.target.value)} placeholder="Additional context" /></div>
                <Button onClick={() => void saveMovement()} disabled={saving || activeMaterials.length === 0}><PackagePlus className="size-4" />{saving ? "Saving…" : "Record movement"}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" />Record stock count</CardTitle><CardDescription>Enter the physical quantity. The ledger records the delta needed to reach that count.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Material</Label><Select value={selectedCountMaterialId} onValueChange={setCountMaterialId}><SelectTrigger className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger><SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Count date</Label><Input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} /></div></div>
                <div className="space-y-1.5"><Label>Observed quantity</Label><Input type="number" min="0" step="0.01" value={countQuantity} onChange={(event) => setCountQuantity(event.target.value)} placeholder="0" /></div>
                <div className="space-y-1.5"><Label>Reason</Label><Input value={countReason} onChange={(event) => setCountReason(event.target.value)} placeholder="e.g. Weekly physical count" /></div>
                <Button variant="outline" onClick={() => void saveStockCount()} disabled={saving || activeMaterials.length === 0}><ClipboardCheck className="size-4" />{saving ? "Saving…" : "Record count"}</Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Movement audit trail</CardTitle><CardDescription>Append-only stock history, including recipe consumption and automatic reversals when a daily log changes.</CardDescription></div><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />Refresh</Button></div></CardHeader>
            <CardContent>{movements.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No movements recorded yet.</p> : <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Material</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Reason / source</TableHead></TableRow></TableHeader><TableBody>{movements.slice(0, 30).map((movement) => <TableRow key={movement.id}><TableCell className="text-muted-foreground">{formatDisplay(movement.occurredOn)}</TableCell><TableCell className="font-medium">{movement.materialName}</TableCell><TableCell><Badge variant={movement.movementType === "recipe_consumption" ? "secondary" : movement.movementType === "reversal" ? "outline" : "default"}>{MOVEMENT_LABELS[movement.movementType]}</Badge></TableCell><TableCell className={`text-right font-medium tabular-nums ${movementQuantityClass(movement.quantity)}`}>{formatMovementQuantity(movement.quantity, movement.unit)}</TableCell><TableCell className="max-w-72 whitespace-normal"><span>{movement.reason}</span><span className="block font-mono text-[11px] text-muted-foreground">{movement.sourceRef}</span></TableCell></TableRow>)}</TableBody></Table>}</CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
