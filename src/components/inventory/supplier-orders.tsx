"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayISO, formatDisplay } from "@/lib/dates";
import { cancelInventorySupplierOrder, receiveInventorySupplierOrder, updateInventorySupplierOrder, upsertInventorySupplierOrder } from "@/lib/data";
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
  onChanged: () => Promise<void>;
};

type DraftLine = InventorySupplierOrderLine & { draftId: string };

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

function orderStatusLabel(status: InventorySupplierOrder["status"]): string {
  if (status === "ordered") return "Ordered / On the Way";
  if (status === "partially_received") return "Partially Received";
  if (status === "received") return "Received";
  return "Cancelled";
}

function orderStatusVariant(status: InventorySupplierOrder["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ordered") return "secondary";
  if (status === "partially_received") return "default";
  if (status === "received") return "outline";
  return "destructive";
}

export function SupplierOrders({ materials, suppliers, supplierItems, orders, onChanged }: SupplierOrdersProps) {
  const orderFormRef = useRef<HTMLDivElement>(null);
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const materialById = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderedOn, setOrderedOn] = useState(todayISO());
  const [expectedOn, setExpectedOn] = useState("");
  const [expectedOnManuallyAdjusted, setExpectedOnManuallyAdjusted] = useState(false);
  const [autoExpectedLeadTimeDays, setAutoExpectedLeadTimeDays] = useState<number | undefined>();
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
  const [receivingOrder, setReceivingOrder] = useState<InventorySupplierOrder | null>(null);
  const [receiptId, setReceiptId] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayISO());
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receivingSaving, setReceivingSaving] = useState(false);

  const supplierLinks = useMemo(() => supplierItems.filter((item) => item.supplierId === selectedSupplierId && materialById.has(item.materialId)), [materialById, selectedSupplierId, supplierItems]);
  const selectedLink = supplierLinks.find((item) => item.materialId === selectedMaterialId);
  const activeOrders = orders.filter((order) => order.status === "ordered" || order.status === "partially_received");
  const orderSuppliers = editingOrderId ? suppliers : activeSuppliers;
  const materialFilterOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const order of orders) for (const line of order.lines) names.set(line.materialId, line.materialName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (supplierFilter !== "all" && order.supplierId !== supplierFilter) return false;
    if (materialFilter !== "all" && !order.lines.some((line) => line.materialId === materialFilter)) return false;
    if (statusFilter === "open" && order.status !== "ordered" && order.status !== "partially_received") return false;
    if (statusFilter !== "all" && statusFilter !== "open" && order.status !== statusFilter) return false;
    if (dateFrom && order.orderedOn < dateFrom) return false;
    if (dateTo && order.orderedOn > dateTo) return false;
    return true;
  }), [dateFrom, dateTo, materialFilter, orders, statusFilter, supplierFilter]);

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
    orderFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function cancelOrder(order: InventorySupplierOrder) {
    if (!window.confirm(`Cancel ${order.orderReference}? Any quantities already received will remain in stock.`)) return;
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
  }

  function openReceiving(order: InventorySupplierOrder) {
    setReceivingOrder(order);
    setReceiptId(`receipt-${order.id}-${crypto.randomUUID()}`);
    setReceivedOn(todayISO());
    setReceiveQuantities(Object.fromEntries(order.lines.map((line) => [line.id, ""])));
  }

  function closeReceiving() {
    setReceivingOrder(null);
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
      await onChanged();
    } catch (error) {
      console.error("Failed to create supplier order", error);
      toast.error(error instanceof Error ? error.message : "Failed to save supplier order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Supplier orders</CardTitle><CardDescription>Open orders are shown first. Use the filters to view received or cancelled orders.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {orders.length > 0 && <div className="grid gap-3 rounded-xl border bg-surface/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5"><Label htmlFor="order-filter-supplier">Supplier</Label><Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger id="order-filter-supplier" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="order-filter-material">Material</Label><Select value={materialFilter} onValueChange={setMaterialFilter}><SelectTrigger id="order-filter-material" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All materials</SelectItem>{materialFilterOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="order-filter-status">Status</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="order-filter-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open / On the Way</SelectItem><SelectItem value="all">All statuses</SelectItem><SelectItem value="ordered">Ordered / On the Way</SelectItem><SelectItem value="partially_received">Partially Received</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="order-filter-from">Ordered from</Label><Input id="order-filter-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="order-filter-to">Ordered through</Label><Input id="order-filter-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
          </div>}
          {orders.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No supplier orders yet.</p> : filteredOrders.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No orders match these filters.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Supplier</TableHead><TableHead>Items</TableHead><TableHead>Dates</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredOrders.map((order) => { const currency = order.lines[0]?.currency ?? ""; const canReceive = order.status === "ordered" || order.status === "partially_received"; const canEdit = canReceive; const canCancel = canReceive; return <TableRow key={order.id}><TableCell className="font-medium">{order.orderReference}<span className="block text-xs text-muted-foreground">Ordered {formatDisplay(order.orderedOn)}</span>{order.history && order.history.length > 0 && <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">Activity ({order.history.length})</summary><div className="mt-1 space-y-1">{[...order.history].reverse().map((event, index) => <p key={`${event.occurredAt}-${index}`} className="text-muted-foreground">{new Date(event.occurredAt).toLocaleString("id-ID")} · {event.summary}</p>)}</div></details>}</TableCell><TableCell>{order.supplierName}</TableCell><TableCell className="max-w-64 text-sm text-muted-foreground">{order.lines.map((line) => `${line.materialName} × ${line.quantity} ${line.unit} (received ${line.receivedQuantity})`).join(" · ")}</TableCell><TableCell className="text-sm text-muted-foreground">{order.expectedOn ? `Expected ${formatDisplay(order.expectedOn)}` : "No expected date"}{order.receivedOn && <span className="block">Received {formatDisplay(order.receivedOn)}</span>}</TableCell><TableCell className="tabular-nums">{currency} {order.totalCost.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell><Badge variant={orderStatusVariant(order.status)}>{orderStatusLabel(order.status)}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canEdit && <Button size="sm" variant="outline" onClick={() => editOrder(order)} disabled={saving}><Pencil className="size-3.5" />Edit</Button>}{canReceive && <Button size="sm" onClick={() => openReceiving(order)} disabled={saving}>Receive</Button>}{canCancel && <Button size="sm" variant="destructive" onClick={() => void cancelOrder(order)} disabled={saving}><Ban className="size-3.5" />Cancel</Button>}</div></TableCell></TableRow>; })}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" />
          <div><p className="font-medium">Supplier orders</p><p className="mt-1 text-sm text-muted-foreground">Create one order for multiple materials from the same supplier. Orders begin as “Ordered / On the Way”; inventory will change only when receiving is added.</p></div>
        </CardContent>
      </Card>

      <div id="create-supplier-order" ref={orderFormRef} className="scroll-mt-24">
        <Card>
          <CardHeader><CardTitle>{editingOrderId ? "Edit supplier order" : "Create supplier order"}</CardTitle><CardDescription>{activeOrders.length} active order{activeOrders.length === 1 ? "" : "s"} currently on the way. Stock changes only when receipt quantities are recorded.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {orderSuppliers.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add an active supplier before creating an order.</p> : <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5"><Label htmlFor="order-supplier">Supplier</Label><Select value={selectedSupplierId} onValueChange={(value) => { setSelectedSupplierId(value); setSelectedMaterialId(""); setQuantity(""); setExpectedOn(""); setExpectedOnManuallyAdjusted(false); setAutoExpectedLeadTimeDays(undefined); setDraftLines([]); }}><SelectTrigger id="order-supplier" className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{orderSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}{supplier.active ? "" : " · Archived"}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="order-reference">Order reference</Label><Input id="order-reference" value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label htmlFor="order-date">Order date</Label><Input id="order-date" type="date" value={orderedOn} onChange={(event) => { const nextDate = event.target.value; setOrderedOn(nextDate); if (!expectedOnManuallyAdjusted) setExpectedOn(expectedDeliveryDate(nextDate, autoExpectedLeadTimeDays)); }} /></div>
                <div className="space-y-1.5"><Label htmlFor="order-expected">Expected delivery</Label><Input id="order-expected" type="date" value={expectedOn} onChange={(event) => { setExpectedOn(event.target.value); setExpectedOnManuallyAdjusted(true); }} /></div>
                <div className="space-y-1.5"><Label htmlFor="order-notes">Notes</Label><Input id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></div>
              </div>

              <div className="grid gap-3 rounded-xl border bg-surface/60 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <div className="space-y-1.5"><Label htmlFor="order-material">Material</Label><Select value={selectedMaterialId} onValueChange={(value) => { const material = materialById.get(value); const link = supplierLinks.find((item) => item.materialId === value); setSelectedMaterialId(value); setQuantity(material && Number.isFinite(material.reorderQuantity) && material.reorderQuantity! > 0 ? String(material.reorderQuantity) : ""); setAutoExpectedLeadTimeDays(link?.leadTimeDays); setExpectedOn(expectedDeliveryDate(orderedOn, link?.leadTimeDays)); setExpectedOnManuallyAdjusted(false); }} disabled={!selectedSupplierId}><SelectTrigger id="order-material" className="w-full"><SelectValue placeholder={selectedSupplierId ? "Choose linked material" : "Choose supplier first"} /></SelectTrigger><SelectContent>{supplierLinks.map((link) => <SelectItem key={link.materialId} value={link.materialId}>{link.materialName} · {link.unit} · {link.currency} {link.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="order-quantity">Quantity{selectedLink ? ` (${selectedLink.unit})` : ""}</Label><Input id="order-quantity" type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" /></div>
                <Button onClick={addLine} disabled={!selectedSupplierId || !selectedMaterialId}><Plus className="size-4" />Add line</Button>
              </div>

              {draftLines.length > 0 && <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Quantity</TableHead><TableHead>Unit cost</TableHead><TableHead>Total</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{draftLines.map((line) => <TableRow key={line.draftId}><TableCell className="font-medium">{line.materialName}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell><TableCell className="tabular-nums">{line.quantity}</TableCell><TableCell className="tabular-nums">{line.currency} {line.unitCost.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell className="tabular-nums">{line.currency} {(line.quantity * line.unitCost).toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell><Button size="icon-sm" variant="ghost" aria-label={`Remove ${line.materialName}`} onClick={() => removeLine(line.draftId)}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{editingOrderId ? "Received quantities and their cost snapshots stay fixed; you can edit the remaining order." : <>A new order will be recorded as <span className="font-medium text-foreground">Ordered / On the Way</span>.</>}</p><div className="flex gap-2">{editingOrderId && <Button variant="outline" onClick={resetForm} disabled={saving}>Stop editing</Button>}<Button onClick={() => void saveOrder()} disabled={saving || draftLines.length === 0}>{saving ? "Saving…" : editingOrderId ? "Save changes" : "Create order"}</Button></div></div>
            </>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(receivingOrder)} onOpenChange={(open) => { if (!open) closeReceiving(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Receive supplier order</DialogTitle><DialogDescription>{receivingOrder?.orderReference} · {receivingOrder?.supplierName}. Enter only the quantities that arrived in this receipt.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="max-w-52 space-y-1.5"><Label htmlFor="receive-date">Received date</Label><Input id="receive-date" type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} /></div>
            <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Remaining</TableHead><TableHead>Received now</TableHead></TableRow></TableHeader><TableBody>{receivingOrder?.lines.map((line) => { const remaining = line.quantity - line.receivedQuantity; return <TableRow key={line.id}><TableCell className="font-medium">{line.materialName}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell><TableCell className="tabular-nums">{remaining}</TableCell><TableCell className="w-40"><Input aria-label={`Received quantity for ${line.materialName}`} type="number" min="0" max={remaining} step="0.01" value={receiveQuantities[line.id] ?? ""} onChange={(event) => setReceiveQuantities((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="0" disabled={remaining <= 0} /></TableCell></TableRow>; })}</TableBody></Table></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closeReceiving} disabled={receivingSaving}>Cancel</Button><Button onClick={() => void saveReceipt()} disabled={receivingSaving}>{receivingSaving ? "Saving…" : "Record receipt"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
