"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "@/lib/toast";
import { Ellipsis, Link2, Pencil, Plus, RotateCcw, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { EmptyState } from "@/components/patterns/states";
import { FieldRow } from "@/components/fields/field-row";
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
import { summarizeInventoryBalances } from "@/lib/inventory-ledger";
import { getInventoryReorderStatus } from "@/lib/reorder-status";
import { SupplierOrders } from "@/components/inventory/supplier-orders";
import { ToOrder } from "@/components/inventory/to-order";
import { ReorderSettings } from "@/components/inventory/reorder-settings";
import { SupplierSchedules } from "@/components/inventory/supplier-schedules";
import type { InventoryMaterial, InventoryMovement, InventoryStockSetup, InventorySupplier, InventorySupplierDeliverySchedule, InventorySupplierItem, InventorySupplierOrder } from "@/lib/types";

export type SuppliersView = "to-order" | "orders" | "setup";

type SuppliersProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  orders: InventorySupplierOrder[];
  schedules: InventorySupplierDeliverySchedule[];
  receiveRequest?: { orderId: string; requestId: number } | null;
  /** A new order for a material, requested from the Stock tab. */
  orderRequest?: { materialId: string; requestId: number } | null;
  /** Which part of the screen to show: the reorder list, the orders, or the setup. */
  view: SuppliersView;
  onViewChange: (view: SuppliersView) => void;
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

type SupplierPricingSortKey = "material" | "supplier" | "cost" | "buyingDetails" | "status";
type SupplierPricingSort = { key: SupplierPricingSortKey; dir: "asc" | "desc" } | null;

/** The Setup view's in-page segments (HTML §7: one page with a segmented control under the tabs). */
type SetupSegment = "reorder" | "deliveries" | "suppliers" | "pricing" | "audit";

const SETUP_SEGMENTS: { value: SetupSegment; label: string }[] = [
  { value: "reorder", label: "Reorder settings" },
  { value: "deliveries", label: "Deliveries" },
  { value: "suppliers", label: "Suppliers" },
  { value: "pricing", label: "Pricing" },
  { value: "audit", label: "Audit" },
];

const SECTION_CLASS = "overflow-hidden rounded-xl border border-line bg-surface shadow-card";
const TEXTAREA_CLASS =
  "min-h-24 w-full rounded-md border border-line-input bg-surface px-3 py-2 text-[16px] text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent desk:text-body";

/** Previous prices for one link, newest first, in a disclosure. Shows nothing when there is no history. */
function PriceHistory({ item }: { item: InventorySupplierItem }) {
  const history = item.costHistory ?? [];
  if (history.length === 0) return null;
  const versions = [...history].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return (
    <details className="text-small text-ink-muted">
      <summary className="inline-flex cursor-pointer items-center font-medium text-accent underline underline-offset-4 [@media(pointer:coarse)]:min-h-11">
        Previous prices ({versions.length})
      </summary>
      <ul className="mt-1 space-y-0.5 tabular-nums">
        {versions.map((version, index) => (
          <li key={`${version.effectiveFrom}-${index}`}>
            {version.currency} {version.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })} from {version.effectiveFrom}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Suppliers({ materials, suppliers, supplierItems, orders, schedules, receiveRequest, orderRequest, view, onViewChange, onChanged }: SuppliersProps) {
  const confirm = useConfirm();
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
  const [setupSegment, setSetupSegment] = useState<SetupSegment>("reorder");
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);
  const [supplierItemSheetOpen, setSupplierItemSheetOpen] = useState(false);
  const [orderPrefillRequest, setOrderPrefillRequest] = useState<{ materialId: string; requestId: number } | null>(null);
  const handledOrderRequestId = useRef<number | null>(null);

  useEffect(() => {
    if (!orderRequest || handledOrderRequestId.current === orderRequest.requestId) return;
    handledOrderRequestId.current = orderRequest.requestId;
    // Deferred, like the other page effects, so the state update is not made during the effect.
    void Promise.resolve().then(() =>
      setOrderPrefillRequest({ materialId: orderRequest.materialId, requestId: orderRequest.requestId })
    );
  }, [orderRequest]);
  // A Create order request applies to one visit of the Orders view. Leaving the view clears it, so a later visit
  // does not reopen the order sheet with the old material.
  useEffect(() => {
    if (view === "orders" || !orderPrefillRequest) return;
    void Promise.resolve().then(() => setOrderPrefillRequest(null));
  }, [orderPrefillRequest, view]);
  const orderPrefillRequestId = useRef(0);
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

    const { key, dir } = supplierPricingSort;
    const sign = dir === "asc" ? 1 : -1;
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
  const toOrderCount = useMemo(() => activeMaterials.filter((material) => getInventoryReorderStatus(material, balances.find((balance) => balance.materialId === material.id)?.currentQuantity, Boolean(stockSetup?.initialized), openOrderMaterialIds.has(material.id)) === "to-order").length, [activeMaterials, balances, openOrderMaterialIds, stockSetup]);
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
    setSupplierSheetOpen(true);
  }

  function resetSupplierForm() {
    setEditingSupplierId(null);
    setSupplierForm(EMPTY_SUPPLIER_FORM);
  }

  function supplierFormProblem(): string | null {
    const name = supplierForm.name.trim();
    if (!name) return "Enter a supplier name first.";
    const normalizedName = normalizeInventoryName(name);
    if (suppliers.some((supplier) => supplier.normalizedName === normalizedName && supplier.id !== editingSupplierId)) {
      return "A supplier with that name already exists.";
    }
    return null;
  }

  async function saveSupplier() {
    const problem = supplierFormProblem();
    if (problem) {
      toast.error(problem);
      return;
    }
    const name = supplierForm.name.trim();
    const normalizedName = normalizeInventoryName(name);

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
      setSupplierSheetOpen(false);
      await onChanged();
    } catch (error) {
      console.error("Failed to save supplier", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier");
    } finally {
      setSupplierSaving(false);
    }
  }

  async function toggleSupplier(supplier: InventorySupplier) {
    if (supplier.active) {
      const ok = await confirm({
        title: `Archive ${supplier.name}?`,
        body: "Archived suppliers can no longer be picked for new orders or delivery schedules. Past orders are kept.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
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
      dir: current?.key === key && current.dir === "asc" ? "desc" : "asc",
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
    setPreferred(materialById.get(item.materialId)?.preferredSupplierId === item.supplierId);
    setSupplierItemNotes(item.notes ?? "");
    setSupplierItemSheetOpen(true);
  }

  function supplierItemProblem(): string | null {
    const supplier = suppliers.find((candidate) => candidate.id === selectedSupplierId);
    const material = materials.find((candidate) => candidate.id === selectedMaterialId);
    const cost = Number(costPerUnit);
    const minimumQuantity = minimumOrderQuantity ? Number(minimumOrderQuantity) : undefined;
    const leadTime = leadTimeDays ? Number(leadTimeDays) : undefined;
    if (!supplier || !material) return "Choose a supplier and material.";
    if (!Number.isFinite(cost) || cost < 0) return "Enter a valid unit cost.";
    if (minimumQuantity !== undefined && (!Number.isFinite(minimumQuantity) || minimumQuantity <= 0)) {
      return "Minimum order quantity must be greater than zero.";
    }
    if (leadTime !== undefined && (!Number.isInteger(leadTime) || leadTime < 0)) return "Lead time must be zero or more whole days.";
    if (supplierItems.some((item) => item.supplierId === supplier.id && item.materialId === material.id && item.id !== editingSupplierItemId)) {
      return "This supplier is already linked to that material.";
    }
    return null;
  }

  async function saveSupplierItem() {
    const supplier = suppliers.find((candidate) => candidate.id === selectedSupplierId);
    const material = materials.find((candidate) => candidate.id === selectedMaterialId);
    const cost = Number(costPerUnit);
    const minimumQuantity = minimumOrderQuantity ? Number(minimumOrderQuantity) : undefined;
    const leadTime = leadTimeDays ? Number(leadTimeDays) : undefined;

    const problem = supplierItemProblem();
    if (problem || !supplier || !material) {
      toast.error(problem ?? "Choose a supplier and material.");
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
      // The material's preferred supplier is the one source of truth. The link form's
      // "Preferred" checkbox writes through to it. An empty string clears it, because the
      // merge write would keep an omitted field.
      if (preferred && material.preferredSupplierId !== supplier.id) {
        await upsertInventoryMaterial({ ...material, id: material.id, createdAt: material.createdAt, preferredSupplierId: supplier.id });
      } else if (!preferred && material.preferredSupplierId === supplier.id) {
        await upsertInventoryMaterial({ ...material, id: material.id, createdAt: material.createdAt, preferredSupplierId: "" });
      }
      toast.success(editingSupplierItemId ? "Supplier item updated" : "Supplier item linked");
      resetSupplierItemForm();
      setSupplierItemSheetOpen(false);
      await onChanged();
    } catch (error) {
      console.error("Failed to save supplier item", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier item");
    } finally {
      setSupplierItemSaving(false);
    }
  }

  async function removeSupplierItem(item: InventorySupplierItem) {
    const supplierName = supplierById.get(item.supplierId)?.name ?? "this supplier";
    const ok = await confirm({
      title: `Remove ${item.materialName} from ${supplierName}?`,
      body: `This removes the supplier link with its price (${item.costPerUnit} ${item.currency} per ${item.unit}) and lead time. Past orders are kept.`,
      confirmLabel: "Remove link",
      tone: "danger",
    });
    if (!ok) return;
    setSupplierItemSaving(true);
    try {
      await deleteInventorySupplierItem(item.id);
      toast.success("Supplier link removed");
      if (editingSupplierItemId === item.id) {
        resetSupplierItemForm();
        setSupplierItemSheetOpen(false);
      }
      await onChanged();
    } catch (error) {
      console.error("Failed to remove supplier item", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove supplier link");
    } finally {
      setSupplierItemSaving(false);
    }
  }

  function openNewSupplier() {
    resetSupplierForm();
    setSupplierSheetOpen(true);
  }

  function cancelSupplierForm() {
    resetSupplierForm();
    setSupplierSheetOpen(false);
  }

  function openNewSupplierItem() {
    resetSupplierItemForm();
    setSupplierItemSheetOpen(true);
  }

  function cancelSupplierItemForm() {
    resetSupplierItemForm();
    setSupplierItemSheetOpen(false);
  }

  // Each form's problem, in the same order and wording the save checks use. The sheets show it in their save bar.
  const supplierBlocker = supplierFormProblem();
  const itemBlocker = activeSuppliers.length === 0 || activeMaterials.length === 0 ? null : supplierItemProblem();

  const supplierColumns: Column<InventorySupplier>[] = [
    { key: "name", label: "Supplier", phone: "title", cell: (supplier) => <span className="font-medium">{supplier.name}</span> },
    { key: "address", label: "Address", phone: "meta", cell: (supplier) => <span className="block max-w-64 truncate text-ink-muted">{supplier.address || "—"}</span> },
    {
      key: "contact",
      label: "Contact",
      phone: "detail",
      cell: (supplier) => (
        <>
          <span>{supplier.contactPerson || "—"}</span>
          {supplier.phone ? <span className="block text-small text-ink-muted">{supplier.phone}</span> : null}
        </>
      ),
    },
    { key: "status", label: "Status", phone: "figure", cell: (supplier) => (supplier.active ? null : <StatusChip tone="neutral">Archived</StatusChip>) },
  ];

  const pricingColumns: Column<InventorySupplierItem>[] = [
    {
      key: "material",
      label: "Material",
      sortKey: "material",
      phone: "title",
      cell: (item) => (
        <>
          <span className="font-medium">{materialById.get(item.materialId)?.name ?? item.materialName}</span>
          <span className="text-small text-ink-muted"> · {item.unit}</span>
        </>
      ),
    },
    { key: "supplier", label: "Supplier", sortKey: "supplier", phone: "meta", cell: (item) => supplierById.get(item.supplierId)?.name ?? "Archived supplier" },
    {
      key: "cost",
      label: "Cost",
      sortKey: "cost",
      align: "right",
      phone: "figure",
      cell: (item) => (
        <>
          <span className="block">{item.currency} {item.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</span>
          <span className="block text-small font-normal text-ink-muted">per {item.unit} · {item.costEffectiveFrom ? `from ${item.costEffectiveFrom}` : "no date"}</span>
        </>
      ),
    },
    {
      key: "buying",
      label: "Buying details",
      sortKey: "buyingDetails",
      phone: "detail",
      cell: (item) => (
        <>
          {item.minimumOrderQuantity !== undefined ? `Min ${item.minimumOrderQuantity} · ` : ""}
          {item.leadTimeDays !== undefined ? `${item.leadTimeDays} day lead` : "No lead time"}
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      phone: "detail",
      cell: (item) => (materialById.get(item.materialId)?.preferredSupplierId === item.supplierId ? <StatusChip tone="ok">Preferred</StatusChip> : <StatusChip tone="neutral">Alternate</StatusChip>),
    },
    { key: "history", label: "Price history", phone: "detail", cell: (item) => <PriceHistory item={item} /> },
  ];

  const auditColumns: Column<InventoryMovement>[] = [
    { key: "date", label: "Date", phone: "meta", cell: (movement) => <span className="whitespace-nowrap">{formatDisplay(movement.occurredOn)}</span> },
    {
      key: "material",
      label: "Material",
      phone: "title",
      cell: (movement) => (
        <>
          <span className="font-medium">{movement.materialName}</span>
          <span className="text-small text-ink-muted"> · {movement.unit}</span>
        </>
      ),
    },
    {
      key: "quantity",
      label: "Quantity",
      align: "right",
      phone: "figure",
      cell: (movement) => <span className="whitespace-nowrap">+{movement.quantity.toLocaleString("id-ID", { maximumFractionDigits: 2 })} {movement.unit}</span>,
    },
    {
      key: "reference",
      label: "Supplier / reference",
      phone: "detail",
      cell: (movement) => movement.notes || (movement.sourceRef.startsWith("supplier-order:") ? "Supplier order receipt" : "Recurring supplier delivery"),
    },
    {
      key: "reason",
      label: "Reason and notes",
      phone: "detail",
      cell: (movement) => (
        <>
          {movement.reason}
          {movement.sourceRef.startsWith("supplier-delivery-schedule:") && movement.notes ? <span className="block text-small text-ink-muted">{movement.notes}</span> : null}
        </>
      ),
    },
    {
      key: "createdBy",
      label: "Created by",
      phone: "detail",
      cell: (movement) => movement.createdByLabel ?? (movement.createdByType === "schedule" ? "Automated schedule" : "User / legacy record"),
    },
    {
      key: "source",
      label: "Source record",
      phone: "detail",
      cell: (movement) => <span className="font-mono text-micro text-ink-muted [overflow-wrap:anywhere]">{movement.sourceRef}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      {view === "to-order" && (
        <ToOrder
          materials={activeMaterials}
          suppliers={suppliers}
          balances={balances}
          stockInitialized={Boolean(stockSetup?.initialized)}
          stockLoading={stockLoading}
          openOrderMaterialIds={openOrderMaterialIds}
          toOrderCount={toOrderCount}
          onWayCount={activeOrderCount}
          scheduledCount={activeScheduleCount}
          recentOrderCount={recentOrderCount}
          onCreateOrder={(materialId) => { setOrderPrefillRequest({ materialId, requestId: ++orderPrefillRequestId.current }); onViewChange("orders"); }}
        />
      )}
      {view === "orders" && (
        <>
      <SupplierOrders key={orderPrefillRequest?.requestId ?? "new-order"} materials={materials} suppliers={suppliers} supplierItems={supplierItems} orders={orders} createOrderRequest={orderPrefillRequest} receiveRequest={receiveRequest} onChanged={async () => { await onChanged(); await refreshStock(); }} />

        </>
      )}
      {view === "setup" && (
        <div className="space-y-5">
          <div className="-mx-4 overflow-x-auto px-4 tablet:mx-0 tablet:px-0">
            <SegmentedControl label="Suppliers sections" value={setupSegment} onChange={setSetupSegment} options={SETUP_SEGMENTS} className="flex-nowrap [&>button]:whitespace-nowrap" />
          </div>

          {/* Every segment stays mounted and is only hidden, so reorder drafts survive a switch to another segment. */}
          <div hidden={setupSegment !== "reorder"}>
            <ReorderSettings materials={activeMaterials} suppliers={suppliers} supplierItems={supplierItems} balances={balances} onChanged={async () => { await onChanged(); await refreshStock(); }} />
          </div>

          <div hidden={setupSegment !== "deliveries"}>
            <SupplierSchedules materials={materials} suppliers={suppliers} supplierItems={supplierItems} schedules={schedules} onChanged={async () => { await onChanged(); await refreshStock(); }} />
          </div>

          <div hidden={setupSegment !== "suppliers"}>
            <section aria-labelledby="supplier-master-title" className={SECTION_CLASS}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 desk:px-6">
                <div>
                  <h2 id="supplier-master-title" className="font-display text-title-2 text-ink">Supplier master</h2>
                  <p className="mt-1 text-small text-ink-muted">{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} currently defined.</p>
                </div>
                <Button onClick={openNewSupplier}>
                  <Plus strokeWidth={1.5} aria-hidden="true" />
                  Add supplier
                </Button>
              </div>
              <DataTable
                caption="Supplier master"
                columns={supplierColumns}
                rows={suppliers}
                getKey={(supplier) => supplier.id}
                actionsBelow
                rowActions={(supplier) => {
                  const busy = supplierUpdatingId === supplier.id;
                  return (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEditingSupplier(supplier)} disabled={busy}>
                        <Pencil strokeWidth={1.5} aria-hidden="true" />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${supplier.name}`} disabled={busy}>
                            <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={busy} onSelect={() => void toggleSupplier(supplier)}>
                            {supplier.active ? (
                              <><Archive className="size-4" strokeWidth={1.5} aria-hidden="true" />Archive</>
                            ) : (
                              <><RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />Restore</>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                }}
                empty={<EmptyState title="No suppliers yet">Add one to start linking supply sources.</EmptyState>}
              />
            </section>
          </div>

          <div hidden={setupSegment !== "pricing"}>
            <section aria-labelledby="supplier-pricing-title" className={SECTION_CLASS}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 desk:px-6">
                <div>
                  <h2 id="supplier-pricing-title" className="font-display text-title-2 text-ink">Supplier pricing by material</h2>
                  <p className="mt-1 text-small text-ink-muted">
                    {supplierItems.length} supplier link{supplierItems.length === 1 ? "" : "s"} currently defined. Select a column heading to sort.
                  </p>
                </div>
                <Button onClick={openNewSupplierItem}>
                  <Link2 strokeWidth={1.5} aria-hidden="true" />
                  Link a supplier
                </Button>
              </div>
              <DataTable
                caption="Supplier pricing by material"
                columns={pricingColumns}
                rows={sortedSupplierItems}
                getKey={(item) => item.id}
                listBelow="desk"
                actionsBelow
                sort={supplierPricingSort}
                onSort={(key) => toggleSupplierPricingSort(key as SupplierPricingSortKey)}
                rowActions={(item) => (
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEditingSupplierItem(item)} disabled={supplierItemSaving}>
                      <Pencil strokeWidth={1.5} aria-hidden="true" />
                      Edit
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${item.materialName} from ${supplierById.get(item.supplierId)?.name ?? "archived supplier"}`} disabled={supplierItemSaving}>
                          <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-danger focus:text-danger" disabled={supplierItemSaving} onSelect={() => void removeSupplierItem(item)}>
                          Remove link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                empty={<EmptyState title="No supplier links yet">Link a supplier to a material and its price shows here.</EmptyState>}
              />
            </section>
          </div>

          <div hidden={setupSegment !== "audit"}>
            <section aria-labelledby="supplier-audit-title" className={SECTION_CLASS}>
              <div className="p-4 desk:px-6">
                <h2 id="supplier-audit-title" className="font-display text-title-2 text-ink">Supplier movement audit</h2>
                <p className="mt-1 text-small text-ink-muted">
                  {filteredSupplierMovements.length} matching stock movement{filteredSupplierMovements.length === 1 ? "" : "s"}. Each row links a physical stock change to its supplier order or scheduled delivery.
                </p>
                <div className="mt-4 grid gap-4 tablet:grid-cols-3">
                  <FieldRow label="Material">
                    {(id) => (
                      <Select value={auditMaterialId} onValueChange={setAuditMaterialId}>
                        <SelectTrigger id={id} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All materials</SelectItem>
                          {auditMaterialOptions.map(([id, name]) => (
                            <SelectItem key={id} value={id}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FieldRow>
                  <FieldRow label="From">{(id) => <Input id={id} type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} />}</FieldRow>
                  <FieldRow label="Through">{(id) => <Input id={id} type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} />}</FieldRow>
                </div>
              </div>
              <DataTable
                caption="Supplier movement audit"
                columns={auditColumns}
                rows={filteredSupplierMovements}
                getKey={(movement) => movement.id}
                listBelow="desk"
                empty={<EmptyState title="No supplier stock movements match these filters">Change the material or dates to see more movements.</EmptyState>}
              />
            </section>
          </div>

          <Sheet open={supplierSheetOpen} onOpenChange={setSupplierSheetOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editingSupplierId ? "Edit supplier" : "Add a supplier"}</SheetTitle>
                <SheetDescription>Keep supplier contact details here. Archived suppliers stay in historical records.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 tablet:grid-cols-2">
                <FieldRow label="Name">{(id) => <Input id={id} value={supplierForm.name} onChange={(event) => updateSupplierForm("name", event.target.value)} placeholder="e.g. PT Supplier Utama" />}</FieldRow>
                <FieldRow label="Contact person">{(id) => <Input id={id} value={supplierForm.contactPerson} onChange={(event) => updateSupplierForm("contactPerson", event.target.value)} placeholder="Optional" />}</FieldRow>
                <FieldRow label="Phone" hint="Used for WhatsApp orders.">{(id) => <Input id={id} value={supplierForm.phone} onChange={(event) => updateSupplierForm("phone", event.target.value)} placeholder="Optional" />}</FieldRow>
                <FieldRow label="Email">{(id) => <Input id={id} type="email" value={supplierForm.email} onChange={(event) => updateSupplierForm("email", event.target.value)} placeholder="Optional" />}</FieldRow>
                <div className="tablet:col-span-2">
                  <FieldRow label="Address">{(id) => <Input id={id} value={supplierForm.address} onChange={(event) => updateSupplierForm("address", event.target.value)} placeholder="Optional" />}</FieldRow>
                </div>
                <div className="tablet:col-span-2">
                  <FieldRow label="Notes">
                    {(id) => <textarea id={id} value={supplierForm.notes} onChange={(event) => updateSupplierForm("notes", event.target.value)} className={TEXTAREA_CLASS} placeholder="Optional" />}
                  </FieldRow>
                </div>
              </div>
              <SheetFooter>
                <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{supplierBlocker ?? ""}</p>
                <Button variant="secondary" onClick={cancelSupplierForm} disabled={supplierSaving}>Cancel</Button>
                <Button onClick={() => void saveSupplier()} loading={supplierSaving} disabled={supplierSaving}>
                  {supplierSaving ? "Saving…" : editingSupplierId ? "Save changes" : "Add supplier"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet open={supplierItemSheetOpen} onOpenChange={setSupplierItemSheetOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editingSupplierItemId ? "Edit supplier item" : "Link a supplier to a material"}</SheetTitle>
                <SheetDescription>Store the current supplier price and purchasing details using the material&apos;s existing base unit.</SheetDescription>
              </SheetHeader>
              {activeSuppliers.length === 0 || activeMaterials.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-input p-6 text-center text-body text-ink-muted">
                  Add an active supplier and an active material before creating a link.
                </p>
              ) : (
                <div className="grid gap-4 tablet:grid-cols-2">
                  <FieldRow label="Supplier">
                    {(id) => (
                      <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                        <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                        <SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </FieldRow>
                  <FieldRow label="Material">
                    {(id) => (
                      <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                        <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose material" /></SelectTrigger>
                        <SelectContent>{activeMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name} · {material.baseUnit}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </FieldRow>
                  <FieldRow label={`Cost per ${selectedMaterial?.baseUnit ?? "unit"}`}>
                    {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} placeholder="0" />}
                  </FieldRow>
                  <FieldRow label="Cost effective from">
                    {(id) => <Input id={id} type="date" value={costEffectiveFrom} onChange={(event) => setCostEffectiveFrom(event.target.value)} />}
                  </FieldRow>
                  <FieldRow label="Currency">{(id) => <Input id={id} value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="IDR" />}</FieldRow>
                  <FieldRow label="Supplier SKU / code">{(id) => <Input id={id} value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} placeholder="Optional" />}</FieldRow>
                  <FieldRow label="Minimum order quantity">
                    {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={minimumOrderQuantity} onChange={(event) => setMinimumOrderQuantity(event.target.value)} placeholder="Optional" />}
                  </FieldRow>
                  <FieldRow label="Lead time (days)">
                    {(id) => <Input id={id} type="number" inputMode="numeric" min="0" step="1" value={leadTimeDays} onChange={(event) => setLeadTimeDays(event.target.value)} placeholder="Optional" />}
                  </FieldRow>
                  <div className="tablet:col-span-2">
                    <label className="flex min-h-11 items-center gap-3 text-body text-ink">
                      <input type="checkbox" checked={preferred} onChange={(event) => setPreferred(event.target.checked)} className="size-5 accent-brand" />
                      Preferred supplier for this material
                    </label>
                  </div>
                  <div className="tablet:col-span-2">
                    <FieldRow label="Notes">
                      {(id) => <textarea id={id} value={supplierItemNotes} onChange={(event) => setSupplierItemNotes(event.target.value)} className={TEXTAREA_CLASS} placeholder="Optional" />}
                    </FieldRow>
                  </div>
                </div>
              )}
              <SheetFooter>
                <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{itemBlocker ?? ""}</p>
                <Button variant="secondary" onClick={cancelSupplierItemForm} disabled={supplierItemSaving}>Cancel</Button>
                {activeSuppliers.length === 0 || activeMaterials.length === 0 ? null : (
                  <Button onClick={() => void saveSupplierItem()} loading={supplierItemSaving} disabled={supplierItemSaving}>
                    <Link2 strokeWidth={1.5} aria-hidden="true" />
                    {supplierItemSaving ? "Saving…" : editingSupplierItemId ? "Save changes" : "Link supplier"}
                  </Button>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}
