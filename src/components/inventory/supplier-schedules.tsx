"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FieldRow } from "@/components/fields/field-row";
import { MaterialQuantityInput } from "@/components/fields/material-quantity-input";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { EmptyState } from "@/components/patterns/states";
import { todayISO, formatDisplay } from "@/lib/dates";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
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

function frequencyLabel(schedule: InventorySupplierDeliverySchedule): string {
  if (schedule.frequency === "custom") return `Every ${schedule.customIntervalDays} days`;
  return FREQUENCIES.find((option) => option.value === schedule.frequency)?.label ?? schedule.frequency;
}

/**
 * Recurring supplier deliveries (inventory §3.10). Run due now creates the deliveries that fall due. Each schedule
 * can be paused or resumed. New schedules are set up in a sheet.
 */
export function SupplierSchedules({ materials, suppliers, supplierItems, schedules, onChanged }: SupplierSchedulesProps) {
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const materialById = useMemo(() => new Map(activeMaterials.map((material) => [material.id, material])), [activeMaterials]);
  const [formOpen, setFormOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [frequency, setFrequency] = useState<InventorySupplierDeliveryFrequency>("weekly");
  const [customIntervalDays, setCustomIntervalDays] = useState("");
  const [startOn, setStartOn] = useState(todayISO());
  const [executionTime, setExecutionTime] = useState("08:00");
  const [endOn, setEndOn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const linkedMaterials = useMemo(() => supplierItems
    .filter((item) => item.supplierId === supplierId && materialById.has(item.materialId))
    .map((item) => materialById.get(item.materialId))
    .filter((material): material is InventoryMaterial => Boolean(material)), [materialById, supplierId, supplierItems]);
  const selectedMaterial = materialId ? materialById.get(materialId) : undefined;

  function resetForm() {
    setSupplierId("");
    setMaterialId("");
    setQuantity("");
    setFrequency("weekly");
    setCustomIntervalDays("");
    setStartOn(todayISO());
    setExecutionTime("08:00");
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
        executionTime,
        endOn: endOn || undefined,
        active: true,
        notes: notes.trim() || undefined,
      });
      toast.success("Recurring delivery schedule saved");
      resetForm();
      setFormOpen(false);
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
      const result = await runDueInventorySupplierDeliverySchedules(todayISO(), undefined, true);
      toast.success(result.schedulesRun > 0 ? `${result.schedulesRun} recurring delivery waiting in Orders to confirm` : "No recurring deliveries are due");
      await onChanged();
    } catch (error) {
      console.error("Failed to run due deliveries", error);
      toast.error(error instanceof Error ? error.message : "Failed to run due deliveries");
    } finally {
      setRunning(false);
    }
  }

  // Shown in the sheet's save bar. Saving still runs the same checks and reports each problem as a toast.
  const saveBlocker = !supplierId
    ? "Choose a supplier first."
    : !materialId
      ? "Choose a linked material."
      : !(Number(quantity) > 0)
        ? "Enter a delivery quantity greater than zero."
        : frequency === "custom" && !(Number.isInteger(Number(customIntervalDays)) && Number(customIntervalDays) > 0)
          ? "Enter the interval in whole days."
          : "";

  const columns: Column<InventorySupplierDeliverySchedule>[] = [
    {
      key: "supplier",
      label: "Supplier",
      cell: (schedule) => (
        <>
          <span className="font-medium">{schedule.supplierName}</span>
          <span className="block text-small text-ink-muted">{schedule.materialName} · {schedule.unit}</span>
        </>
      ),
      phone: "title",
    },
    {
      key: "quantity",
      label: "Quantity",
      align: "right",
      cell: (schedule) => `${formatInventoryUsageQuantity(schedule.quantity)} ${schedule.unit}`,
      phone: "figure",
    },
    {
      key: "frequency",
      label: "Frequency",
      cell: (schedule) => frequencyLabel(schedule),
      phone: "meta",
    },
    {
      key: "nextRun",
      label: "Next run",
      cell: (schedule) => <><span className="tablet:hidden">Next </span>{formatDisplay(schedule.nextRunOn)}<span className="text-ink-muted"> · {schedule.executionTime ?? "08:00"}</span></>,
      phone: "detail",
    },
    {
      key: "lastRun",
      label: "Last run",
      cell: (schedule) => <><span className="tablet:hidden">Last run </span>{schedule.lastRunOn ? formatDisplay(schedule.lastRunOn) : "—"}</>,
      phone: "detail",
    },
    {
      key: "status",
      label: "Status",
      cell: (schedule) => schedule.active
        ? <StatusChip tone="ok">Active</StatusChip>
        : <StatusChip tone="neutral">Paused</StatusChip>,
      phone: "meta",
    },
  ];

  return (
    <section aria-labelledby="recurring-deliveries-title" className="space-y-4">
      <Card className="gap-0 py-0 shadow-card">
        <div className="flex flex-col gap-3 px-4 py-4 tablet:flex-row tablet:items-center tablet:justify-between tablet:px-6">
          <div className="min-w-0">
            <h2 id="recurring-deliveries-title" className="font-display text-title-2 text-ink">Recurring supplier deliveries</h2>
            <p className="mt-1 text-small text-ink-muted">Deliveries are created when they fall due. Opening Stock checks for due deliveries too.</p>
          </div>
          <Button type="button" variant="secondary" className="self-start tablet:self-auto" loading={running} onClick={() => void runDueNow()}>
            {running ? "Checking…" : "Run due now"}
          </Button>
        </div>
      </Card>

      <Card className="gap-0 py-0 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 tablet:px-6 tablet:pt-6">
          <div className="min-w-0">
            <h2 className="font-display text-title-2 text-ink">Delivery schedules</h2>
            <p className="mt-1 text-small text-ink-muted">{schedules.length} schedule{schedules.length === 1 ? "" : "s"} currently defined.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
            <Plus />Set a recurring delivery
          </Button>
        </div>
        <div className="mt-4 border-t border-line">
          <DataTable
            caption="Delivery schedules"
            listBelow="desk"
            columns={columns}
            rows={schedules}
            getKey={(schedule) => schedule.id}
            density="compact"
            rowActions={(schedule) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void toggleSchedule(schedule)}
                aria-label={`${schedule.active ? "Pause" : "Resume"} ${schedule.materialName} from ${schedule.supplierName}`}
              >
                {schedule.active ? "Pause" : "Resume"}
              </Button>
            )}
            empty={<EmptyState title="No recurring delivery schedules yet.">Set a recurring delivery and it appears here.</EmptyState>}
          />
        </div>
      </Card>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Set a recurring delivery</SheetTitle>
            <SheetDescription>Only materials already linked to the selected supplier can be scheduled.</SheetDescription>
          </SheetHeader>

          {activeSuppliers.length === 0 ? (
            <EmptyState title="No active supplier.">Add an active supplier and supplier-material link first.</EmptyState>
          ) : (
            <>
              <div className="grid gap-4 tablet:grid-cols-2">
                <FieldRow label="Supplier">
                  {(id) => (
                    <Select value={supplierId} onValueChange={(value) => { setSupplierId(value); setMaterialId(""); }}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                      <SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="Material">
                  {(id) => (
                    <Select value={materialId} onValueChange={setMaterialId} disabled={!supplierId}>
                      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={supplierId ? "Choose linked material" : "Choose supplier first"} /></SelectTrigger>
                      <SelectContent>{linkedMaterials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name} · {material.baseUnit}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FieldRow>
                <FieldRow label="Delivery quantity">
                  {(id) => (
                    <MaterialQuantityInput id={id} label="Delivery quantity" value={quantity} unit={selectedMaterial?.baseUnit ?? ""} onChange={setQuantity} />
                  )}
                </FieldRow>
                <FieldRow label="Frequency">
                  {(id) => (
                    <Select value={frequency} onValueChange={(value) => setFrequency(value as InventorySupplierDeliveryFrequency)}>
                      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FieldRow>
                {frequency === "custom" && (
                  <FieldRow label="Every (days)">
                    {(id) => <Input id={id} type="number" min="1" step="1" value={customIntervalDays} onChange={(event) => setCustomIntervalDays(event.target.value)} placeholder="e.g. 10" />}
                  </FieldRow>
                )}
                <FieldRow label="Start date">
                  {(id) => <Input id={id} type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />}
                </FieldRow>
                <FieldRow label="Delivery time">
                  {(id) => <Input id={id} type="time" value={executionTime} onChange={(event) => setExecutionTime(event.target.value)} />}
                </FieldRow>
                <FieldRow label="End date" hint="Optional.">
                  {(id) => <Input id={id} type="date" value={endOn} onChange={(event) => setEndOn(event.target.value)} />}
                </FieldRow>
                <FieldRow label="Notes">
                  {(id) => <Input id={id} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />}
                </FieldRow>
              </div>
            </>
          )}

          <SheetFooter>
            {activeSuppliers.length > 0 && (
              <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{saveBlocker}</p>
            )}
            {activeSuppliers.length > 0 && (
              <Button type="button" loading={saving} disabled={saving} onClick={() => void saveSchedule()}>
                {saving ? "Saving…" : "Save schedule"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
