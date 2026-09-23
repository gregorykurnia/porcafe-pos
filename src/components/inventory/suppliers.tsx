"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  CalendarClock,
  CircleAlert,
  ClipboardList,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDisplay, todayISO } from "@/lib/dates";
import {
  deleteInventorySupplierItem,
  getInventoryStockSetup,
  listInventoryMovements,
  upsertInventoryMaterial,
  upsertInventorySupplier,
  upsertInventorySupplierItem,
} from "@/lib/data";
import { normalizeInventoryName } from "@/lib/inventory";
import { summarizeInventoryBalances, type InventoryBalance } from "@/lib/inventory-ledger";
import { SupplierOrders } from "@/components/inventory/supplier-orders";
import { SupplierSchedules } from "@/components/inventory/supplier-schedules";
import type { InventoryMaterial, InventoryMovement, InventoryStockSetup, InventorySupplier, InventorySupplierDeliverySchedule, InventorySupplierItem, InventorySupplierOrder } from "@/lib/types";

type SuppliersProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  orders: InventorySupplierOrder[];
  schedules: InventorySupplierDeliverySchedule[];
  onChanged: () => Promise<void>;
};

type SupplierForm = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const EMPTY_SUPPLIER_FORM: SupplierForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

type ReorderStatus = "stock-high" | "to-order" | "on-way" | "not-configured" | "alerts-off" | "not-initialized";
type ReorderOverviewFilter = "all" | ReorderStatus;
type ReorderSortKey = "material" | "stock" | "threshold" | "gap" | "quantity" | "supplier" | "status";
type ReorderSort = { key: ReorderSortKey; direction: "asc" | "desc" };
type SupplierPricingSortKey = "material" | "supplier" | "cost" | "buyingDetails" | "status";
type SupplierPricingSort = { key: SupplierPricingSortKey; direction: "asc" | "desc" } | null;

function SupplierPricingHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SupplierPricingSortKey;
  sort: SupplierPricingSort;
  onSort: (key: SupplierPricingSortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const direction = active ? sort?.direction : undefined;
  const Icon = direction ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className} aria-sort={direction ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}, ${direction ? (direction === "asc" ? "ascending" : "descending") : "not sorted"}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  );
}

function getReorderStatus(
  material: InventoryMaterial,
  balance: InventoryBalance | undefined,
  stockInitialized: boolean,
  hasOpenOrder: boolean,
): ReorderStatus {
  if (!stockInitialized || balance?.currentQuantity === null || balance === undefined) return "not-initialized";
  if (hasOpenOrder) return "on-way";
  if (material.reorderThreshold === undefined) return "not-configured";
  if (!material.lowStockAlertEnabled) return "alerts-off";
  return balance.currentQuantity <= material.reorderThreshold ? "to-order" : "stock-high";
}

function reorderStatusLabel(status: ReorderStatus): string {
  if (status === "to-order") return "To Order";
  if (status === "on-way") return "Ordered / On the Way";
  if (status === "stock-high") return "Stock Still High";
  if (status === "not-configured") return "Needs setup";
  if (status === "alerts-off") return "Alerts off";
  return "Stock not initialized";
}

function reorderStatusVariant(status: ReorderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "to-order") return "destructive";
  if (status === "stock-high") return "secondary";
  return "outline";
}

function ReorderGap({ gap, thresholdConfigured, unit, status }: { gap?: number; thresholdConfigured: boolean; unit: string; status: ReorderStatus }) {
  if (!thresholdConfigured) return <span className="text-muted-foreground">No alert level</span>;
  if (gap === undefined) return <>—</>;

  const color = gap > 0 ? "text-success" : status === "on-way" ? "text-warning" : "text-danger";
  if (gap === 0) return <span className={`font-medium ${color}`}>At alert level</span>;

  return <span className={`font-medium ${color}`}>{Math.abs(gap).toLocaleString("id-ID", { maximumFractionDigits: 2 })} {unit} {gap < 0 ? "below" : "above"}</span>;
}

const reorderStatusOrder: ReorderStatus[] = ["to-order", "on-way", "stock-high", "not-configured", "alerts-off", "not-initialized"];

const reorderStatusFilters: ReorderStatus[] = ["to-order", "on-way", "stock-high", "not-configured", "alerts-off", "not-initialized"];

type ReorderOverviewProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  balances: InventoryBalance[];
  stockInitialized: boolean;
  stockLoading: boolean;
  openOrderMaterialIds: Set<string>;
};

function ReorderOverviewHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: ReorderSortKey;
  sort: ReorderSort;
  onSort: (key: ReorderSortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const direction = active ? sort.direction : undefined;
  const Icon = direction ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className} aria-sort={direction ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}, ${direction ? (direction === "asc" ? "ascending" : "descending") : "not sorted"}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  );
}

function ReorderOverview({ materials, suppliers, balances, stockInitialized, stockLoading, openOrderMaterialIds }: ReorderOverviewProps) {
  const [statusFilter, setStatusFilter] = useState<ReorderOverviewFilter>("all");
  const [sort, setSort] = useState<ReorderSort>({ key: "status", direction: "asc" });
  const balanceByMaterialId = useMemo(() => new Map(balances.map((balance) => [balance.materialId, balance])), [balances]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const rows = useMemo(() => materials.map((material) => {
    const balance = balanceByMaterialId.get(material.id);
    const currentQuantity = balance?.currentQuantity;
    return {
      material,
      balance,
      gapToAlert: material.reorderThreshold !== undefined && currentQuantity !== null && currentQuantity !== undefined
        ? currentQuantity - material.reorderThreshold
        : undefined,
      status: getReorderStatus(material, balance, stockInitialized, openOrderMaterialIds.has(material.id)),
      supplierName: material.preferredSupplierId ? supplierById.get(material.preferredSupplierId)?.name ?? "Archived supplier" : "No preferred supplier",
    };
  }), [balanceByMaterialId, materials, openOrderMaterialIds, stockInitialized, supplierById]);
  const counts = useMemo(() => {
    const nextCounts = new Map<ReorderOverviewFilter, number>([["all", rows.length]]);
    for (const status of reorderStatusFilters) nextCounts.set(status, rows.filter((row) => row.status === status).length);
    return nextCounts;
  }, [rows]);
  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) => statusFilter === "all" || row.status === statusFilter);
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sort.key === "material") {
        comparison = a.material.name.localeCompare(b.material.name, "id", { sensitivity: "base" });
      } else if (sort.key === "supplier") {
        comparison = a.supplierName.localeCompare(b.supplierName, "id", { sensitivity: "base" });
      } else if (sort.key === "status") {
        comparison = reorderStatusOrder.indexOf(a.status) - reorderStatusOrder.indexOf(b.status);
      } else {
        const left = sort.key === "stock" ? a.balance?.currentQuantity : sort.key === "threshold" ? a.material.reorderThreshold : sort.key === "quantity" ? a.material.reorderQuantity : a.gapToAlert;
        const right = sort.key === "stock" ? b.balance?.currentQuantity : sort.key === "threshold" ? b.material.reorderThreshold : sort.key === "quantity" ? b.material.reorderQuantity : b.gapToAlert;
        if (left === null || left === undefined) return right === null || right === undefined ? a.material.name.localeCompare(b.material.name, "id", { sensitivity: "base" }) : 1;
        if (right === null || right === undefined) return -1;
        comparison = left - right;
      }
      return comparison === 0 ? a.material.name.localeCompare(b.material.name, "id", { sensitivity: "base" }) : comparison * sign;
    });
  }, [rows, sort, statusFilter]);

  function toggleSort(key: ReorderSortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reorder overview</CardTitle>
        <CardDescription>Filter materials by stock status, then sort the list to see what needs attention.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stockLoading ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Loading current stock and reorder statuses…</p> : materials.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No active materials yet.</p> : <>
          <div className="flex flex-wrap gap-2" aria-label="Filter reorder materials by status">
            <Button type="button" size="sm" variant={statusFilter === "all" ? "default" : "outline"} aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All <span className="ml-1 tabular-nums opacity-75">{counts.get("all") ?? 0}</span></Button>
            {reorderStatusFilters.map((status) => <Button key={status} type="button" size="sm" variant={statusFilter === status ? "default" : "outline"} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>{reorderStatusLabel(status)} <span className="ml-1 tabular-nums opacity-75">{counts.get(status) ?? 0}</span></Button>)}
          </div>
          {filteredRows.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No materials match this status.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <ReorderOverviewHead label="Material" sortKey="material" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Current stock" sortKey="stock" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Alert at" sortKey="threshold" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Gap to alert" sortKey="gap" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Order quantity" sortKey="quantity" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Preferred supplier" sortKey="supplier" sort={sort} onSort={toggleSort} />
            <ReorderOverviewHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
            <TableHead className="text-right">Action</TableHead>
          </TableRow></TableHeader><TableBody>{filteredRows.map(({ material, balance, gapToAlert, status, supplierName }) => <TableRow key={material.id}>
            <TableCell><span className="font-medium">{material.name}</span><span className="block text-xs text-muted-foreground">{material.baseUnit}</span></TableCell>
            <TableCell className="tabular-nums">{balance?.currentQuantity === null || balance?.currentQuantity === undefined ? "—" : balance.currentQuantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
            <TableCell className="tabular-nums">{material.reorderThreshold === undefined ? "—" : material.reorderThreshold.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
            <TableCell><ReorderGap gap={gapToAlert} thresholdConfigured={material.reorderThreshold !== undefined} unit={material.baseUnit} status={status} /></TableCell>
            <TableCell className="tabular-nums">{material.reorderQuantity === undefined ? "—" : material.reorderQuantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
            <TableCell>{supplierName}</TableCell>
            <TableCell><Badge variant={reorderStatusVariant(status)}>{reorderStatusLabel(status)}</Badge></TableCell>
            <TableCell className="text-right">{status === "to-order" ? <Button asChild size="sm" variant="outline"><a href="#create-supplier-order" aria-label={`Create supplier order for ${material.name}`}><Plus />Create order</a></Button> : "—"}</TableCell>
          </TableRow>)}</TableBody></Table></div>}
        </>}
      </CardContent>
    </Card>
  );
}

type ReorderSettingsProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  balances: InventoryBalance[];
  onChanged: () => Promise<void>;
};

type ReorderSettingRowProps = {
  material: InventoryMaterial;
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  balance?: InventoryBalance;
  onChanged: () => Promise<void>;
};

function ReorderSettingRow({
  material,
  suppliers,
  supplierItems,
  balance,
  onChanged,
}: ReorderSettingRowProps) {
  const [threshold, setThreshold] = useState(material.reorderThreshold === undefined ? "" : String(material.reorderThreshold));
  const [quantity, setQuantity] = useState(material.reorderQuantity === undefined ? "" : String(material.reorderQuantity));
  const [preferredSupplierId, setPreferredSupplierId] = useState(material.preferredSupplierId ?? "");
  const [alertEnabled, setAlertEnabled] = useState(material.lowStockAlertEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const linkedSuppliers = useMemo(() => supplierItems
    .filter((item) => item.materialId === material.id)
    .map((item) => supplierById.get(item.supplierId))
    .filter((supplier): supplier is InventorySupplier => Boolean(supplier)), [material.id, supplierById, supplierItems]);
  async function save() {
    const nextThreshold = threshold.trim() ? Number(threshold) : undefined;
    const nextQuantity = quantity.trim() ? Number(quantity) : undefined;
    if (nextThreshold !== undefined && (!Number.isFinite(nextThreshold) || nextThreshold < 0)) {
      toast.error("Reorder threshold must be zero or greater.");
      return;
    }
    if (nextQuantity !== undefined && (!Number.isFinite(nextQuantity) || nextQuantity <= 0)) {
      toast.error("Suggested reorder quantity must be greater than zero.");
      return;
    }
    if (alertEnabled && nextThreshold === undefined) {
      toast.error("Set a reorder threshold before enabling the alert.");
      return;
    }

    setSaving(true);
    try {
      await upsertInventoryMaterial({
        ...material,
        id: material.id,
        createdAt: material.createdAt,
        reorderThreshold: nextThreshold,
        reorderQuantity: nextQuantity,
        preferredSupplierId: preferredSupplierId || undefined,
        lowStockAlertEnabled: alertEnabled,
      });
      toast.success("Reorder settings saved");
      await onChanged();
    } catch (error) {
      console.error("Failed to save reorder settings", error);
      toast.error(error instanceof Error ? error.message : "Failed to save reorder settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell><span className="font-medium">{material.name}</span><span className="block text-xs text-muted-foreground">{material.baseUnit}</span></TableCell>
      <TableCell className="tabular-nums">{balance?.currentQuantity === null || balance?.currentQuantity === undefined ? "—" : balance.currentQuantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
      <TableCell className="min-w-28"><Input aria-label={`Reorder threshold for ${material.name}`} type="number" min="0" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="—" /></TableCell>
      <TableCell className="min-w-28"><Input aria-label={`Reorder quantity for ${material.name}`} type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="—" /></TableCell>
      <TableCell className="min-w-44"><Select value={preferredSupplierId || "none"} onValueChange={(value) => setPreferredSupplierId(value === "none" ? "" : value)}><SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent><SelectItem value="none">No preferred supplier</SelectItem>{linkedSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></TableCell>
      <TableCell><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alertEnabled} onChange={(event) => setAlertEnabled(event.target.checked)} className="size-4 accent-primary" /><span className="sr-only">Enable low-stock alert for {material.name}</span><Bell className="size-4 text-muted-foreground" /></label></TableCell>
      <TableCell className="text-right"><Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></TableCell>
    </TableRow>
  );
}

function ReorderSettings({ materials, suppliers, supplierItems, balances, onChanged }: ReorderSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reorder settings</CardTitle>
        <CardDescription>Configure alert thresholds, suggested quantities, and preferred suppliers for each material.</CardDescription>
      </CardHeader>
      <CardContent>
        {materials.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No active materials yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Current stock</TableHead><TableHead>Alert at</TableHead><TableHead>Order quantity</TableHead><TableHead>Preferred supplier</TableHead><TableHead>Alert</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{materials.map((material) => <ReorderSettingRow key={`${material.id}-${material.updatedAt}`} material={material} suppliers={suppliers} supplierItems={supplierItems} balance={balances.find((candidate) => candidate.materialId === material.id)} onChanged={onChanged} />)}</TableBody></Table></div>}
      </CardContent>
    </Card>
  );
}

export function Suppliers({ materials, suppliers, supplierItems, orders, schedules, onChanged }: SuppliersProps) {
  const supplierFormRef = useRef<HTMLDivElement>(null);
  const supplierItemFormRef = useRef<HTMLDivElement>(null);
  const [today] = useState(() => todayISO());
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(EMPTY_SUPPLIER_FORM);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierUpdatingId, setSupplierUpdatingId] = useState<string | null>(null);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [costEffectiveFrom, setCostEffectiveFrom] = useState(todayISO());
  const [currency, setCurrency] = useState("IDR");
  const [supplierSku, setSupplierSku] = useState("");
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [preferred, setPreferred] = useState(false);
  const [supplierItemNotes, setSupplierItemNotes] = useState("");
  const [editingSupplierItemId, setEditingSupplierItemId] = useState<string | null>(null);
  const [supplierItemSaving, setSupplierItemSaving] = useState(false);
  const [supplierPricingSort, setSupplierPricingSort] = useState<SupplierPricingSort>(null);
  const [stockSetup, setStockSetup] = useState<InventoryStockSetup | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [auditMaterialId, setAuditMaterialId] = useState("all");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");

  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const selectedMaterial = activeMaterials.find((material) => material.id === selectedMaterialId);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const sortedSupplierItems = useMemo(() => {
    if (!supplierPricingSort) return supplierItems;

    const { key, direction } = supplierPricingSort;
    const sign = direction === "asc" ? 1 : -1;
    return [...supplierItems].sort((a, b) => {
      let comparison = 0;
      if (key === "material") {
        comparison = (materialById.get(a.materialId)?.name ?? a.materialName).localeCompare(
          materialById.get(b.materialId)?.name ?? b.materialName,
          "id",
          { sensitivity: "base" },
        );
      } else if (key === "supplier") {
        comparison = (supplierById.get(a.supplierId)?.name ?? "Archived supplier").localeCompare(
          supplierById.get(b.supplierId)?.name ?? "Archived supplier",
          "id",
          { sensitivity: "base" },
        );
      } else if (key === "cost") {
        comparison = a.costPerUnit - b.costPerUnit || a.currency.localeCompare(b.currency);
      } else if (key === "buyingDetails") {
        comparison = (a.minimumOrderQuantity ?? Number.POSITIVE_INFINITY) - (b.minimumOrderQuantity ?? Number.POSITIVE_INFINITY)
          || (a.leadTimeDays ?? Number.POSITIVE_INFINITY) - (b.leadTimeDays ?? Number.POSITIVE_INFINITY);
      } else {
        comparison = Number(a.preferred) - Number(b.preferred);
      }
      return comparison * sign;
    });
  }, [materialById, supplierById, supplierItems, supplierPricingSort]);
  const balances = useMemo(() => summarizeInventoryBalances(materials, movements, stockSetup), [materials, movements, stockSetup]);
  const openOrderMaterialIds = useMemo(() => new Set(orders.filter((order) => order.status === "ordered" || order.status === "partially_received").flatMap((order) => order.lines.map((line) => line.materialId))), [orders]);
  const toOrderCount = useMemo(() => activeMaterials.filter((material) => getReorderStatus(material, balances.find((balance) => balance.materialId === material.id), Boolean(stockSetup?.initialized), openOrderMaterialIds.has(material.id)) === "to-order").length, [activeMaterials, balances, openOrderMaterialIds, stockSetup]);
  const activeOrderCount = orders.filter((order) => order.status === "ordered" || order.status === "partially_received").length;
  const activeScheduleCount = schedules.filter((schedule) => schedule.active).length;
  const recentOrderCutoff = format(addDays(parseISO(today), -6), "yyyy-MM-dd");
  const recentOrderCount = orders.filter((order) => order.orderedOn >= recentOrderCutoff && order.orderedOn <= today).length;
  const supplierMovements = useMemo(() => movements.filter((movement) => movement.sourceRef.startsWith("supplier-order:") || movement.sourceRef.startsWith("supplier-delivery-schedule:")), [movements]);
  const auditMaterialOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const movement of supplierMovements) names.set(movement.materialId, movement.materialName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [supplierMovements]);
  const filteredSupplierMovements = useMemo(() => supplierMovements.filter((movement) => {
    if (auditMaterialId !== "all" && movement.materialId !== auditMaterialId) return false;
    if (auditFrom && movement.occurredOn < auditFrom) return false;
    if (auditTo && movement.occurredOn > auditTo) return false;
    return true;
  }), [auditFrom, auditMaterialId, auditTo, supplierMovements]);

  const refreshStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const [nextSetup, nextMovements] = await Promise.all([getInventoryStockSetup(), listInventoryMovements()]);
      setStockSetup(nextSetup);
      setMovements(nextMovements);
    } catch (error) {
      console.error("Failed to load reorder stock", error);
      toast.error(error instanceof Error ? error.message : "Could not load current stock for reorder settings");
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshStock());
  }, [refreshStock]);

  function updateSupplierForm(field: keyof SupplierForm, value: string) {
    setSupplierForm((current) => ({ ...current, [field]: value }));
  }

  function startEditingSupplier(supplier: InventorySupplier) {
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    supplierFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetSupplierForm() {
    setEditingSupplierId(null);
    setSupplierForm(EMPTY_SUPPLIER_FORM);
  }

  async function saveSupplier() {
    const name = supplierForm.name.trim();
    const normalizedName = normalizeInventoryName(name);
    if (!name) {
      toast.error("Enter a supplier name first.");
      return;
    }
    if (suppliers.some((supplier) => supplier.normalizedName === normalizedName && supplier.id !== editingSupplierId)) {
      toast.error("A supplier with that name already exists.");
      return;
    }

    setSupplierSaving(true);
    try {
      const existing = editingSupplierId ? suppliers.find((supplier) => supplier.id === editingSupplierId) : undefined;
      await upsertInventorySupplier({
        id: editingSupplierId ?? undefined,
        name,
        normalizedName,
        contactPerson: supplierForm.contactPerson.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
        email: supplierForm.email.trim() || undefined,
        address: supplierForm.address.trim() || undefined,
        notes: supplierForm.notes.trim() || undefined,
        active: existing?.active ?? true,
        createdAt: existing?.createdAt,
      });
      toast.success(editingSupplierId ? "Supplier updated" : "Supplier added");
      resetSupplierForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to save supplier", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier");
    } finally {
      setSupplierSaving(false);
    }
  }

  async function toggleSupplier(supplier: InventorySupplier) {
    setSupplierUpdatingId(supplier.id);
    try {
      await upsertInventorySupplier({
        ...supplier,
        id: supplier.id,
        createdAt: supplier.createdAt,
        active: !supplier.active,
      });
      toast.success(supplier.active ? "Supplier archived" : "Supplier restored");
      await onChanged();
    } catch (error) {
      console.error("Failed to update supplier status", error);
      toast.error(error instanceof Error ? error.message : "Failed to update supplier status");
    } finally {
      setSupplierUpdatingId(null);
    }
  }

  function resetSupplierItemForm() {
    setSelectedSupplierId("");
    setSelectedMaterialId("");
    setCostPerUnit("");
    setCostEffectiveFrom(todayISO());
    setCurrency("IDR");
    setSupplierSku("");
    setMinimumOrderQuantity("");
    setLeadTimeDays("");
    setPreferred(false);
    setSupplierItemNotes("");
    setEditingSupplierItemId(null);
  }

  function toggleSupplierPricingSort(key: SupplierPricingSortKey) {
    setSupplierPricingSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function startEditingSupplierItem(item: InventorySupplierItem) {
    setEditingSupplierItemId(item.id);
    setSelectedSupplierId(item.supplierId);
    setSelectedMaterialId(item.materialId);
    setCostPerUnit(String(item.costPerUnit));
    setCostEffectiveFrom(item.costEffectiveFrom ?? new Date(item.createdAt).toISOString().slice(0, 10));
    setCurrency(item.currency);
    setSupplierSku(item.supplierSku ?? "");
    setMinimumOrderQuantity(item.minimumOrderQuantity === undefined ? "" : String(item.minimumOrderQuantity));
    setLeadTimeDays(item.leadTimeDays === undefined ? "" : String(item.leadTimeDays));
    setPreferred(item.preferred);
    setSupplierItemNotes(item.notes ?? "");
    supplierItemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveSupplierItem() {
    const supplier = suppliers.find((candidate) => candidate.id === selectedSupplierId);
    const material = materials.find((candidate) => candidate.id === selectedMaterialId);
    const cost = Number(costPerUnit);
    const minimumQuantity = minimumOrderQuantity ? Number(minimumOrderQuantity) : undefined;
    const leadTime = leadTimeDays ? Number(leadTimeDays) : undefined;

    if (!supplier || !material) {
      toast.error("Choose a supplier and material.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Enter a valid unit cost.");
      return;
    }
    if (minimumQuantity !== undefined && (!Number.isFinite(minimumQuantity) || minimumQuantity <= 0)) {
      toast.error("Minimum order quantity must be greater than zero.");
      return;
    }
    if (leadTime !== undefined && (!Number.isInteger(leadTime) || leadTime < 0)) {
      toast.error("Lead time must be zero or more whole days.");
      return;
    }
    if (supplierItems.some((item) => item.supplierId === supplier.id && item.materialId === material.id && item.id !== editingSupplierItemId)) {
      toast.error("This supplier is already linked to that material.");
      return;
    }

    setSupplierItemSaving(true);
    try {
      const existing = editingSupplierItemId ? supplierItems.find((item) => item.id === editingSupplierItemId) : undefined;
      if (preferred) {
        await Promise.all(
          supplierItems
            .filter((item) => item.materialId === material.id && item.preferred && item.id !== editingSupplierItemId)
            .map((item) => upsertInventorySupplierItem({ ...item, id: item.id, preferred: false, createdAt: item.createdAt }))
        );
      }
      await upsertInventorySupplierItem({
        id: editingSupplierItemId ?? undefined,
        supplierId: supplier.id,
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        costPerUnit: cost,
        currency: currency.trim().toUpperCase() || "IDR",
        costEffectiveFrom,
        supplierSku: supplierSku.trim() || undefined,
        minimumOrderQuantity: minimumQuantity,
        leadTimeDays: leadTime,
        preferred,
        notes: supplierItemNotes.trim() || undefined,
        createdAt: existing?.createdAt,
      });
      toast.success(editingSupplierItemId ? "Supplier item updated" : "Supplier item linked");
      resetSupplierItemForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to save supplier item", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier item");
    } finally {
      setSupplierItemSaving(false);
    }
  }

  async function removeSupplierItem(item: InventorySupplierItem) {
    setSupplierItemSaving(true);
    try {
      await deleteInventorySupplierItem(item.id);
      toast.success("Supplier link removed");
      if (editingSupplierItemId === item.id) resetSupplierItemForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to remove supplier item", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove supplier link");
    } finally {
      setSupplierItemSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><CircleAlert className={`size-5 ${toOrderCount > 0 ? "text-danger" : "text-success"}`} /><div><p className="text-xs text-muted-foreground">Items to order</p><p className="text-xl font-semibold tabular-nums">{stockLoading ? "—" : toOrderCount}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><Truck className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">Orders on the way</p><p className="text-xl font-semibold tabular-nums">{activeOrderCount}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><CalendarClock className="size-5 text-info" /><div><p className="text-xs text-muted-foreground">Scheduled stock-ins</p><p className="text-xl font-semibold tabular-nums">{activeScheduleCount}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><ClipboardList className="size-5 text-success" /><div><p className="text-xs text-muted-foreground">Orders in the last 7 days</p><p className="text-xl font-semibold tabular-nums">{recentOrderCount}</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 p-3"><Bell className="size-5 text-info" /><div><p className="text-xs text-muted-foreground">In-app alerts</p><p className="font-semibold">{stockLoading ? "Loading…" : "Enabled per material"}</p></div></CardContent></Card>
      </div>

      <ReorderOverview materials={activeMaterials} suppliers={suppliers} balances={balances} stockInitialized={Boolean(stockSetup?.initialized)} stockLoading={stockLoading} openOrderMaterialIds={openOrderMaterialIds} />

      <SupplierOrders materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={orders} onChanged={async () => { await onChanged(); await refreshStock(); }} />

      <ReorderSettings materials={activeMaterials} suppliers={suppliers} supplierItems={supplierItems} balances={balances} onChanged={async () => { await onChanged(); await refreshStock(); }} />

      <SupplierSchedules materials={materials} suppliers={suppliers} supplierItems={supplierItems} schedules={schedules} onChanged={async () => { await onChanged(); await refreshStock(); }} />

      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <Truck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Supplier foundation</p>
            <p className="mt-1 text-sm text-muted-foreground">Add suppliers and link them to inventory materials before setting reorder thresholds or creating supplier orders.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Supplier master</CardTitle><CardDescription>{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} currently defined.</CardDescription></CardHeader>
        <CardContent>
          {suppliers.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No suppliers yet. Add one below to start linking supply sources.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>{suppliers.map((supplier) => {
                  const busy = supplierUpdatingId === supplier.id;
                  return <TableRow key={supplier.id} className={!supplier.active ? "bg-surface-elevated" : undefined}>
                    <TableCell><span className="font-medium">{supplier.name}</span>{supplier.address && <span className="block max-w-64 truncate text-xs text-muted-foreground">{supplier.address}</span>}</TableCell>
                    <TableCell><span>{supplier.contactPerson || "—"}</span>{supplier.phone && <span className="block text-xs text-muted-foreground">{supplier.phone}</span>}</TableCell>
                    <TableCell><Badge variant={supplier.active ? "secondary" : "outline"}>{supplier.active ? "Active" : "Archived"}</Badge></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => startEditingSupplier(supplier)} disabled={busy}><Pencil className="size-3.5" />Edit</Button><Button size="sm" variant="outline" onClick={() => void toggleSupplier(supplier)} disabled={busy}>{supplier.active ? <><Archive className="size-3.5" />Archive</> : <><RotateCcw className="size-3.5" />Restore</>}</Button></div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div ref={supplierFormRef}>
        <Card>
          <CardHeader>
            <CardTitle>{editingSupplierId ? "Edit supplier" : "Add a supplier"}</CardTitle>
            <CardDescription>Keep supplier contact details here; archived suppliers remain available in historical records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="supplier-name">Name</Label><Input id="supplier-name" value={supplierForm.name} onChange={(event) => updateSupplierForm("name", event.target.value)} placeholder="e.g. PT Supplier Utama" /></div>
              <div className="space-y-1.5"><Label htmlFor="supplier-contact">Contact person</Label><Input id="supplier-contact" value={supplierForm.contactPerson} onChange={(event) => updateSupplierForm("contactPerson", event.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label htmlFor="supplier-phone">Phone</Label><Input id="supplier-phone" value={supplierForm.phone} onChange={(event) => updateSupplierForm("phone", event.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label htmlFor="supplier-email">Email</Label><Input id="supplier-email" type="email" value={supplierForm.email} onChange={(event) => updateSupplierForm("email", event.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-address">Address</Label><Input id="supplier-address" value={supplierForm.address} onChange={(event) => updateSupplierForm("address", event.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="supplier-notes">Notes</Label><textarea id="supplier-notes" value={supplierForm.notes} onChange={(event) => updateSupplierForm("notes", event.target.value)} className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Optional" /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveSupplier()} disabled={supplierSaving}><Plus className="size-4" />{supplierSaving ? "Saving…" : editingSupplierId ? "Save changes" : "Add supplier"}</Button>
              {editingSupplierId && <Button variant="outline" onClick={resetSupplierForm} disabled={supplierSaving}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Supplier pricing by material</CardTitle><CardDescription>{supplierItems.length} supplier link{supplierItems.length === 1 ? "" : "s"} currently defined. Click a column heading to sort.</CardDescription></CardHeader>
        <CardContent>
          {supplierItems.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No supplier links yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <SupplierPricingHead label="Material" sortKey="material" sort={supplierPricingSort} onSort={toggleSupplierPricingSort} />
            <SupplierPricingHead label="Supplier" sortKey="supplier" sort={supplierPricingSort} onSort={toggleSupplierPricingSort} />
            <SupplierPricingHead label="Cost" sortKey="cost" sort={supplierPricingSort} onSort={toggleSupplierPricingSort} />
            <SupplierPricingHead label="Buying details" sortKey="buyingDetails" sort={supplierPricingSort} onSort={toggleSupplierPricingSort} />
            <SupplierPricingHead label="Status" sortKey="status" sort={supplierPricingSort} onSort={toggleSupplierPricingSort} />
            <TableHead className="text-right">Action</TableHead>
          </TableRow></TableHeader><TableBody>{sortedSupplierItems.map((item) => {
            const supplier = supplierById.get(item.supplierId);
            const material = materialById.get(item.materialId);
            return <TableRow key={item.id}>
              <TableCell><span className="font-medium">{material?.name ?? item.materialName}</span><span className="block text-xs text-muted-foreground">{item.unit}</span></TableCell>
              <TableCell>{supplier?.name ?? "Archived supplier"}</TableCell>
              <TableCell className="tabular-nums">{item.currency} {item.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })}<span className="block text-xs text-muted-foreground">per {item.unit} · effective {item.costEffectiveFrom ?? "date not recorded"}</span>{item.costHistory && item.costHistory.length > 0 && <span className="mt-1 block whitespace-normal text-xs text-muted-foreground">Previous: {[...item.costHistory].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((version) => `${version.currency} ${version.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })} from ${version.effectiveFrom}`).join(" · ")}</span>}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{item.minimumOrderQuantity !== undefined ? `Min ${item.minimumOrderQuantity} · ` : ""}{item.leadTimeDays !== undefined ? `${item.leadTimeDays} day lead` : "No lead time"}</TableCell>
              <TableCell>{item.preferred ? <Badge variant="default">Preferred</Badge> : <Badge variant="outline">Alternate</Badge>}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => startEditingSupplierItem(item)} disabled={supplierItemSaving}><Pencil className="size-3.5" />Edit</Button><Button size="sm" variant="destructive" onClick={() => void removeSupplierItem(item)} disabled={supplierItemSaving}>Remove</Button></div></TableCell>
            </TableRow>;
          })}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <div ref={supplierItemFormRef}>
        <Card>
          <CardHeader>
            <CardTitle>{editingSupplierItemId ? "Edit supplier item" : "Link a supplier to a material"}</CardTitle>
            <CardDescription>Store the current supplier price and purchasing details using the material’s existing base unit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeSuppliers.length === 0 || activeMaterials.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add an active supplier and an active material before creating a link.</p> : <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="supplier-link-supplier">Supplier</Label><Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}><SelectTrigger id="supplier-link-supplier" className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-material">Material</Label><Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}><SelectTrigger id="supplier-link-material" className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger><SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name} · {material.baseUnit}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-cost">Cost per {selectedMaterial?.baseUnit ?? "unit"}</Label><Input id="supplier-link-cost" type="number" min="0" step="0.01" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} placeholder="0" /></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-cost-effective">Cost effective from</Label><Input id="supplier-link-cost-effective" type="date" value={costEffectiveFrom} onChange={(event) => setCostEffectiveFrom(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-currency">Currency</Label><Input id="supplier-link-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="IDR" /></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-sku">Supplier SKU / code</Label><Input id="supplier-link-sku" value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-minimum">Minimum order quantity</Label><Input id="supplier-link-minimum" type="number" min="0" step="0.01" value={minimumOrderQuantity} onChange={(event) => setMinimumOrderQuantity(event.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label htmlFor="supplier-link-lead-time">Lead time (days)</Label><Input id="supplier-link-lead-time" type="number" min="0" step="1" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} placeholder="Optional" /></div>
                <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preferred} onChange={(event) => setPreferred(event.target.checked)} className="size-4 accent-primary" />Preferred supplier for this material</label></div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="supplier-link-notes">Notes</Label><textarea id="supplier-link-notes" value={supplierItemNotes} onChange={(event) => setSupplierItemNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Optional" /></div>
              </div>
              <div className="flex flex-wrap gap-2"><Button onClick={() => void saveSupplierItem()} disabled={supplierItemSaving}><Link2 className="size-4" />{supplierItemSaving ? "Saving…" : editingSupplierItemId ? "Save changes" : "Link supplier"}</Button>{editingSupplierItemId && <Button variant="outline" onClick={resetSupplierItemForm} disabled={supplierItemSaving}>Cancel</Button>}</div>
            </>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Supplier movement audit</CardTitle><CardDescription>{filteredSupplierMovements.length} matching stock movement{filteredSupplierMovements.length === 1 ? "" : "s"}. Each row links a physical stock change to its supplier order or scheduled delivery.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-xl border bg-surface/40 p-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="supplier-audit-material">Material</Label><Select value={auditMaterialId} onValueChange={setAuditMaterialId}><SelectTrigger id="supplier-audit-material" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All materials</SelectItem>{auditMaterialOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-audit-from">From</Label><Input id="supplier-audit-from" type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="supplier-audit-to">Through</Label><Input id="supplier-audit-to" type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} /></div>
          </div>
          {filteredSupplierMovements.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No supplier stock movements match these filters.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Material</TableHead><TableHead>Quantity</TableHead><TableHead>Supplier / reference</TableHead><TableHead>Reason and notes</TableHead><TableHead>Created by</TableHead><TableHead>Source record</TableHead></TableRow></TableHeader><TableBody>{filteredSupplierMovements.map((movement) => <TableRow key={movement.id}><TableCell className="whitespace-nowrap">{formatDisplay(movement.occurredOn)}</TableCell><TableCell className="font-medium">{movement.materialName}<span className="block text-xs text-muted-foreground">{movement.unit}</span></TableCell><TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-success">+{movement.quantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })} {movement.unit}</TableCell><TableCell className="max-w-56 whitespace-normal">{movement.notes || (movement.sourceRef.startsWith("supplier-order:") ? "Supplier order receipt" : "Recurring supplier delivery")}</TableCell><TableCell className="max-w-64 whitespace-normal">{movement.reason}{movement.sourceRef.startsWith("supplier-delivery-schedule:") && movement.notes && <span className="block text-xs text-muted-foreground">{movement.notes}</span>}</TableCell><TableCell><Badge variant={movement.createdByType === "schedule" ? "secondary" : "outline"}>{movement.createdByLabel ?? (movement.createdByType === "schedule" ? "Automated schedule" : "User / legacy record")}</Badge></TableCell><TableCell className="max-w-64 whitespace-normal font-mono text-[11px] text-muted-foreground">{movement.sourceRef}</TableCell></TableRow>)}</TableBody></Table></div>}
        </CardContent>
      </Card>

    </div>
  );
}
