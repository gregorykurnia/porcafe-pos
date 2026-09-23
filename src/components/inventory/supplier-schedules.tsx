"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayISO, formatDisplay } from "@/lib/dates";
import { runDueInventorySupplierDeliverySchedules, upsertInventorySupplierDeliverySchedule } from "@/lib/data";
import type { InventoryMaterial, InventorySupplier, InventorySupplierDeliveryFrequency, InventorySupplierDeliverySchedule, InventorySupplierItem } from "@/lib/types";

type SupplierSchedulesProps = {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  schedules: InventorySupplierDeliverySchedule[];
  onChanged: () => Promise<void>;
};

const FREQUENCIES: Array<{ value: InventorySupplierDeliveryFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom interval" },
];

export function SupplierSchedules({ materials, suppliers, supplierItems, schedules, onChanged }: SupplierSchedulesProps) {
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const materialById = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [frequency, setFrequency] = useState<InventorySupplierDeliveryFrequency>("weekly");
  const [customIntervalDays, setCustomIntervalDays] = useState("");
  const [startOn, setStartOn] = useState(todayISO());
  const [endOn, setEndOn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const linkedMaterials = useMemo(() => supplierItems
    .filter((item) => item.supplierId === supplierId && materialById.has(item.materialId))
    .map((item) => materialById.get(item.materialId))
    .filter((material): material is InventoryMaterial => Boolean(material)), [materialById, supplierId, supplierItems]);

  function resetForm() {
    setSupplierId("");
    setMaterialId("");
    setQuantity("");
    setFrequency("weekly");
    setCustomIntervalDays("");
    setStartOn(todayISO());
    setEndOn("");
    setNotes("");
  }

  async function saveSchedule() {
    const supplier = supplierById.get(supplierId);
    const material = materialById.get(materialId);
    const nextQuantity = Number(quantity);
    const interval = customIntervalDays ? Number(customIntervalDays) : undefined;
    if (!supplier || !material || !supplierItems.some((item) => item.supplierId === supplier.id && item.materialId === material.id)) {
      toast.error("Choose a supplier and one of its linked materials.");
      return;
    }
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      toast.error("Delivery quantity must be greater than zero.");
      return;
    }
    if (frequency === "custom" && (!Number.isInteger(interval) || interval === undefined || interval <= 0)) {
      toast.error("Custom intervals must be a whole number of days greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn) || (endOn && !/^\d{4}-\d{2}-\d{2}$/.test(endOn))) {
      toast.error("Choose valid schedule dates.");
      return;
    }
    if (endOn && endOn < startOn) {
      toast.error("End date cannot be before the start date.");
      return;
    }

    setSaving(true);
    try {
      await upsertInventorySupplierDeliverySchedule({
        supplierId: supplier.id,
        supplierName: supplier.name,
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        quantity: nextQuantity,
        frequency,
        customIntervalDays: frequency === "custom" ? interval : undefined,
        startOn,
        nextRunOn: startOn,
        endOn: endOn || undefined,
        active: true,
        notes: notes.trim() || undefined,
      });
      toast.success("Recurring delivery schedule saved");
      resetForm();
      await onChanged();
    } catch (error) {
      console.error("Failed to save delivery schedule", error);
      toast.error(error instanceof Error ? error.message : "Failed to save delivery schedule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSchedule(schedule: InventorySupplierDeliverySchedule) {
    try {
      await upsertInventorySupplierDeliverySchedule({ ...schedule, id: schedule.id, createdAt: schedule.createdAt, active: !schedule.active });
      toast.success(schedule.active ? "Schedule paused" : "Schedule resumed");
      await onChanged();
    } catch (error) {
      console.error("Failed to toggle delivery schedule", error);
      toast.error(error instanceof Error ? error.message : "Failed to update delivery schedule");
    }
  }

  async function runDueNow() {
    setRunning(true);
    try {
      const result = await runDueInventorySupplierDeliverySchedules(todayISO());
      toast.success(result.schedulesRun > 0 ? `${result.schedulesRun} recurring delivery recorded` : "No recurring deliveries are due");
      await onChanged();
    } catch (error) {
      console.error("Failed to run due deliveries", error);
      toast.error(error instanceof Error ? error.message : "Failed to run due deliveries");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="flex items-start justify-between gap-3 p-4"><div className="flex gap-3"><CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-medium">Recurring supplier deliveries</p><p className="mt-1 text-sm text-muted-foreground">Schedules are checked when Inventory refreshes. Due deliveries add stock and create a receiving movement with a system-generated audit reference.</p></div></div><Button variant="outline" onClick={() => void runDueNow()} disabled={running}><RefreshCw className={`size-4 ${running ? "animate-spin" : ""}`} />{running ? "Checking…" : "Run due now"}</Button></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Set a recurring delivery</CardTitle><CardDescription>Only materials already linked to the selected supplier can be scheduled.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {activeSuppliers.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add an active supplier and supplier-material link first.</p> : <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="schedule-supplier">Supplier</Label><Select value={supplierId} onValueChange={(value) => { setSupplierId(value); setMaterialId(""); }}><SelectTrigger id="schedule-supplier" className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="schedule-material">Material</Label><Select value={materialId} onValueChange={setMaterialId} disabled={!supplierId}><SelectTrigger id="schedule-material" className="w-full"><SelectValue placeholder={supplierId ? "Choose linked material" : "Choose supplier first"} /></SelectTrigger><SelectContent>{linkedMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name} · {material.baseUnit}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="schedule-quantity">Delivery quantity</Label><Input id="schedule-quantity" type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" /></div>
              <div className="space-y-1.5"><Label htmlFor="schedule-frequency">Frequency</Label><Select value={frequency} onValueChange={(value) => setFrequency(value as InventorySupplierDeliveryFrequency)}><SelectTrigger id="schedule-frequency" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FREQUENCIES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
              {frequency === "custom" && <div className="space-y-1.5"><Label htmlFor="schedule-custom-days">Every (days)</Label><Input id="schedule-custom-days" type="number" min="1" step="1" value={customIntervalDays} onChange={(event) => setCustomIntervalDays(event.target.value)} placeholder="e.g. 10" /></div>}
              <div className="space-y-1.5"><Label htmlFor="schedule-start">Start date</Label><Input id="schedule-start" type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="schedule-end">End date</Label><Input id="schedule-end" type="date" value={endOn} onChange={(event) => setEndOn(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="schedule-notes">Notes</Label><Input id="schedule-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></div>
            </div>
            <Button onClick={() => void saveSchedule()} disabled={saving}><Plus className="size-4" />{saving ? "Saving…" : "Save schedule"}</Button>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Delivery schedules</CardTitle><CardDescription>{schedules.length} schedule{schedules.length === 1 ? "" : "s"} currently defined.</CardDescription></CardHeader>
        <CardContent>{schedules.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No recurring delivery schedules yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Material</TableHead><TableHead>Quantity</TableHead><TableHead>Frequency</TableHead><TableHead>Next run</TableHead><TableHead>Last run</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{schedules.map((schedule) => <TableRow key={schedule.id}><TableCell className="font-medium">{schedule.supplierName}</TableCell><TableCell>{schedule.materialName}<span className="block text-xs text-muted-foreground">{schedule.unit}</span></TableCell><TableCell className="tabular-nums">{schedule.quantity}</TableCell><TableCell>{schedule.frequency === "custom" ? `Every ${schedule.customIntervalDays} days` : FREQUENCIES.find((option) => option.value === schedule.frequency)?.label}</TableCell><TableCell>{formatDisplay(schedule.nextRunOn)}</TableCell><TableCell>{schedule.lastRunOn ? formatDisplay(schedule.lastRunOn) : "—"}</TableCell><TableCell><Badge variant={schedule.active ? "secondary" : "outline"}>{schedule.active ? "Active" : "Paused"}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void toggleSchedule(schedule)}>{schedule.active ? <><Pause className="size-3.5" />Pause</> : <><Play className="size-3.5" />Resume</>}</Button></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent>
      </Card>
    </div>
  );
}
