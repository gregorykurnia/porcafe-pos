"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayISO, formatDisplay } from "@/lib/dates";
import { upsertInventorySupplierOrder } from "@/lib/data";
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
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const materialById = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expectedOn, setExpectedOn] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const supplierLinks = useMemo(() => supplierItems.filter((item) => item.supplierId === selectedSupplierId && materialById.has(item.materialId)), [materialById, selectedSupplierId, supplierItems]);
  const selectedLink = supplierLinks.find((item) => item.materialId === selectedMaterialId);
  const activeOrders = orders.filter((order) => order.status === "ordered" || order.status === "partially_received");

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
    setDraftLines((current) => [...current, {
      draftId: `${material.id}-${Date.now()}`,
      id: `${material.id}-${Date.now()}`,
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

  function removeLine(draftId: string) {
    setDraftLines((current) => current.filter((line) => line.draftId !== draftId));
  }

  function resetForm() {
    setSelectedSupplierId("");
    setSelectedMaterialId("");
    setQuantity("");
    setExpectedOn("");
    setOrderReference("");
    setNotes("");
    setDraftLines([]);
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
    if (expectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(expectedOn)) {
      toast.error("Choose a valid expected delivery date.");
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
      await upsertInventorySupplierOrder({
        supplierId: supplier.id,
        supplierName: supplier.name,
        orderReference: reference,
        orderedOn: todayISO(),
        expectedOn: expectedOn || undefined,
        status: "ordered",
        notes: notes.trim() || undefined,
        totalCost,
        lines,
      });
      toast.success("Supplier order created");
      resetForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to create supplier order", error);
      toast.error(error instanceof Error ? error.message : "Failed to create supplier order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" />
          <div><p className="font-medium">Supplier orders</p><p className="mt-1 text-sm text-muted-foreground">Create one order for multiple materials from the same supplier. Orders begin as “Ordered / On the Way”; inventory will change only when receiving is added.</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create supplier order</CardTitle><CardDescription>{activeOrders.length} active order{activeOrders.length === 1 ? "" : "s"} currently on the way.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {activeSuppliers.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add an active supplier before creating an order.</p> : <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="order-supplier">Supplier</Label><Select value={selectedSupplierId} onValueChange={(value) => { setSelectedSupplierId(value); setSelectedMaterialId(""); setDraftLines([]); }}><SelectTrigger id="order-supplier" className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="order-reference">Order reference</Label><Input id="order-reference" value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="Optional" /></div>
              <div className="space-y-1.5"><Label htmlFor="order-expected">Expected delivery</Label><Input id="order-expected" type="date" value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="order-notes">Notes</Label><Input id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></div>
            </div>

            <div className="grid gap-3 rounded-xl border bg-surface/60 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <div className="space-y-1.5"><Label htmlFor="order-material">Material</Label><Select value={selectedMaterialId} onValueChange={setSelectedMaterialId} disabled={!selectedSupplierId}><SelectTrigger id="order-material" className="w-full"><SelectValue placeholder={selectedSupplierId ? "Choose linked material" : "Choose supplier first"} /></SelectTrigger><SelectContent>{supplierLinks.map((link) => <SelectItem key={link.materialId} value={link.materialId}>{link.materialName} · {link.unit} · {link.currency} {link.costPerUnit.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="order-quantity">Quantity{selectedLink ? ` (${selectedLink.unit})` : ""}</Label><Input id="order-quantity" type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" /></div>
              <Button onClick={addLine} disabled={!selectedSupplierId || !selectedMaterialId}><Plus className="size-4" />Add line</Button>
            </div>

            {draftLines.length > 0 && <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Quantity</TableHead><TableHead>Unit cost</TableHead><TableHead>Total</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{draftLines.map((line) => <TableRow key={line.draftId}><TableCell className="font-medium">{line.materialName}<span className="block text-xs text-muted-foreground">{line.unit}</span></TableCell><TableCell className="tabular-nums">{line.quantity}</TableCell><TableCell className="tabular-nums">{line.currency} {line.unitCost.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell className="tabular-nums">{line.currency} {(line.quantity * line.unitCost).toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell><Button size="icon-sm" variant="ghost" aria-label={`Remove ${line.materialName}`} onClick={() => removeLine(line.draftId)}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">A new order will be recorded as <span className="font-medium text-foreground">Ordered / On the Way</span>.</p><Button onClick={() => void saveOrder()} disabled={saving || draftLines.length === 0}>{saving ? "Creating…" : "Create order"}</Button></div>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Order history</CardTitle><CardDescription>Orders remain here after the supplier is archived.</CardDescription></CardHeader>
        <CardContent>{orders.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No supplier orders yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Supplier</TableHead><TableHead>Items</TableHead><TableHead>Dates</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => { const currency = order.lines[0]?.currency ?? ""; return <TableRow key={order.id}><TableCell className="font-medium">{order.orderReference}<span className="block text-xs text-muted-foreground">{formatDisplay(order.orderedOn)}</span></TableCell><TableCell>{order.supplierName}</TableCell><TableCell className="max-w-64 text-sm text-muted-foreground">{order.lines.map((line) => `${line.materialName} × ${line.quantity} ${line.unit}`).join(" · ")}</TableCell><TableCell className="text-sm text-muted-foreground">{order.expectedOn ? `Expected ${formatDisplay(order.expectedOn)}` : "No expected date"}</TableCell><TableCell className="tabular-nums">{currency} {order.totalCost.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell><TableCell><Badge variant={orderStatusVariant(order.status)}>{orderStatusLabel(order.status)}</Badge></TableCell></TableRow>; })}</TableBody></Table></div>}</CardContent>
      </Card>
    </div>
  );
}
