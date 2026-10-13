"use client";

import { useState } from "react";
import { Ellipsis, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import { FieldRow } from "@/components/fields/field-row";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMaterialUsageCounts, upsertInventoryMaterial } from "@/lib/data";
import { INVENTORY_UNITS, normalizeInventoryName } from "@/lib/inventory";
import { inventoryMaterialId } from "@/lib/inventory-source";
import { describeUnitChangeBlock } from "@/lib/material-usage";
import { reviewStatusView, type StatusView } from "@/lib/status";
import type { InventoryMaterial, InventoryUnit } from "@/lib/types";

type MaterialsProps = {
  materials: InventoryMaterial[];
  onChanged: () => Promise<void>;
};

// The lib's status tones map onto the five Canopy tones (DESIGN_SYSTEM §6).
function chipTone(view: StatusView): StatusTone {
  if (view.tone === "success") return "ok";
  if (view.tone === "warning") return "warn";
  if (view.tone === "primary") return "info";
  return view.tone;
}

function unitLabel(unit: InventoryUnit): string {
  return INVENTORY_UNITS.find((option) => option.value === unit)?.label ?? unit;
}

export function Materials({ materials, onChanged }: MaterialsProps) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("g");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [unitCheckId, setUnitCheckId] = useState<string | null>(null);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitChange, setUnitChange] = useState<{ material: InventoryMaterial; blocked: string | null; nextUnit: InventoryUnit } | null>(null);
  const confirm = useConfirm();

  // The unit is only changeable while nothing refers to the material. Otherwise the
  // existing quantities would silently change meaning.
  async function openUnitChange(material: InventoryMaterial) {
    setUnitCheckId(material.id);
    try {
      const counts = await getMaterialUsageCounts(material.id);
      setUnitChange({ material, blocked: describeUnitChangeBlock(material, counts), nextUnit: material.baseUnit });
      setUnitDialogOpen(true);
    } catch (error) {
      console.error("Failed to check material usage", error);
      toast.error("Could not check where this material is used. Try again.");
    } finally {
      setUnitCheckId(null);
    }
  }

  async function toggleMaterialActive(material: InventoryMaterial) {
    if (material.active) {
      const ok = await confirm({
        title: `Archive ${material.name}?`,
        body: "It leaves the stock and ordering lists. Its history is kept and it can be restored.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    await updateMaterial(material, { active: !material.active });
  }

  async function applyUnitChange() {
    const pending = unitChange;
    setUnitDialogOpen(false);
    if (!pending || pending.blocked || pending.nextUnit === pending.material.baseUnit) return;
    const ok = await confirm({
      title: `Change ${pending.material.name} to ${pending.nextUnit}?`,
      body: "Nothing uses this material yet, so existing quantities are not affected.",
      confirmLabel: "Change unit",
    });
    if (!ok) return;
    await updateMaterial(pending.material, { baseUnit: pending.nextUnit });
  }

  async function addMaterial() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Enter a material name first.");
      return;
    }
    if (materials.some((material) => material.normalizedName === normalizeInventoryName(trimmedName))) {
      toast.error("A material with that name already exists.");
      return;
    }
    setSaving(true);
    try {
      await upsertInventoryMaterial({
        id: inventoryMaterialId(trimmedName),
        name: trimmedName,
        normalizedName: normalizeInventoryName(trimmedName),
        type: "raw_ingredient",
        baseUnit: unit,
        active: true,
        reviewStatus: "approved",
        sourceRefs: [],
      });
      setName("");
      toast.success("Material added");
      await onChanged();
    } catch (error) {
      console.error("Failed to add material", error);
      toast.error(error instanceof Error ? error.message : "Failed to add material");
    } finally {
      setSaving(false);
    }
  }

  async function updateMaterial(material: InventoryMaterial, patch: Partial<InventoryMaterial>) {
    setUpdatingId(material.id);
    try {
      await upsertInventoryMaterial({
        ...material,
        ...patch,
        id: material.id,
        createdAt: material.createdAt,
      });
      toast.success("Material updated");
      await onChanged();
    } catch (error) {
      console.error("Failed to update material", error);
      toast.error(error instanceof Error ? error.message : "Failed to update material");
    } finally {
      setUpdatingId(null);
    }
  }

  const columns: Column<InventoryMaterial>[] = [
    {
      key: "name",
      label: "Name",
      phone: "title",
      cell: (material) => (
        <div className="min-w-0">
          <span className="block font-medium text-ink">{material.name}</span>
          <span className="block truncate font-mono text-micro text-ink-muted">{material.id}</span>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      phone: "meta",
      cell: (material) => (material.type === "raw_ingredient" ? "Raw ingredient" : material.type),
      cellClassName: "text-ink-muted",
    },
    {
      key: "unit",
      label: "Base unit",
      phone: "meta",
      cell: (material) => unitLabel(material.baseUnit),
    },
    {
      key: "review",
      label: "Review",
      phone: "detail",
      cell: (material) => {
        const view = reviewStatusView(material.reviewStatus);
        return <StatusChip tone={chipTone(view)}>{view.label}</StatusChip>;
      },
    },
    {
      key: "status",
      label: "Status",
      phone: "detail",
      cell: (material) => (material.active ? null : <StatusChip tone="neutral">Archived</StatusChip>),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-body text-ink-muted">
        Each material has a name, a base unit, and a review status. Set opening stock in the Stock tab before you record movements or rely on balances.
      </p>

      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line p-4 desk:px-6">
          <h2 className="font-display text-title-2 text-ink">Add a material</h2>
          <div className="mt-3 grid gap-3 tablet:grid-cols-[minmax(0,1fr)_220px_auto] tablet:items-end">
            <FieldRow label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Chicken"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addMaterial();
                  }}
                />
              )}
            </FieldRow>
            <FieldRow label="Base unit">
              {(id) => (
                <Select value={unit} onValueChange={(value) => setUnit(value as InventoryUnit)}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_UNITS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldRow>
            <Button onClick={() => void addMaterial()} loading={saving} disabled={saving}>
              <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
              {saving ? "Adding…" : "Add material"}
            </Button>
          </div>
          <p className="mt-2 text-small text-ink-muted">Use one base unit per material. Do not convert mass and volume without an approved rule.</p>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 desk:px-6">
          <h2 className="font-display text-title-2 text-ink">Material master</h2>
          <p className="text-small text-ink-muted">
            {materials.length} material{materials.length === 1 ? "" : "s"} currently defined.
          </p>
        </div>

        <div className="pt-2">
          <DataTable
            caption="Material master"
            columns={columns}
            rows={materials}
            getKey={(material) => material.id}
            listBelow="desk"
            actionsBelow
            rowActions={(material) => {
              const busy = updatingId === material.id;
              return (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || unitCheckId === material.id}
                    onClick={() => void openUnitChange(material)}
                  >
                    {unitCheckId === material.id ? "Checking…" : "Change unit…"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${material.name}`}>
                        <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={busy} onSelect={() => void toggleMaterialActive(material)}>
                        {material.active ? "Archive" : "Restore"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            }}
            empty={
              <div className="p-6">
                <EmptyState title="No materials yet">Review the source import or add one above.</EmptyState>
              </div>
            }
          />
        </div>
      </section>

      <AlertDialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <AlertDialogContent>
          {unitChange?.blocked ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Base unit is locked</AlertDialogTitle>
                <AlertDialogDescription>{unitChange.blocked}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button variant="secondary" className="w-full tablet:w-auto" onClick={() => setUnitDialogOpen(false)}>
                  Close
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Change base unit</AlertDialogTitle>
                <AlertDialogDescription>
                  {unitChange?.material.name} is in {unitChange?.material.baseUnit}. Nothing uses it yet, so the unit can change.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <FieldRow label="New base unit">
                {(id) => (
                  <Select
                    value={unitChange?.nextUnit}
                    onValueChange={(value) => setUnitChange((current) => (current ? { ...current, nextUnit: value as InventoryUnit } : current))}
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_UNITS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldRow>
              <AlertDialogFooter>
                <Button variant="secondary" className="w-full tablet:w-auto" onClick={() => setUnitDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="w-full tablet:w-auto"
                  onClick={() => void applyUnitChange()}
                  disabled={unitChange?.nextUnit === unitChange?.material.baseUnit}
                >
                  Continue
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
