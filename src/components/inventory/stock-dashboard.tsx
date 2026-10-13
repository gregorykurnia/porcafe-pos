"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "@/lib/toast";
import { PackagePlus, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Banner } from "@/components/patterns/banner";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip, ToneShape } from "@/components/patterns/status-chip";
import { EmptyState, ErrorBanner, LoadingSkeleton } from "@/components/patterns/states";
import { FieldRow } from "@/components/fields/field-row";
import { MaterialQuantityInput } from "@/components/fields/material-quantity-input";
import { todayISO, formatDisplay } from "@/lib/dates";
import { getInventoryReorderStatus } from "@/lib/reorder-status";
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
import { countVariance, parseCountQuantity } from "@/lib/stock-count";
import type {
  InventoryMaterial,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockSetup,
  InventorySupplierOrder,
} from "@/lib/types";

/** The figures the Stock header shows. */
export type StockSummary = {
  toOrder: number;
  onOrder: number;
  negative: number;
  lastCount: string | null;
};

type StockDashboardProps = {
  materials: InventoryMaterial[];
  onChanged: () => Promise<void>;
  scheduleRefreshKey: number;
  openOrders?: InventorySupplierOrder[];
  /** Opens the order so its receipt is recorded against it, not as an unplanned delivery. */
  onReceiveAgainst?: (orderId: string) => void;
  /** Opens a new order for the material on the Suppliers tab. */
  onOrderMaterial?: (materialId: string) => void;
  /** Reports the header figures once the dashboard has loaded. */
  onSummaryChange?: (summary: StockSummary) => void;
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

function materialBalanceLabel(balance: InventoryBalance): string {
  if (balance.currentQuantity === null) return "Not initialized";
  return `${formatInventoryUsageQuantity(balance.currentQuantity)} ${balance.unit}`;
}

/** A short date for tables and figures: "Mon, 13 Oct 2026". */
function formatShortDate(dateISO: string): string {
  return format(parseISO(dateISO), "EEE, d MMM yyyy");
}

/** The audit trail date, narrower so the table fits beside the reason on tablet: "13 Oct 2026". */
function formatTableDate(dateISO: string): string {
  return format(parseISO(dateISO), "d MMM yyyy");
}

function sortMovementsByDate(movements: InventoryMovement[]): InventoryMovement[] {
  return [...movements].sort((a, b) => {
    const dateOrder = (b.occurredOn ?? "").localeCompare(a.occurredOn ?? "");
    if (dateOrder !== 0) return dateOrder;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id);
  });
}

export function StockDashboard({ materials, onChanged, scheduleRefreshKey, openOrders = [], onReceiveAgainst, onOrderMaterial, onSummaryChange }: StockDashboardProps) {
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
  // The movement and single-count forms open in sheets. Their state lives here, so a sheet keeps what was typed.
  const [movementSheetOpen, setMovementSheetOpen] = useState(false);
  const [countSheetOpen, setCountSheetOpen] = useState(false);
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
  const stockSummary = useMemo<StockSummary>(() => {
    const openOrderMaterialIds = new Set(
      openOrders
        .filter((order) => order.status === "ordered" || order.status === "partially_received")
        .flatMap((order) => order.lines.map((line) => line.materialId))
    );
    return {
      // The same reorder rule as the To order tab, so the two counts agree.
      toOrder: activeMaterials.filter((material) =>
        getInventoryReorderStatus(
          material,
          balances.find((balance) => balance.materialId === material.id)?.currentQuantity,
          Boolean(setup?.initialized),
          openOrderMaterialIds.has(material.id)
        ) === "to-order"
      ).length,
      onOrder: stockRows.filter((row) => row.hasOpenOrder).length,
      negative: stockRows.filter((row) => row.status === "negative").length,
      lastCount: movements.reduce<string | null>(
        (latest, movement) => (movement.movementType === "stock_count" && (!latest || movement.occurredOn > latest) ? movement.occurredOn : latest),
        null
      ),
    };
  }, [activeMaterials, balances, openOrders, setup, stockRows, movements]);
  useEffect(() => {
    if (loading || !onSummaryChange) return;
    onSummaryChange(stockSummary);
  }, [loading, onSummaryChange, stockSummary]);
  // The Count action in a row opens the single-material count for that row.
  function openRecordCount(materialId: string) {
    setCountMaterialId(materialId);
    setCountSheetOpen(true);
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
    void Promise.resolve().then(() => fillReceivingDefaults(selectedMovementMaterialId));
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
      // Set in the save handler after the await, never during render. The purity rule cannot see that here.
      // eslint-disable-next-line react-hooks/purity
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

  // The first problem with the movement form, in the order saveMovement checks them. Shown in the sheet's save bar.
  const movementQuantityNumber = Number(movementQuantity);
  const movementBlocker = !selectedMovementMaterial
    ? "Choose a material."
    : !Number.isFinite(movementQuantityNumber) || movementQuantityNumber <= 0
      ? "Enter a quantity greater than zero."
      : !movementReason.trim()
        ? "Add a reason for this movement."
        : "";

  // The first problem with the count form, in the order saveStockCount checks them.
  const countBlocker = !selectedCountMaterial
    ? "Choose a material."
    : selectedCounted === null
      ? "Enter a stock count of zero or greater."
      : selectedVariance?.needsReason && !countReason.trim()
        ? "This count differs from the system by more than 20 %. Add a reason."
        : "";

  function chooseMovementType(nextType: ManualMovementType) {
    setMovementType(nextType);
    if (nextType === "receiving") {
      fillReceivingDefaults(selectedMovementMaterialId);
    } else {
      if (movementQuantityAutoFilledRef.current) setMovementQuantity("");
      movementQuantityAutoFilledRef.current = false;
      if (movementReason === "Stock In") setMovementReason("");
    }
  }

  const openingColumns: Column<InventoryMaterial>[] = [
    {
      key: "material",
      label: "Material",
      cell: (material) => <span className="font-medium">{material.name}</span>,
      phone: "title",
    },
    {
      key: "unit",
      label: "Base unit",
      cell: (material) => <span className="text-ink-muted">{material.baseUnit}</span>,
      phone: "meta",
    },
    {
      key: "opening",
      label: "Opening quantity",
      align: "right",
      cell: (material) => (
        <div className="ml-auto w-32 tablet:w-44">
          <MaterialQuantityInput
            label={`Opening quantity for ${material.name}`}
            value={openingQuantities[material.id] ?? ""}
            onChange={(value) => updateOpeningQuantity(material.id, value)}
            unit={material.baseUnit}
          />
        </div>
      ),
      phone: "figure",
    },
  ];

  const auditColumns: Column<InventoryMovement>[] = [
    {
      key: "date",
      label: "Date",
      cell: (movement) => <span className="whitespace-nowrap text-ink-muted">{formatTableDate(movement.occurredOn)}</span>,
      phone: "meta",
    },
    {
      key: "material",
      label: "Material",
      cell: (movement) => <span className="font-medium">{movement.materialName}</span>,
      phone: "title",
    },
    {
      key: "type",
      label: "Type",
      cell: (movement) => <span className="text-ink-muted">{MOVEMENT_LABELS[movement.movementType]}</span>,
      phone: "meta",
    },
    {
      key: "quantity",
      label: "Quantity",
      align: "right",
      cell: (movement) => <span className="font-semibold whitespace-nowrap">{formatMovementQuantity(movement.quantity, movement.unit)}</span>,
      phone: "figure",
    },
    {
      key: "reason",
      label: "Reason / source",
      cell: (movement) => (
        <>
          <span>{movement.reason}</span>
          {movement.sourceRef && (
            <span className="block text-small text-ink-muted" title={movement.sourceRef}>
              {describeSourceRef(movement.sourceRef)?.label ?? movement.sourceRef}
            </span>
          )}
        </>
      ),
      phone: "detail",
    },
  ];

  if (loading && !hasSnapshot) {
    return (
      <Card className="gap-0 py-0 shadow-card">
        <p className="px-4 pt-4 text-small text-ink-muted tablet:px-6 tablet:pt-6">Loading stock ledger…</p>
        <LoadingSkeleton rows={4} label="Loading stock ledger…" />
      </Card>
    );
  }

  if (error && !hasSnapshot) {
    return <ErrorBanner onRetry={() => void refresh()}>Could not load stock ledger. {error}</ErrorBanner>;
  }

  return (
    <div className="space-y-5">
      {error && hasSnapshot && (
        <Banner tone="warn" action={refreshing ? undefined : { label: "Retry", onClick: () => void refresh() }}>
          <span className="font-semibold">Showing saved stock data.</span> The live refresh failed: {error}
        </Banner>
      )}
      {refreshing && <p className="text-small text-ink-muted">Updating stock from the server…</p>}

      {!setup?.initialized ? (
        <Card className="gap-0 py-0 shadow-card">
          <div className="space-y-5 p-4 tablet:p-6">
            <div>
              <h2 className="font-display text-title-2 text-ink">Opening stock required</h2>
              <p className="mt-1 text-small text-ink-muted">
                Enter the current quantity for every active material. Until this one-time setup is saved, balances stay uninitialized and low-stock alerts remain disabled.
              </p>
            </div>
            {activeMaterials.length === 0 ? (
              <EmptyState
                title="No active materials."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/setup?tab=materials">Open Materials</Link>
                  </Button>
                }
              >
                Add active materials in Setup first.
              </EmptyState>
            ) : (
              <>
                <FieldRow label="Opening date">
                  {(id) => (
                    <Input id={id} type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} className="w-full tablet:w-56" />
                  )}
                </FieldRow>
                <p className="text-small text-ink-muted" aria-live="polite">{openingEntered} of {activeMaterials.length} entered</p>
                <DataTable
                  caption="Opening stock by material"
                  columns={openingColumns}
                  rows={activeMaterials}
                  getKey={(material) => material.id}
                  density="compact"
                />
                <div>
                  <Button onClick={() => void initializeOpeningStock()} loading={saving}>
                    <Scale className="size-5" strokeWidth={1.5} aria-hidden="true" />
                    {saving ? "Initializing…" : "Initialize opening stock"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-muted">
            <StatusChip tone="ok">Initialized</StatusChip>
            <span>{setup.openingDate ? `From ${formatShortDate(setup.openingDate)}` : "Opening date not recorded"}</span>
            <span>
              <span className="font-semibold tabular-nums text-ink">{currentStockBalances.length}</span> active materials
            </span>
            <span>
              <span className="font-semibold tabular-nums text-ink">{lowStockBalances.length}</span> low or negative
              <span className="text-ink-muted"> · at or below zero; warnings only</span>
            </span>
          </div>

          {lowStockBalances.length > 0 && (
            <Banner tone="danger">
              <p className="font-semibold">Low or negative stock needs attention</p>
              <p className="mt-1 text-small">
                {lowStockBalances.map((balance) => `${balance.materialName} (${materialBalanceLabel(balance)})`).join(" · ")}. You can keep recording movements while the balance is negative.
              </p>
            </Banner>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <CountSheet materials={activeMaterials} systemTotals={balanceTotals} onSaved={() => void refresh(false)} />
            <Button onClick={() => setMovementSheetOpen(true)} disabled={activeMaterials.length === 0}>
              <PackagePlus className="size-5" strokeWidth={1.5} aria-hidden="true" />
              Record movement
            </Button>
          </div>

          <CurrentStockCard rows={stockRows} onOrder={(materialId) => onOrderMaterial?.(materialId)} onCount={openRecordCount} />

          <Card className="gap-0 py-0 shadow-card">
            <div className="space-y-4 px-4 pt-4 tablet:px-6 tablet:pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-title-2 text-ink">Movement audit trail</h2>
                  <p className="mt-1 text-small text-ink-muted">
                    Full stock history, including manual entries, recipe consumption, and automatic reversals. Showing {filteredMovements.length} of {movements.length} movements.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
                  <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} strokeWidth={1.5} aria-hidden="true" />
                  Refresh
                </Button>
              </div>
              <div className="grid gap-3 tablet:grid-cols-2 desk:grid-cols-5">
                <FieldRow label="Movement type">
                  {(id) => (
                    <Select value={auditMovementType} onValueChange={(value) => setAuditMovementType(value as "all" | InventoryMovementType)}>
                      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {Object.entries(MOVEMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="Material">
                  {(id) => (
                    <Select value={auditMaterialId} onValueChange={setAuditMaterialId}>
                      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All materials</SelectItem>
                        {auditMaterials.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="From date">
                  {(id) => <Input id={id} type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} />}
                </FieldRow>
                <FieldRow label="To date">
                  {(id) => <Input id={id} type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} />}
                </FieldRow>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full" disabled={auditMovementType === "all" && auditMaterialId === "all" && !auditFrom && !auditTo} onClick={() => {
                    setAuditMovementType("all");
                    setAuditMaterialId("all");
                    setAuditFrom("");
                    setAuditTo("");
                  }}>Clear filters</Button>
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-line">
              <DataTable
                caption="Stock movements"
                columns={auditColumns}
                rows={filteredMovements.slice(0, historyLimit)}
                getKey={(movement) => movement.id}
                density="compact"
                empty={movements.length === 0
                  ? <EmptyState title="No movements recorded yet.">Record a movement or a stock count and it appears here.</EmptyState>
                  : <EmptyState title="No movements match these filters.">Clear the filters to see every movement.</EmptyState>}
              />
            </div>
            {filteredMovements.length > historyLimit && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-small text-ink-muted tablet:px-6">
                <span>Showing {historyLimit} of {filteredMovements.length}</span>
                <Button variant="ghost" size="sm" onClick={() => setHistoryLimit((limit) => limit + 50)}>Show 50 more</Button>
              </div>
            )}
          </Card>

          <Sheet open={movementSheetOpen} onOpenChange={setMovementSheetOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Record movement</SheetTitle>
                <SheetDescription>Use signed stock changes for receipts, waste, adjustments, and corrections. Every entry needs a reason.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-small text-ink-muted">Movement type</p>
                  <SegmentedControl label="Movement type" value={movementType} options={MANUAL_MOVEMENT_TYPES} onChange={chooseMovementType} />
                </div>
                <FieldRow label="Material">
                  {(id) => (
                    <Select value={selectedMovementMaterialId} onValueChange={(value) => {
                      setMovementMaterialId(value);
                      if (movementType === "receiving") fillReceivingDefaults(value);
                    }}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger>
                      <SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FieldRow>
                {movementType === "receiving" && openReceipts.map(({ order, line, remaining }) => (
                  <div key={`${order.id}-${line.id}`} role="status" className="space-y-3 rounded-xl border border-line bg-canvas p-4">
                    <p className="text-body text-ink">
                      {order.orderReference} from {order.supplierName} has {formatInventoryUsageQuantity(remaining)} {line.unit} of {line.materialName} on the way.
                    </p>
                    {onReceiveAgainst && (
                      <Button type="button" variant="secondary" onClick={() => {
                        setMovementSheetOpen(false);
                        onReceiveAgainst(order.id);
                      }}>
                        Receive against this order
                      </Button>
                    )}
                  </div>
                ))}
                {movementType === "receiving" && openReceipts.length > 0 && (
                  <p className="text-small text-ink-muted">Different delivery? Keep recording it below.</p>
                )}
                <div className="grid gap-4 tablet:grid-cols-3">
                  <FieldRow label="Date">
                    {(id) => <Input id={id} type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />}
                  </FieldRow>
                  <FieldRow
                    label={`Quantity${selectedMovementMaterial ? ` (${selectedMovementMaterial.baseUnit})` : ""}`}
                    hint={quantityFromDefault && movementQuantity !== "" ? "Pre-filled from usual order quantity · change if different" : undefined}
                  >
                    {(id) => (
                      <MaterialQuantityInput
                        id={id}
                        label="Quantity"
                        value={movementQuantity}
                        unit={selectedMovementMaterial?.baseUnit ?? ""}
                        placeholder={movementType === "receiving" ? "Usual order quantity, if set" : "0"}
                        onChange={(next) => {
                          movementQuantityAutoFilledRef.current = false;
                          setQuantityFromDefault(false);
                          setMovementQuantity(next);
                        }}
                      />
                    )}
                  </FieldRow>
                  {movementType !== "receiving" && movementType !== "waste_spoilage" ? (
                    <FieldRow label="Direction">
                      {(id) => (
                        <Select value={movementDirection} onValueChange={(value) => setMovementDirection(value as typeof movementDirection)}>
                          <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="add">Add stock</SelectItem><SelectItem value="remove">Remove stock</SelectItem></SelectContent>
                        </Select>
                      )}
                    </FieldRow>
                  ) : (
                    <p className="pt-7 text-small text-ink-muted">{movementType === "receiving" ? "Adds stock" : "Removes stock"}</p>
                  )}
                </div>
                <FieldRow label="Reason">
                  {(id) => <Input id={id} value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="e.g. Supplier delivery #123" />}
                </FieldRow>
                <FieldRow label="Notes (optional)">
                  {(id) => <Input id={id} value={movementNotes} onChange={(event) => setMovementNotes(event.target.value)} placeholder="Additional context" />}
                </FieldRow>
              </div>
              <SheetFooter>
                <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{movementBlocker}</p>
                <Button loading={saving} disabled={saving || activeMaterials.length === 0} onClick={() => void saveMovement()}>
                  {saving ? "Saving…" : "Record movement"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet open={countSheetOpen} onOpenChange={setCountSheetOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Record stock count</SheetTitle>
                <SheetDescription>Enter the physical quantity. The ledger records the delta needed to reach that count.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <FieldRow label="Material">
                  {(id) => (
                    <Select value={selectedCountMaterialId} onValueChange={setCountMaterialId}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger>
                      <SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="Counted now">
                  {(id) => (
                    <MaterialQuantityInput
                      id={id}
                      label="Counted now"
                      value={countQuantity}
                      unit={selectedCountMaterial?.baseUnit ?? ""}
                      onChange={setCountQuantity}
                    />
                  )}
                </FieldRow>
                <div className="space-y-2 rounded-xl border border-line bg-canvas p-4">
                  <dl className="space-y-2 text-table">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-ink-muted">System</dt>
                      <dd className="tabular-nums text-ink">{formatInventoryUsageQuantity(selectedSystemQuantity)} {selectedCountMaterial?.baseUnit ?? ""}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-ink-muted">Difference</dt>
                      <dd className="tabular-nums text-ink">
                        {selectedVariance
                          ? `${selectedVariance.difference > 0 ? "+" : selectedVariance.difference < 0 ? "−" : ""}${formatInventoryUsageQuantity(Math.abs(selectedVariance.difference))} ${selectedCountMaterial?.baseUnit ?? ""}${selectedVariance.percent !== null && selectedVariance.difference !== 0 ? ` (${Math.round(Math.abs(selectedVariance.percent))} %)` : ""}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {selectedVariance?.needsReason && (
                    <p className="flex items-center gap-2 text-small font-medium text-warn">
                      <ToneShape tone="warn" className="text-warn-mark" />
                      Over 20 %: a reason is required.
                    </p>
                  )}
                </div>
                <FieldRow label={selectedVariance?.needsReason ? "Reason (required: difference over 20 %)" : "Reason (optional)"}>
                  {(id) => <Input id={id} value={countReason} onChange={(event) => setCountReason(event.target.value)} placeholder="e.g. Weekly physical count" />}
                </FieldRow>
                <p className="text-small text-ink-muted">Counting today: {formatDisplay(countDate)}.</p>
              </div>
              <SheetFooter>
                <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{countBlocker}</p>
                <Button loading={saving} disabled={saving || activeMaterials.length === 0} onClick={() => void saveStockCount()}>
                  {saving ? "Saving…" : "Record count"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
