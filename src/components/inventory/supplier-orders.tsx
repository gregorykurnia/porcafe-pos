"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Ellipsis, Plus, Trash2 } from "lucide-react";
import { Banner } from "@/components/patterns/banner";
import { ConfirmDialog } from "@/components/patterns/dialogs";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import { EmptyState } from "@/components/patterns/states";
import { FieldRow } from "@/components/fields/field-row";
import { MaterialQuantityInput } from "@/components/fields/material-quantity-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buildSupplierOrderMessage, toWhatsAppLink } from "@/lib/supplier-message";
import { todayISO, formatDisplay } from "@/lib/dates";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { cancelInventorySupplierOrder, receiveInventorySupplierOrder, updateInventorySupplierOrder, upsertInventorySupplierOrder } from "@/lib/data";
import { cn } from "@/lib/utils";
import type {
  InventoryMaterial,
  InventorySupplier,
  InventorySupplierItem,
  InventorySupplierOrder,
  InventorySupplierOrderLine,
} from "@/lib/types";

type SupplierOrdersProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  orders: InventorySupplierOrder[];
  createOrderRequest: { materialId: string; requestId: number } | null;
  /** Opens the receive panel for an order, e.g. from the Stock tab's "Receive against this order". */
  receiveRequest?: { orderId: string; requestId: number } | null;
  onChanged: () => Promise<void>;
};

type DraftLine = InventorySupplierOrderLine & { draftId: string };

// Order status to a Canopy tone (DESIGN_SYSTEM §6). A scheduled delivery that is still ordered reads as waiting.
const ORDER_STATUS: Record<InventorySupplierOrder["status"], { label: string; tone: StatusTone }> = {
  ordered: { label: "Ordered / On the Way", tone: "info" },
  partially_received: { label: "Partially Received", tone: "info" },
  received: { label: "Received", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "open", label: "Open / On the Way" },
  { value: "all", label: "All statuses" },
  { value: "ordered", label: "Ordered / On the Way" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function isOpenOrder(order: InventorySupplierOrder): boolean {
  return order.status === "ordered" || order.status === "partially_received";
}

function statusFor(order: InventorySupplierOrder): { label: string; tone: StatusTone } {
  if (order.source === "schedule" && order.status === "ordered") return { label: "Waiting to be confirmed", tone: "warn" };
  return ORDER_STATUS[order.status];
}

function formatAmount(value: number): string {
  return formatInventoryUsageQuantity(value);
}

// Sends an open order to its supplier: WhatsApp when the supplier has a valid number, and
// copying the text for anywhere else.
function OrderSendButtons({ order, supplier }: { order: InventorySupplierOrder; supplier: InventorySupplier | undefined }) {
  const text = buildSupplierOrderMessage(order, { name: supplier?.name ?? order.supplierName, contactPerson: supplier?.contactPerson });
  const link = toWhatsAppLink(supplier?.phone, text);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Order text copied");
    } catch {
      toast.error("Could not copy automatically. Select the text in the order and copy it.");
    }
  }

  return (
    <>
      {link ? (
        <Button asChild variant="secondary" size="sm">
          <a href={link} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </Button>
      ) : (
        <span className="self-center text-small text-ink-muted">No WhatsApp number</span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => void copyText()}>Copy text</Button>
    </>
  );
}

function expectedDeliveryDate(orderedOn: string, leadTimeDays: number | undefined): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderedOn) ||
    leadTimeDays === undefined ||
    !Number.isInteger(leadTimeDays) ||
    leadTimeDays < 0) return "";

  const date = new Date(`${orderedOn}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== orderedOn) return "";
  date.setUTCDate(date.getUTCDate() + leadTimeDays);
  const expectedOn = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(expectedOn) ? expectedOn : "";
}

// Warnings for an order that arrived from To order with a problem. They are also shown as a banner in the sheet.
function prefillWarningFor(material: InventoryMaterial | undefined, supplier: InventorySupplier | undefined, item: InventorySupplierItem | undefined): string | null {
  if (material && !supplier) {
    return material.preferredSupplierId
      ? "This material’s preferred supplier is inactive. Choose an active supplier to finish the order."
      : "No preferred supplier is set for this material. Choose a supplier to finish the order.";
  }
  if (material && !item) return "This material is not linked to its preferred supplier. Choose a supplier with this material linked.";
  return null;
}

/**
 * Stock → Orders (inventory §3.6.3). A list of orders beside the selected order's detail. Receive is an inner panel in
 * the detail. Create and edit open in a sheet. On phone and tablet the list and the detail take turns.
 */
export function SupplierOrders({ materials, suppliers, supplierItems, orders, createOrderRequest, receiveRequest, onChanged }: SupplierOrdersProps) {
  const hasHandledCreateOrderRequest = useRef(false);
  const handledReceiveRequestId = useRef<number | null>(null);
  const createOrderMaterial = createOrderRequest
    ? materials.find((material) => material.id === createOrderRequest.materialId && material.active)
    : undefined;
  const createOrderSupplier = createOrderMaterial?.preferredSupplierId
    ? suppliers.find((supplier) => supplier.id === createOrderMaterial.preferredSupplierId && supplier.active)
    : undefined;
  const createOrderSupplierItem = createOrderSupplier
    ? supplierItems.find((item) => item.supplierId === createOrderSupplier.id && item.materialId === createOrderMaterial?.id)
    : undefined;
  const initialOrderedOn = todayISO();
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const materialById = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const [sheetOpen, setSheetOpen] = useState(() => Boolean(createOrderRequest));
  const [prefillWarning, setPrefillWarning] = useState<string | null>(() => prefillWarningFor(createOrderMaterial, createOrderSupplier, createOrderSupplierItem));
  const [selectedSupplierId, setSelectedSupplierId] = useState(createOrderSupplier?.id ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(createOrderMaterial?.id ?? "");
  const [quantity, setQuantity] = useState(createOrderMaterial && Number.isFinite(createOrderMaterial.reorderQuantity) && createOrderMaterial.reorderQuantity! > 0 ? String(createOrderMaterial.reorderQuantity) : "");
  const [orderedOn, setOrderedOn] = useState(initialOrderedOn);
  const [expectedOn, setExpectedOn] = useState(expectedDeliveryDate(initialOrderedOn, createOrderSupplierItem?.leadTimeDays));
  const [expectedOnManuallyAdjusted, setExpectedOnManuallyAdjusted] = useState(false);
  const [autoExpectedLeadTimeDays, setAutoExpectedLeadTimeDays] = useState<number | undefined>(createOrderSupplierItem?.leadTimeDays);
  const [orderReference, setOrderReference] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receivingSaving, setReceivingSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InventorySupplierOrder | null>(null);
  const [plannedTarget, setPlannedTarget] = useState<InventorySupplierOrder | null>(null);

  const supplierLinks = useMemo(() => supplierItems.filter((item) => item.supplierId === selectedSupplierId && materialById.has(item.materialId)), [materialById, selectedSupplierId, supplierItems]);
  const selectedLink = supplierLinks.find((item) => item.materialId === selectedMaterialId);
  const activeOrders = orders.filter(isOpenOrder);
  const orderSuppliers = editingOrderId ? suppliers : activeSuppliers;
  const receivingOrder = receivingOrderId ? orders.find((order) => order.id === receivingOrderId) ?? null : null;
  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null;

  useEffect(() => {
    if (!createOrderRequest || hasHandledCreateOrderRequest.current) return;
    hasHandledCreateOrderRequest.current = true;
    if (createOrderMaterial && !createOrderSupplier) {
      toast.warning(createOrderMaterial.preferredSupplierId
        ? "This material’s preferred supplier is inactive. Choose an active supplier to finish the order."
        : "No preferred supplier is set for this material. Choose a supplier to finish the order.");
    } else if (createOrderMaterial && !createOrderSupplierItem) {
      toast.warning("This material is not linked to its preferred supplier. Choose a supplier with this material linked.");
    }
  }, [createOrderMaterial, createOrderRequest, createOrderSupplier, createOrderSupplierItem]);

  useEffect(() => {
    if (!receiveRequest || handledReceiveRequestId.current === receiveRequest.requestId) return;
    const order = orders.find((candidate) => candidate.id === receiveRequest.orderId);
    if (!order) return;
    handledReceiveRequestId.current = receiveRequest.requestId;
    if (!isOpenOrder(order)) {
      toast.warning("That order is no longer open for receiving.");
      return;
    }
    // Deferred so the panel opens after this effect has committed.
    void Promise.resolve().then(() => {
      setSelectedOrderId(order.id);
      openReceiving(order);
    });
  }, [orders, receiveRequest]);

  const materialFilterOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const order of orders) for (const line of order.lines) names.set(line.materialId, line.materialName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (supplierFilter !== "all" && order.supplierId !== supplierFilter) return false;
    if (materialFilter !== "all" && !order.lines.some((line) => line.materialId === materialFilter)) return false;
    if (statusFilter === "open" && !isOpenOrder(order)) return false;
    if (statusFilter !== "all" && statusFilter !== "open" && order.status !== statusFilter) return false;
    if (dateFrom && order.orderedOn < dateFrom) return false;
    if (dateTo && order.orderedOn > dateTo) return false;
    return true;
  }), [dateFrom, dateTo, materialFilter, orders, statusFilter, supplierFilter]);

  // On desk the detail always has an order to show. Phone and tablet show it only once one is picked.
  const detailOrder = selectedOrder ?? filteredOrders[0] ?? null;
  const filtersActive = supplierFilter !== "all" || materialFilter !== "all" || statusFilter !== "open" || Boolean(dateFrom) || Boolean(dateTo);

  function selectOrder(orderId: string) {
    if (receivingOrderId && receivingOrderId !== orderId) closeReceiving();
    setSelectedOrderId(orderId);
  }

  function clearFilters() {
    setSupplierFilter("all");
    setMaterialFilter("all");
    setStatusFilter("open");
    setDateFrom("");
    setDateTo("");
  }

  function addLine() {
    const material = materialById.get(selectedMaterialId);
    const lineQuantity = Number(quantity);
    if (!selectedLink || !material) {
      toast.error("Choose a material from this supplier first.");
      return;
    }
    if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) {
      toast.error("Enter an order quantity greater than zero.");
      return;
    }
    if (draftLines.some((line) => line.materialId === material.id)) {
      toast.error("That material is already in this order.");
      return;
    }
    const lineId = `${material.id}-${crypto.randomUUID()}`;
    setDraftLines((current) => [...current, {
      draftId: lineId,
      id: lineId,
      materialId: material.id,
      materialName: material.name,
      unit: material.baseUnit,
      quantity: lineQuantity,
      receivedQuantity: 0,
      unitCost: selectedLink.costPerUnit,
      currency: selectedLink.currency,
    }]);
    setSelectedMaterialId("");
    setQuantity("");
  }

  function chooseSupplier(value: string) {
    const nextLink = supplierItems.find((item) => item.supplierId === value && item.materialId === selectedMaterialId);
    setSelectedSupplierId(value);
    setPrefillWarning(null);
    if (selectedMaterialId && nextLink) {
      setAutoExpectedLeadTimeDays(nextLink.leadTimeDays);
      if (!expectedOnManuallyAdjusted) setExpectedOn(expectedDeliveryDate(orderedOn, nextLink.leadTimeDays));
    } else {
      setSelectedMaterialId("");
      setQuantity("");
      setExpectedOn("");
      setExpectedOnManuallyAdjusted(false);
      setAutoExpectedLeadTimeDays(undefined);
    }
    setDraftLines([]);
  }

  function chooseMaterial(value: string) {
    const material = materialById.get(value);
    const link = supplierLinks.find((item) => item.materialId === value);
    setSelectedMaterialId(value);
    setQuantity(material && Number.isFinite(material.reorderQuantity) && material.reorderQuantity! > 0 ? String(material.reorderQuantity) : "");
    setAutoExpectedLeadTimeDays(link?.leadTimeDays);
    setExpectedOn(expectedDeliveryDate(orderedOn, link?.leadTimeDays));
    setExpectedOnManuallyAdjusted(false);
  }

  function changeOrderedOn(nextDate: string) {
    setOrderedOn(nextDate);
    if (!expectedOnManuallyAdjusted) setExpectedOn(expectedDeliveryDate(nextDate, autoExpectedLeadTimeDays));
  }

  function editOrder(order: InventorySupplierOrder) {
    setEditingOrderId(order.id);
    setSelectedSupplierId(order.supplierId);
    setSelectedMaterialId("");
    setQuantity("");
    setOrderReference(order.orderReference);
    setOrderedOn(order.orderedOn);
    setExpectedOn(order.expectedOn ?? "");
    setExpectedOnManuallyAdjusted(Boolean(order.expectedOn));
    setAutoExpectedLeadTimeDays(undefined);
    setNotes(order.notes ?? "");
    setDraftLines(order.lines.map((line) => ({ ...line, draftId: line.id })));
    setSheetOpen(true);
  }

  function openNewOrder() {
    if (editingOrderId) resetForm();
    setSheetOpen(true);
  }

  // A scheduled delivery is a pending order. Confirming records everything outstanding as received.
  async function receiveAsPlanned(order: InventorySupplierOrder) {
    const lines = order.lines
      .map((line) => ({ lineId: line.id, quantity: Math.max(0, line.quantity - line.receivedQuantity), line }))
      .filter((entry) => entry.quantity > 0);
    if (lines.length === 0) return;
    setReceivingSaving(true);
    try {
      await receiveInventorySupplierOrder({
        orderId: order.id,
        receiptId: `receipt-${order.id}-${crypto.randomUUID()}`,
        receivedOn: todayISO(),
        lines: lines.map(({ lineId, quantity }) => ({ lineId, quantity })),
      });
      toast.success("Delivery recorded and stock updated");
      await onChanged();
    } catch (error) {
      console.error("Failed to record the scheduled delivery", error);
      toast.error(error instanceof Error ? error.message : "Could not record the delivery");
    } finally {
      setReceivingSaving(false);
    }
  }

  function plannedStockUp(order: InventorySupplierOrder): string {
    return order.lines
      .map((line) => ({ line, quantity: Math.max(0, line.quantity - line.receivedQuantity) }))
      .filter((entry) => entry.quantity > 0)
      .map((entry) => `${entry.line.materialName} ${entry.quantity} ${entry.line.unit}`)
      .join(", ");
  }

  async function cancelOrder(order: InventorySupplierOrder) {
    setSaving(true);
    try {
      await cancelInventorySupplierOrder(order.id);
      toast.success("Supplier order cancelled");
      if (editingOrderId === order.id) resetForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to cancel supplier order", error);
      toast.error(error instanceof Error ? error.message : "Failed to cancel supplier order");
    } finally {
      setSaving(false);
    }
  }

  function removeLine(draftId: string) {
    setDraftLines((current) => current.filter((line) => line.draftId !== draftId));
  }

  function resetForm() {
    setSelectedSupplierId("");
    setSelectedMaterialId("");
    setQuantity("");
    setOrderedOn(todayISO());
    setExpectedOn("");
    setExpectedOnManuallyAdjusted(false);
    setAutoExpectedLeadTimeDays(undefined);
    setOrderReference("");
    setNotes("");
    setDraftLines([]);
    setEditingOrderId(null);
    setPrefillWarning(null);
  }

  function stopEditing() {
    resetForm();
    setSheetOpen(false);
  }

  function openReceiving(order: InventorySupplierOrder) {
    setReceivingOrderId(order.id);
    setReceiptId(`receipt-${order.id}-${crypto.randomUUID()}`);
    setReceivedOn(todayISO());
    setReceiveQuantities(Object.fromEntries(order.lines.map((line) => [line.id, ""])));
  }

  function closeReceiving() {
    setReceivingOrderId(null);
    setReceiptId("");
    setReceiveQuantities({});
  }

  async function saveReceipt() {
    if (!receivingOrder) return;
    const lines = receivingOrder.lines
      .map((line) => ({ lineId: line.id, quantity: Number(receiveQuantities[line.id]) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (lines.length === 0) {
      toast.error("Enter a positive quantity for at least one line.");
      return;
    }
    setReceivingSaving(true);
    try {
      const result = await receiveInventorySupplierOrder({
        orderId: receivingOrder.id,
        receiptId,
        receivedOn,
        lines,
      });
      toast.success(result.status === "received" ? "Supplier order received and stock updated" : "Partial receipt recorded and stock updated");
      closeReceiving();
      await onChanged();
    } catch (error) {
      console.error("Failed to receive supplier order", error);
      toast.error(error instanceof Error ? error.message : "Failed to receive supplier order");
    } finally {
      setReceivingSaving(false);
    }
  }

  async function saveOrder() {
    const supplier = supplierById.get(selectedSupplierId);
    if (!supplier) {
      toast.error("Choose a supplier first.");
      return;
    }
    if (draftLines.length === 0) {
      toast.error("Add at least one material to the order.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderedOn) || (expectedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expectedOn) || expectedOn < orderedOn))) {
      toast.error("Choose valid order and expected delivery dates.");
      return;
    }

    setSaving(true);
    try {
      const totalCost = draftLines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
      const reference = orderReference.trim() || `PO-${todayISO()}-${String(Date.now()).slice(-5)}`;
      const lines = draftLines.map((line) => ({
        id: line.id,
        materialId: line.materialId,
        materialName: line.materialName,
        unit: line.unit,
        quantity: line.quantity,
        receivedQuantity: line.receivedQuantity,
        unitCost: line.unitCost,
        currency: line.currency,
      }));
      const orderInput = {
        supplierId: supplier.id,
        supplierName: supplier.name,
        orderReference: reference,
        orderedOn,
        expectedOn: expectedOn || undefined,
        notes: notes.trim() || undefined,
        lines,
      };
      if (editingOrderId) {
        await updateInventorySupplierOrder(editingOrderId, orderInput);
        toast.success("Supplier order updated");
      } else {
        await upsertInventorySupplierOrder({ ...orderInput, status: "ordered", totalCost });
        toast.success("Supplier order created");
      }
      resetForm();
      setSheetOpen(false);
      await onChanged();
    } catch (error) {
      console.error("Failed to create supplier order", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier order");
    } finally {
      setSaving(false);
    }
  }

  const draftTotal = draftLines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
  const draftCurrency = draftLines[0]?.currency ?? selectedLink?.currency ?? "";
  const saveBlocker = !selectedSupplierId
    ? "Choose a supplier first."
    : draftLines.length === 0
      ? "Add at least one material to the order."
      : "";

  const draftColumns: Column<DraftLine>[] = [
    {
      key: "material",
      label: "Material",
      cell: (line) => <><span className="font-medium">{line.materialName}</span><span className="ml-1.5 text-small text-ink-muted">{line.unit}</span></>,
      phone: "title",
    },
    {
      key: "quantity",
      label: "Quantity",
      align: "right",
      cell: (line) => <><span className="tablet:hidden">Qty </span>{formatAmount(line.quantity)} {line.unit}</>,
      phone: "meta",
    },
    {
      key: "unitCost",
      label: "Unit cost",
      align: "right",
      cell: (line) => <>{line.currency} {formatAmount(line.unitCost)}</>,
      phone: "meta",
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      cell: (line) => <>{line.currency} {formatAmount(line.quantity * line.unitCost)}</>,
      phone: "figure",
    },
  ];

  // The lines of one order, for the detail. Received quantities and cost snapshots come from the order itself.
  const orderLineColumns: Column<InventorySupplierOrderLine>[] = [
    {
      key: "material",
      label: "Material",
      cell: (line) => <><span className="font-medium">{line.materialName}</span><span className="ml-1.5 text-small text-ink-muted">{line.unit}</span></>,
      phone: "title",
    },
    {
      key: "ordered",
      label: "Ordered",
      align: "right",
      cell: (line) => <><span className="tablet:hidden">Ordered </span>{formatAmount(line.quantity)} {line.unit}</>,
      phone: "meta",
    },
    {
      key: "received",
      label: "Received",
      align: "right",
      cell: (line) => <><span className="tablet:hidden">Received </span>{formatAmount(line.receivedQuantity)} {line.unit}</>,
      phone: "meta",
    },
    {
      key: "unitCost",
      label: "Unit cost",
      align: "right",
      cell: (line) => <>{line.currency} {formatAmount(line.unitCost)}</>,
      phone: "detail",
    },
    {
      key: "total",
      label: "Line total",
      align: "right",
      cell: (line) => <>{line.currency} {formatAmount(line.quantity * line.unitCost)}</>,
      phone: "figure",
    },
  ];

  // Each line reads "Material × qty unit", with the received quantity once something has arrived.
  const detailItems = (order: InventorySupplierOrder) => order.lines
    .map((line) => `${line.materialName} × ${formatAmount(line.quantity)} ${line.unit}${line.receivedQuantity > 0 ? ` (received ${formatAmount(line.receivedQuantity)})` : ""}`)
    .join(" · ");

  function renderDetail(order: InventorySupplierOrder) {
    const status = statusFor(order);
    const open = isOpenOrder(order);
    const currency = order.lines[0]?.currency ?? "";
    const expectedText = order.expectedOn ? `Expected ${formatDisplay(order.expectedOn)}` : "No expected date";
    const receiving = receivingOrder?.id === order.id && open ? receivingOrder : null;
    return (
      <Card className="gap-0 py-0 shadow-card">
        <div className="px-4 pt-4 tablet:px-6 tablet:pt-6">
          <Button type="button" variant="ghost" size="sm" className="-ml-3 desk:hidden" onClick={() => setSelectedOrderId(null)}>
            ← All orders
          </Button>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-title-2 text-ink">{order.orderReference}</h2>
            <StatusChip tone={status.tone} header>{status.label}</StatusChip>
          </div>
          <p className="mt-1 text-table text-ink-muted">
            {order.supplierName} · Ordered {formatDisplay(order.orderedOn)} · {expectedText}
            {order.receivedOn ? ` · Received ${formatDisplay(order.receivedOn)}` : ""}
          </p>
          {order.source === "schedule" && <p className="mt-1 text-small text-ink-muted">Scheduled delivery · waiting to be confirmed</p>}
          {order.notes && <p className="mt-1 text-small text-ink-muted">Notes: {order.notes}</p>}
          {open && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <OrderSendButtons order={order} supplier={supplierById.get(order.supplierId)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => editOrder(order)} disabled={saving}>Edit</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => openReceiving(order)} disabled={saving}>Receive</Button>
              {order.source === "schedule" && (
                <Button type="button" variant="secondary" size="sm" onClick={() => { if (plannedStockUp(order)) setPlannedTarget(order); }} disabled={saving || receivingSaving}>Arrived as planned</Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${order.orderReference}`}>
                    <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem variant="destructive" onSelect={() => setCancelTarget(order)}>Cancel order</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-line">
          <DataTable
            caption={`Lines for ${order.orderReference}`}
            columns={orderLineColumns}
            rows={order.lines}
            getKey={(line) => line.id}
            density="compact"
          />
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-body font-semibold text-ink tablet:px-6">
            <span>Total cost · {currency}</span>
            <span className="tabular-nums">{currency} {formatAmount(order.totalCost)}</span>
          </div>
        </div>

        {receiving && (
          <div className="mx-4 mb-4 space-y-4 rounded-xl border border-line bg-canvas p-4 tablet:mx-6 tablet:p-5">
            <div>
              <h3 className="font-display text-title-3 text-ink">Receive</h3>
              <p className="mt-1 text-small text-ink-muted">Enter only the quantities that arrived in this receipt. Stock goes up when you record it.</p>
            </div>
            <FieldRow label="Received date">
              {(id) => <Input id={id} type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} className="max-w-52" />}
            </FieldRow>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {receiving.lines.map((line) => {
                const remaining = line.quantity - line.receivedQuantity;
                const done = remaining <= 0;
                return (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{line.materialName}</p>
                      <p className="text-small text-ink-muted">
                        {done ? "Fully received" : `Remaining ${formatAmount(remaining)} ${line.unit}`}
                      </p>
                    </div>
                    <div className="w-full tablet:w-48">
                      <MaterialQuantityInput
                        label={`Received quantity for ${line.materialName}`}
                        value={receiveQuantities[line.id] ?? ""}
                        unit={line.unit}
                        disabled={done}
                        onChange={(value) => setReceiveQuantities((current) => ({ ...current, [line.id]: value }))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeReceiving} disabled={receivingSaving}>Cancel</Button>
              <Button type="button" onClick={() => void saveReceipt()} loading={receivingSaving}>
                {receivingSaving ? "Saving…" : "Record receipt"}
              </Button>
            </div>
          </div>
        )}

        {order.history && order.history.length > 0 && (
          <div className="px-4 pt-5 pb-5 tablet:px-6">
            <h3 className="font-display text-title-3 text-ink">
              Activity <span className="font-normal text-ink-muted">· {order.history.length}</span>
            </h3>
            <ol className="mt-2 divide-y divide-line text-table">
              {[...order.history].reverse().map((event, index) => (
                <li key={`${event.occurredAt}-${index}`} className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 py-2">
                  <span className="text-ink-muted">{new Date(event.occurredAt).toLocaleString("id-ID")}</span>
                  <span className="text-ink">{event.summary}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title-2 text-ink">Supplier orders</h2>
          <p className="mt-1 text-small text-ink-muted">Open orders are listed first. Use the filters to see received or cancelled orders.</p>
        </div>
        <Button type="button" variant="secondary" onClick={openNewOrder}>
          <Plus />New order
        </Button>
      </div>

      {orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-2 desk:grid-cols-5">
          <div className="col-span-2 tablet:col-span-1">
          <FieldRow label="Supplier">
            {(id) => (
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          </div>
          <div className="col-span-2 tablet:col-span-1">
          <FieldRow label="Material">
            {(id) => (
              <Select value={materialFilter} onValueChange={setMaterialFilter}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All materials</SelectItem>
                  {materialFilterOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          </div>
          <div className="col-span-2 tablet:col-span-1">
          <FieldRow label="Status">
            {(id) => (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </FieldRow>
          </div>
          <FieldRow label="Ordered from">
            {(id) => <Input id={id} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />}
          </FieldRow>
          <FieldRow label="Ordered through">
            {(id) => <Input id={id} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />}
          </FieldRow>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState title="No supplier orders yet.">Create an order for a material from To order, or with New order. It appears here.</EmptyState>
      ) : (
        <div className="grid gap-5 desk:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] desk:items-start">
          <div className={cn("min-w-0", selectedOrder && "hidden desk:block")}>
            <Card className="gap-0 py-0 shadow-card">
              {filteredOrders.length === 0 ? (
                <EmptyState
                  title="No orders match these filters."
                  action={filtersActive ? <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
                >
                  Clear the filters to see every order.
                </EmptyState>
              ) : (
                <ul aria-label="Supplier orders" className="divide-y divide-line">
                  {filteredOrders.map((order) => {
                    const status = statusFor(order);
                    const selected = detailOrder?.id === order.id;
                    return (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() => selectOrder(order.id)}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "block w-full px-4 py-3.5 text-left tablet:px-5 [@media(pointer:coarse)]:min-h-11",
                            selected ? "bg-brand-soft" : "hover:bg-canvas",
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-medium text-ink">{order.orderReference}</span>
                            <StatusChip tone={status.tone}>{status.label}</StatusChip>
                          </span>
                          <span className="mt-0.5 block text-table text-ink">{order.supplierName}</span>
                          <span className="mt-0.5 block truncate text-small text-ink-muted">{detailItems(order)}</span>
                          <span className="block text-small text-ink-muted">
                            {order.expectedOn ? `Expected ${formatDisplay(order.expectedOn)}` : "No expected date"}
                            {order.source === "schedule" ? " · Scheduled delivery" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className={cn("min-w-0", !selectedOrder && "hidden desk:block")}>
            {detailOrder ? renderDetail(detailOrder) : null}
          </div>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingOrderId ? "Edit supplier order" : "Create supplier order"}</SheetTitle>
            <SheetDescription>{activeOrders.length} active order{activeOrders.length === 1 ? "" : "s"} on the way. Stock changes only when receipt quantities are recorded.</SheetDescription>
          </SheetHeader>

          {orderSuppliers.length === 0 ? (
            <EmptyState title="No active supplier.">Add an active supplier before creating an order.</EmptyState>
          ) : (
            <>
              {!editingOrderId && (
                <Banner tone="info">Create one order for multiple materials from the same supplier. Orders begin as “Ordered / On the Way”.</Banner>
              )}
              {prefillWarning && <Banner tone="warn">{prefillWarning}</Banner>}
              {editingOrderId && (
                <p className="text-small text-ink-muted">Received quantities and their cost snapshots stay fixed; you can edit the remaining order.</p>
              )}

              <div className="grid gap-4 tablet:grid-cols-2">
                <FieldRow label="Supplier">
                  {(id) => (
                    <Select value={selectedSupplierId} onValueChange={chooseSupplier}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                      <SelectContent>
                        {orderSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}{supplier.active ? "" : " · Archived"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="Order reference" hint="Optional. Generated when left blank.">
                  {(id) => <Input id={id} value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="Optional" />}
                </FieldRow>
                <FieldRow label="Order date">
                  {(id) => <Input id={id} type="date" value={orderedOn} onChange={(event) => changeOrderedOn(event.target.value)} />}
                </FieldRow>
                <FieldRow label="Expected delivery" hint="Filled from the supplier's lead time unless you change it.">
                  {(id) => (
                    <Input id={id} type="date" value={expectedOn} onChange={(event) => { setExpectedOn(event.target.value); setExpectedOnManuallyAdjusted(true); }} />
                  )}
                </FieldRow>
                <div className="tablet:col-span-2">
                  <FieldRow label="Notes">
                    {(id) => <Input id={id} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />}
                  </FieldRow>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-line bg-canvas p-4 tablet:grid-cols-[1fr_200px_auto] tablet:items-end">
                <FieldRow label="Material">
                  {(id) => (
                    <Select value={selectedMaterialId} onValueChange={chooseMaterial} disabled={!selectedSupplierId}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={selectedSupplierId ? "Choose linked material" : "Choose supplier first"} /></SelectTrigger>
                      <SelectContent>
                        {selectedMaterialId && !supplierLinks.some((link) => link.materialId === selectedMaterialId) && <SelectItem value={selectedMaterialId} disabled>{materialById.get(selectedMaterialId)?.name ?? "Selected material"} · not linked to this supplier</SelectItem>}
                        {supplierLinks.map((link) => <SelectItem key={link.materialId} value={link.materialId}>{link.materialName} · {link.unit} · {link.currency} {formatAmount(link.costPerUnit)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label={`Quantity${selectedLink ? ` (${selectedLink.unit})` : ""}`}>
                  {(id) => (
                    <MaterialQuantityInput id={id} label="Quantity" value={quantity} unit={selectedLink?.unit ?? ""} onChange={setQuantity} />
                  )}
                </FieldRow>
                <Button type="button" variant="secondary" onClick={addLine} disabled={!selectedSupplierId || !selectedMaterialId}>
                  <Plus />Add line
                </Button>
              </div>

              {draftLines.length > 0 && (
                <div className="space-y-0 overflow-hidden rounded-xl border border-line">
                  <DataTable
                    caption="Order lines"
                    columns={draftColumns}
                    rows={draftLines}
                    getKey={(line) => line.draftId}
                    density="compact"
                    rowActions={(line) => (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.materialName}`} onClick={() => removeLine(line.draftId)}>
                        <Trash2 strokeWidth={1.5} aria-hidden="true" />
                      </Button>
                    )}
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 font-semibold text-ink tablet:px-6">
                    <span>Total · {draftCurrency}</span>
                    <span className="tabular-nums">{draftCurrency} {formatAmount(draftTotal)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          <SheetFooter>
            <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{orderSuppliers.length === 0 ? "" : saveBlocker}</p>
            {editingOrderId && <Button type="button" variant="secondary" onClick={stopEditing} disabled={saving}>Stop editing</Button>}
            {orderSuppliers.length > 0 && (
              <Button type="button" loading={saving} disabled={saving || draftLines.length === 0} onClick={() => void saveOrder()}>
                {saving ? "Saving…" : editingOrderId ? "Save changes" : "Create order"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title={cancelTarget ? `Cancel ${cancelTarget.orderReference}?` : ""}
        description="Any quantities already received will remain in stock."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        destructive
        onConfirm={() => { if (cancelTarget) void cancelOrder(cancelTarget); }}
      />
      <ConfirmDialog
        open={Boolean(plannedTarget)}
        onOpenChange={(open) => { if (!open) setPlannedTarget(null); }}
        title={plannedTarget ? `${plannedTarget.orderReference} arrived as planned?` : ""}
        description={plannedTarget ? `Stock goes up by: ${plannedStockUp(plannedTarget)}.` : ""}
        confirmLabel="Record delivery"
        cancelLabel="Cancel"
        onConfirm={() => { if (plannedTarget) void receiveAsPlanned(plannedTarget); }}
      />
    </section>
  );
}
