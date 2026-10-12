"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getInventoryMovementTotals,
  getInventoryStockSetup,
  initializeInventoryOpeningBalances,
  listInventoryMovements,
  recordInventoryStockCount,
} from "@/lib/data";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { filterCurrentStockBalances, summarizeInventoryBalancesFromTotals, type InventoryBalance } from "@/lib/inventory-ledger";
import { getOpenReceiptsForMaterial } from "@/lib/open-receipts";
import { buildCurrentStockRows } from "@/lib/current-stock";
import { CurrentStockCard } from "@/components/inventory/current-stock-card";
import { CountSheet } from "@/components/inventory/count-sheet";
import { describeSourceRef } from "@/lib/source-ref";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "@/lib/session-draft";
import { acceptQuantityInput } from "@/lib/field-input";
import { countVariance, parseCountQuantity } from "@/lib/stock-count";
import type {
  InventoryMaterial,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockSetup,
  InventorySupplierOrder,
} from "@/lib/types";

type StockDashboardProps = {
  materials: InventoryMaterial[];
  onChanged: () => Promise<void>;
  scheduleRefreshKey: number;
  openOrders?: InventorySupplierOrder[];
  /** Opens the order so its receipt is recorded against it, not as an unplanned delivery. */
  onReceiveAgainst?: (orderId: string) => void;
  /** Opens a new order for the material on the Suppliers tab. */
  onOrderMaterial?: (materialId: string) => void;
};

type ManualMovementType = "receiving" | "waste_spoilage" | "manual_adjustment" | "correction";
const STOCK_CACHE_KEY = "porcafe.inventory.stock-ledger.v2";

type StockLedgerCache = {
  version: 2;
  setup: InventoryStockSetup | null;
  movements: InventoryMovement[];
  balanceTotals: Record<string, number>;
};

function readStockLedgerCache(): StockLedgerCache | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STOCK_CACHE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const cache = value as Partial<StockLedgerCache>;
    if (
      cache.version !== 2 ||
      !(cache.setup === null || (cache.setup && typeof cache.setup === "object")) ||
      !Array.isArray(cache.movements) ||
      !cache.balanceTotals ||
      typeof cache.balanceTotals !== "object"
    ) return null;
    return cache as StockLedgerCache;
  } catch {
    return null;
  }
}

function writeStockLedgerCache(cache: StockLedgerCache) {
  try {
    window.localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable or full; the live Firestore data still works.
  }
}

const MANUAL_MOVEMENT_TYPES: Array<{ value: ManualMovementType; label: string }> = [
  { value: "receiving", label: "Receive stock" },
  { value: "waste_spoilage", label: "Waste / spoilage" },
  // Adjustment replaces the older "Manual adjustment" and "Correction" choices. Both stored
  // types still display with their own labels in the history.
  { value: "manual_adjustment", label: "Adjustment (+/−)" },
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

function sortMovementsByDate(movements: InventoryMovement[]): InventoryMovement[] {
  return [...movements].sort((a, b) => {
    const dateOrder = (b.occurredOn ?? "").localeCompare(a.occurredOn ?? "");
    if (dateOrder !== 0) return dateOrder;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id);
  });
}

export function StockDashboard({ materials, onChanged, scheduleRefreshKey, openOrders = [], onReceiveAgainst, onOrderMaterial }: StockDashboardProps) {
  const [setup, setSetup] = useState<InventoryStockSetup | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [balanceTotals, setBalanceTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingDate, setOpeningDate] = useState(todayISO());
  const [openingQuantities, setOpeningQuantities] = useState<Record<string, string>>({});
  // Opening stock is typed over several minutes on a busy day. It is kept in this browser
  // session until it is initialized, so a reload does not lose it.
  const openingDraftKey = "porcafe.inventory.opening-draft";
  const openingDraftRestored = useRef(false);
  useEffect(() => {
    if (openingDraftRestored.current) return;
    openingDraftRestored.current = true;
    const draft = readSessionDraft<Record<string, string>>(openingDraftKey);
    if (draft) void Promise.resolve().then(() => setOpeningQuantities(draft.value));
  }, []);
  function updateOpeningQuantity(materialId: string, value: string) {
    const next = { ...openingQuantities, [materialId]: value };
    setOpeningQuantities(next);
    writeSessionDraft(openingDraftKey, next);
  }
  const [movementType, setMovementType] = useState<ManualMovementType>("receiving");
  const [movementMaterialId, setMovementMaterialId] = useState("");
  const [movementDate, setMovementDate] = useState(todayISO());
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementDirection, setMovementDirection] = useState<"add" | "remove">("add");
  const [movementReason, setMovementReason] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [countMaterialId, setCountMaterialId] = useState("");
  // Counts are recorded for today: the expected balances are current, not historical.
  const countDate = todayISO();
  const [countQuantity, setCountQuantity] = useState("");
  const [countReason, setCountReason] = useState("");
  const [auditMovementType, setAuditMovementType] = useState<"all" | InventoryMovementType>("all");
  const [auditMaterialId, setAuditMaterialId] = useState("all");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const initialReceivingPrefillRef = useRef(false);
  const movementQuantityAutoFilledRef = useRef(false);
  const [quantityFromDefault, setQuantityFromDefault] = useState(false);
  const refreshRequestRef = useRef(0);
  const scheduleRefreshKeyRef = useRef(scheduleRefreshKey);

  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeMaterialIds = useMemo(() => activeMaterials.map((material) => material.id), [activeMaterials]);
  const balances = useMemo(() => summarizeInventoryBalancesFromTotals(materials, balanceTotals, setup), [materials, balanceTotals, setup]);
  const currentStockBalances = useMemo(() => filterCurrentStockBalances(balances), [balances]);
  const stockRows = useMemo(
    () => buildCurrentStockRows({ materials, balances: currentStockBalances, openOrders }),
    [materials, currentStockBalances, openOrders]
  );
  function focusCount(materialId: string) {
    setCountMaterialId(materialId);
    document.getElementById("stock-count")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const lowStockBalances = currentStockBalances.filter((balance) => balance.currentQuantity !== null && balance.currentQuantity <= 0);
  const selectedMovementMaterialId = movementMaterialId || activeMaterials[0]?.id || "";
  const selectedMovementMaterial = activeMaterials.find((material) => material.id === selectedMovementMaterialId);
  const openingEntered = activeMaterials.filter((material) => {
    const text = openingQuantities[material.id];
    return text !== undefined && text.trim() !== "" && Number.isFinite(Number(text)) && Number(text) >= 0;
  }).length;
  const selectedCountMaterialId = countMaterialId || activeMaterials[0]?.id || "";
  const selectedCountMaterial = activeMaterials.find((material) => material.id === selectedCountMaterialId);
  const selectedSystemQuantity = balanceTotals[selectedCountMaterialId] ?? 0;
  const selectedCounted = parseCountQuantity(countQuantity);
  const selectedVariance = countQuantity.trim() === "" || selectedCounted === null
    ? null
    : countVariance(selectedSystemQuantity, selectedCounted);
  const openReceipts = useMemo(
    () => getOpenReceiptsForMaterial(openOrders, selectedMovementMaterialId),
    [openOrders, selectedMovementMaterialId]
  );
  const auditMaterials = useMemo(() => {
    const names = new Map<string, string>();
    for (const movement of movements) names.set(movement.materialId, movement.materialName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [movements]);
  // The history shows this many rows at a time, so a long audit trail stays readable on a phone.
  const [historyLimit, setHistoryLimit] = useState(50);
  const filteredMovements = useMemo(() => movements.filter((movement) => {
    if (auditMovementType !== "all" && movement.movementType !== auditMovementType) return false;
    if (auditMaterialId !== "all" && movement.materialId !== auditMaterialId) return false;
    if (auditFrom && movement.occurredOn < auditFrom) return false;
    if (auditTo && movement.occurredOn > auditTo) return false;
    return true;
  }), [auditFrom, auditMaterialId, auditMovementType, auditTo, movements]);

  const fillReceivingDefaults = useCallback((materialId: string) => {
    const material = activeMaterials.find((candidate) => candidate.id === materialId);
    const orderQuantity = material?.reorderQuantity;
    const defaultQuantity = orderQuantity !== undefined && Number.isFinite(orderQuantity) && orderQuantity > 0
      ? String(orderQuantity)
      : "";
    movementQuantityAutoFilledRef.current = Boolean(defaultQuantity);
    setQuantityFromDefault(Boolean(defaultQuantity));
    setMovementQuantity(defaultQuantity);
    setMovementReason("Stock In");
  }, [activeMaterials]);

  useEffect(() => {
    if (initialReceivingPrefillRef.current || movementType !== "receiving" || !selectedMovementMaterialId) return;
    if (!activeMaterials.some((material) => material.id === selectedMovementMaterialId)) return;
    initialReceivingPrefillRef.current = true;
    fillReceivingDefaults(selectedMovementMaterialId);
  }, [activeMaterials, fillReceivingDefaults, movementType, selectedMovementMaterialId]);

  const refresh = useCallback(async (blocking = false) => {
    const requestId = ++refreshRequestRef.current;
    if (blocking) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [nextSetup, nextMovements, nextBalanceTotals] = await Promise.all([
        getInventoryStockSetup(),
        listInventoryMovements(),
        getInventoryMovementTotals(activeMaterialIds),
      ]);
      if (requestId === refreshRequestRef.current) {
        setSetup(nextSetup);
        setMovements(nextMovements);
        setBalanceTotals(nextBalanceTotals);
        setHasSnapshot(true);
      }
    } catch (loadError) {
      console.error("Failed to load inventory stock", loadError);
      if (requestId === refreshRequestRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load stock balances.");
      }
    } finally {
      if (requestId === refreshRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeMaterialIds]);

  useEffect(() => {
    const cached = readStockLedgerCache();
    const frame = window.requestAnimationFrame(() => {
      if (cached) {
        setSetup(cached.setup);
        setMovements(cached.movements);
        setBalanceTotals(cached.balanceTotals);
        setHasSnapshot(true);
        setLoading(false);
      }
      void refresh(!cached);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  useEffect(() => {
    if (!hasSnapshot) return;
    writeStockLedgerCache({ version: 2, setup, movements, balanceTotals });
  }, [balanceTotals, hasSnapshot, movements, setup]);

  useEffect(() => {
    if (scheduleRefreshKeyRef.current === scheduleRefreshKey) return;
    scheduleRefreshKeyRef.current = scheduleRefreshKey;
    void refresh();
  }, [refresh, scheduleRefreshKey]);

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
      clearSessionDraft(openingDraftKey);
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
      const id = await createInventoryMovement({
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        quantity: signedQuantity,
        movementType,
        occurredOn: movementDate,
        reason: movementReason,
        notes: movementNotes,
      });
      const createdAt = Date.now();
      const balanceBefore = balanceTotals[material.id] ?? 0;
      const movement: InventoryMovement = {
        id,
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        quantity: signedQuantity,
        movementType,
        occurredOn: movementDate,
        reason: movementReason.trim(),
        sourceRef: `manual:${id}`,
        notes: movementNotes.trim() || undefined,
        balanceBefore,
        balanceAfter: balanceBefore + signedQuantity,
        createdAt,
      };
      setMovements((current) => sortMovementsByDate([movement, ...current.filter((item) => item.id !== id)]));
      setBalanceTotals((current) => ({ ...current, [material.id]: (current[material.id] ?? 0) + signedQuantity }));
      movementQuantityAutoFilledRef.current = false;
      setMovementQuantity("");
      setMovementReason("");
      setMovementNotes("");
      toast.success("Movement recorded");
    } catch (saveError) {
      console.error("Failed to save inventory movement", saveError);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to record movement.");
    } finally {
      setSaving(false);
    }
  }

  async function saveStockCount() {
    const material = activeMaterials.find((candidate) => candidate.id === selectedCountMaterialId);
    const observedQuantity = parseCountQuantity(countQuantity) ?? Number.NaN;
    if (!material) {
      toast.error("Choose a material.");
      return;
    }
    if (!Number.isFinite(observedQuantity) || observedQuantity < 0) {
      toast.error("Enter a stock count of zero or greater.");
      return;
    }
    if (countVariance(balanceTotals[material.id] ?? 0, observedQuantity).needsReason && !countReason.trim()) {
      toast.error("This count differs from the system by more than 20 %. Add a reason.");
      return;
    }
    setSaving(true);
    try {
      const id = await recordInventoryStockCount({
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        observedQuantity,
        occurredOn: countDate,
        reason: countReason,
      });
      const balanceBefore = balanceTotals[material.id] ?? 0;
      const quantity = observedQuantity - balanceBefore;
      const createdAt = Date.now();
      const movement: InventoryMovement = {
        id,
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        quantity,
        movementType: "stock_count",
        occurredOn: countDate,
        reason: countReason.trim(),
        sourceRef: `stock-count:${countDate}:${id}`,
        observedQuantity,
        balanceBefore,
        balanceAfter: observedQuantity,
        createdAt,
      };
      setMovements((current) => sortMovementsByDate([movement, ...current.filter((item) => item.id !== id)]));
      setBalanceTotals((current) => ({ ...current, [material.id]: observedQuantity }));
      setCountQuantity("");
      setCountReason("");
      toast.success("Stock count recorded");
    } catch (saveError) {
      console.error("Failed to save stock count", saveError);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to record stock count.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !hasSnapshot) {
    return <Card><CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading stock ledger…</CardContent></Card>;
  }

  if (error && !hasSnapshot) {
    return <Card className="border-danger/20 bg-danger/5"><CardContent className="flex items-center justify-between gap-3 p-5"><div><p className="font-medium">Could not load stock ledger</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => void refresh()}>Retry</Button></CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      {error && hasSnapshot && <Card className="border-warning/25 bg-warning/5"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">Showing saved stock data</p><p className="mt-1 text-sm text-muted-foreground">The live refresh failed: {error}</p></div><Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>Retry</Button></CardContent></Card>}
      {refreshing && <p className="text-xs text-muted-foreground">Updating stock from the server…</p>}
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
                <p className="text-sm text-muted-foreground" aria-live="polite">{openingEntered} of {activeMaterials.length} entered</p>
                <div className="overflow-hidden rounded-xl border bg-background">
                  <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Base unit</TableHead><TableHead className="w-44 text-right">Opening quantity</TableHead></TableRow></TableHeader><TableBody>{activeMaterials.map((material) => <TableRow key={material.id}><TableCell className="font-medium">{material.name}</TableCell><TableCell className="text-muted-foreground">{material.baseUnit}</TableCell><TableCell className="p-1"><Input aria-label={`Opening quantity for ${material.name}`} type="number" min="0" step="0.01" value={openingQuantities[material.id] ?? ""} onChange={(event) => updateOpeningQuantity(material.id, event.target.value)} className="h-8 text-right" /></TableCell></TableRow>)}</TableBody></Table>
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
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Active materials</p><p className="mt-1 text-xl font-semibold tabular-nums">{currentStockBalances.length}</p><p className="mt-1 text-xs text-muted-foreground">Numeric balances enabled</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Low / negative</p><p className={`mt-1 text-xl font-semibold tabular-nums ${lowStockBalances.length > 0 ? "text-danger" : "text-success"}`}>{lowStockBalances.length}</p><p className="mt-1 text-xs text-muted-foreground">At or below zero; warnings only</p></CardContent></Card>
          </div>

          {lowStockBalances.length > 0 && <Card className="border-danger/25 bg-danger/5"><CardContent className="flex gap-3 p-4"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" /><div><p className="font-medium text-danger">Low or negative stock needs attention</p><p className="mt-1 text-sm text-muted-foreground">{lowStockBalances.map((balance) => `${balance.materialName} (${materialBalanceLabel(balance)})`).join(" · ")}. You can keep recording movements while the balance is negative.</p></div></CardContent></Card>}

          <CurrentStockCard rows={stockRows} onOrder={(materialId) => onOrderMaterial?.(materialId)} onCount={focusCount} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="size-4" />Record movement</CardTitle><CardDescription>Use signed stock changes for receipts, waste, adjustments, and corrections. Every entry needs a reason.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Movement type</Label>
                    <Select value={movementType} onValueChange={(value) => {
                      const nextType = value as ManualMovementType;
                      setMovementType(nextType);
                      if (nextType === "receiving") {
                        fillReceivingDefaults(selectedMovementMaterialId);
                      } else {
                        if (movementQuantityAutoFilledRef.current) setMovementQuantity("");
                        movementQuantityAutoFilledRef.current = false;
                        if (movementReason === "Stock In") setMovementReason("");
                      }
                    }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{MANUAL_MOVEMENT_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Material</Label>
                    <Select value={selectedMovementMaterialId} onValueChange={(value) => {
                      setMovementMaterialId(value);
                      if (movementType === "receiving") fillReceivingDefaults(value);
                    }}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger>
                      <SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {movementType === "receiving" && openReceipts.map(({ order, line, remaining }) => (
                  <div key={`${order.id}-${line.id}`} role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/20 bg-info/5 p-3 text-sm">
                    <p className="min-w-0 flex-1 text-foreground">
                      {order.orderReference} from {order.supplierName} has {formatInventoryUsageQuantity(remaining)} {line.unit} of {line.materialName} on the way.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {onReceiveAgainst && (
                        <Button type="button" size="sm" onClick={() => onReceiveAgainst(order.id)}>Receive against this order</Button>
                      )}
                    </div>
                  </div>
                ))}
                {movementType === "receiving" && openReceipts.length > 0 && (
                  <p className="text-xs text-muted-foreground">Different delivery? Keep recording it below.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label htmlFor="movement-date">Date</Label><Input id="movement-date" type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} /></div>
                  <div className="space-y-1.5">
                    <Label htmlFor="movement-quantity">Quantity{selectedMovementMaterial ? ` (${selectedMovementMaterial.baseUnit})` : ""}</Label>
                    <Input
                      id="movement-quantity"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={movementQuantity}
                      onChange={(event) => {
                        const next = acceptQuantityInput(event.target.value, true);
                        if (next === null) return;
                        movementQuantityAutoFilledRef.current = false;
                        setQuantityFromDefault(false);
                        setMovementQuantity(next);
                      }}
                      placeholder={movementType === "receiving" ? "Usual order quantity, if set" : "0"}
                    />
                    {quantityFromDefault && movementQuantity !== "" && (
                      <p className="text-xs text-muted-foreground">Pre-filled from usual order quantity · change if different</p>
                    )}
                  </div>
                  {movementType !== "receiving" && movementType !== "waste_spoilage" ? (
                    <div className="space-y-1.5">
                      <Label>Direction</Label>
                      <Select value={movementDirection} onValueChange={(value) => setMovementDirection(value as typeof movementDirection)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="add">Add stock</SelectItem><SelectItem value="remove">Remove stock</SelectItem></SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex items-end text-xs text-muted-foreground">{movementType === "receiving" ? "Adds stock" : "Removes stock"}</div>
                  )}
                </div>
                <div className="space-y-1.5"><Label htmlFor="movement-reason">Reason</Label><Input id="movement-reason" value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="e.g. Supplier delivery #123" /></div>
                <div className="space-y-1.5"><Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={movementNotes} onChange={(event) => setMovementNotes(event.target.value)} placeholder="Additional context" /></div>
                <Button onClick={() => void saveMovement()} disabled={saving || activeMaterials.length === 0}><PackagePlus className="size-4" />{saving ? "Saving…" : "Record movement"}</Button>
              </CardContent>
            </Card>

            <Card id="stock-count">
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" />Record stock count</CardTitle><CardDescription>Enter the physical quantity. The ledger records the delta needed to reach that count.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Material</Label>
                  <Select value={selectedCountMaterialId} onValueChange={setCountMaterialId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger>
                    <SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-count-quantity">Counted now</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="stock-count-quantity"
                      inputMode="decimal"
                      value={countQuantity}
                      onChange={(event) => {
                        const next = acceptQuantityInput(event.target.value, true);
                        if (next !== null) setCountQuantity(next);
                      }}
                      placeholder="0"
                      className="w-36 text-right tabular-nums"
                    />
                    <span className="text-sm text-muted-foreground">{selectedCountMaterial?.baseUnit ?? ""}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">System: {formatInventoryUsageQuantity(selectedSystemQuantity)} {selectedCountMaterial?.baseUnit ?? ""}</p>
                  {selectedVariance && (
                    <p className={`text-sm tabular-nums ${selectedVariance.needsReason ? "text-warning" : "text-muted-foreground"}`}>
                      Difference {selectedVariance.difference > 0 ? "+" : selectedVariance.difference < 0 ? "−" : ""}{formatInventoryUsageQuantity(Math.abs(selectedVariance.difference))} {selectedCountMaterial?.baseUnit ?? ""}
                      {selectedVariance.percent !== null && selectedVariance.difference !== 0 ? ` (${Math.round(Math.abs(selectedVariance.percent))} %)` : ""}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock-count-reason">{selectedVariance?.needsReason ? "Reason (required: difference over 20 %)" : "Reason (optional)"}</Label>
                  <Input id="stock-count-reason" value={countReason} onChange={(event) => setCountReason(event.target.value)} placeholder="e.g. Weekly physical count" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => void saveStockCount()} disabled={saving || activeMaterials.length === 0}><ClipboardCheck className="size-4" />{saving ? "Saving…" : "Record count"}</Button>
                  <CountSheet materials={activeMaterials} systemTotals={balanceTotals} onSaved={() => void refresh(false)} />
                </div>
                <p className="text-xs text-muted-foreground">Counting today: {formatDisplay(countDate)}.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Movement audit trail</CardTitle>
                  <CardDescription>Full stock history, including manual entries, recipe consumption, and automatic reversals. Showing {filteredMovements.length} of {movements.length} movements.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label>Movement type</Label>
                  <Select value={auditMovementType} onValueChange={(value) => setAuditMovementType(value as "all" | InventoryMovementType)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {Object.entries(MOVEMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Material</Label>
                  <Select value={auditMaterialId} onValueChange={setAuditMaterialId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All materials</SelectItem>
                      {auditMaterials.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="movement-audit-from">From date</Label><Input id="movement-audit-from" type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="movement-audit-to">To date</Label><Input id="movement-audit-to" type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} /></div>
                <div className="flex items-end"><Button variant="ghost" className="w-full" disabled={auditMovementType === "all" && auditMaterialId === "all" && !auditFrom && !auditTo} onClick={() => {
                  setAuditMovementType("all");
                  setAuditMaterialId("all");
                  setAuditFrom("");
                  setAuditTo("");
                }}>Clear filters</Button></div>
              </div>
              {filteredMovements.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{movements.length === 0 ? "No movements recorded yet." : "No movements match these filters."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Material</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Reason / source</TableHead></TableRow></TableHeader>
                    <TableBody>{filteredMovements.slice(0, historyLimit).map((movement) => <TableRow key={movement.id}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDisplay(movement.occurredOn)}</TableCell><TableCell className="font-medium">{movement.materialName}</TableCell><TableCell><Badge variant={movement.movementType === "recipe_consumption" ? "secondary" : movement.movementType === "reversal" ? "outline" : "default"}>{MOVEMENT_LABELS[movement.movementType]}</Badge></TableCell><TableCell className={`whitespace-nowrap text-right font-medium tabular-nums ${movementQuantityClass(movement.quantity)}`}>{formatMovementQuantity(movement.quantity, movement.unit)}</TableCell><TableCell className="max-w-72 whitespace-normal"><span>{movement.reason}</span>{movement.sourceRef && <span className="block text-xs text-muted-foreground" title={movement.sourceRef}>{describeSourceRef(movement.sourceRef)?.label ?? movement.sourceRef}</span>}</TableCell></TableRow>)}</TableBody>
                  </Table>
                  {filteredMovements.length > historyLimit && (
                    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-muted-foreground">
                      <span>Showing {historyLimit} of {filteredMovements.length}</span>
                      <Button variant="outline" size="sm" onClick={() => setHistoryLimit((limit) => limit + 50)}>Show 50 more</Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
