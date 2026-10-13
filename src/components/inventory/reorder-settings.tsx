"use client";

import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldRow } from "@/components/fields/field-row";
import { EmptyState } from "@/components/patterns/states";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { saveReorderSettings } from "@/lib/data";
import { draftFromMaterial, isDraftDirty, patchFromDraft, validateDraft, type ReorderDraft } from "@/lib/reorder-settings";
import type { InventoryBalance } from "@/lib/inventory-ledger";
import type { InventoryMaterial, InventorySupplier, InventorySupplierItem } from "@/lib/types";

/**
 * Reorder settings for every active material (inventory §3.10). Edits are held as drafts. Changed rows are tinted and
 * saved together from the bar underneath, in one batch. Discard drops every draft.
 */
export function ReorderSettings({
  materials,
  suppliers,
  supplierItems,
  balances,
  onChanged,
}: {
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  supplierItems: InventorySupplierItem[];
  balances: InventoryBalance[];
  onChanged: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, ReorderDraft>>({});
  const [saving, setSaving] = useState(false);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const balanceById = useMemo(() => new Map(balances.map((balance) => [balance.materialId, balance])), [balances]);

  const draftOf = (material: InventoryMaterial): ReorderDraft => drafts[material.id] ?? draftFromMaterial(material);
  const dirty = materials.filter((material) => drafts[material.id] && isDraftDirty(drafts[material.id], material));

  function update(material: InventoryMaterial, patch: Partial<ReorderDraft>) {
    setDrafts((current) => ({ ...current, [material.id]: { ...(current[material.id] ?? draftFromMaterial(material)), ...patch } }));
  }

  async function saveAll() {
    for (const material of dirty) {
      const problem = validateDraft(drafts[material.id]);
      if (problem) {
        toast.error(`${material.name}: ${problem}`);
        return;
      }
    }
    setSaving(true);
    try {
      await saveReorderSettings(dirty.map((material) => ({ materialId: material.id, patch: patchFromDraft(drafts[material.id]) })));
      toast.success(`${dirty.length} reorder setting${dirty.length === 1 ? "" : "s"} saved`);
      setDrafts({});
      await onChanged();
    } catch (error) {
      console.error("Failed to save reorder settings", error);
      toast.error(error instanceof Error ? error.message : "Failed to save reorder settings");
    } finally {
      setSaving(false);
    }
  }

  // The per-material fields, shared by the table (desk and tablet) and the list (phone).
  const rowFor = (material: InventoryMaterial) => {
    const draft = draftOf(material);
    const isDirty = Boolean(drafts[material.id]) && isDraftDirty(draft, material);
    const linkedSuppliers = supplierItems
      .filter((item) => item.materialId === material.id)
      .map((item) => supplierById.get(item.supplierId))
      .filter((supplier): supplier is InventorySupplier => Boolean(supplier));
    const onHand = balanceById.get(material.id)?.currentQuantity;
    return { draft, isDirty, linkedSuppliers, onHand };
  };

  const supplierSelect = (material: InventoryMaterial, draft: ReorderDraft, linkedSuppliers: InventorySupplier[], id?: string) => {
    if (linkedSuppliers.length === 0) {
      return <p className="text-small text-ink-muted">No supplier prices yet. Link a supplier first.</p>;
    }
    return (
      <Select value={draft.preferredSupplierId || "none"} onValueChange={(value) => update(material, { preferredSupplierId: value === "none" ? "" : value })}>
        <SelectTrigger id={id} aria-label={id ? undefined : `Preferred supplier for ${material.name}`} className="w-full">
          <SelectValue placeholder="Optional" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No preferred supplier</SelectItem>
          {linkedSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };

  const alertCheckbox = (material: InventoryMaterial, draft: ReorderDraft) => (
    <label className="inline-flex min-h-11 items-center gap-2.5 text-body text-ink desk:min-h-0">
      <input
        type="checkbox"
        aria-label={`Alert for ${material.name}`}
        checked={draft.alertEnabled}
        onChange={(event) => update(material, { alertEnabled: event.target.checked })}
        className="size-5 accent-brand"
      />
      <Bell className="size-4 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
      <span>Alert</span>
    </label>
  );

  const formatOnHand = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatInventoryUsageQuantity(value));

  return (
    <section aria-labelledby="reorder-settings-title" className="space-y-4">
      <Card className="gap-0 py-0 shadow-card">
        <div className="space-y-1 px-4 pt-4 tablet:px-6 tablet:pt-6">
          <h2 id="reorder-settings-title" className="font-display text-title-2 text-ink">Reorder settings</h2>
          <p className="text-small text-ink-muted">Set the alert level, suggested quantity and preferred supplier for each material. Save them together.</p>
        </div>

        {materials.length === 0 ? (
          <EmptyState title="No active materials yet.">Add materials in Setup → Materials, and they appear here.</EmptyState>
        ) : (
          <>
            <div className="mt-4 hidden border-t border-line desk:block">
              <Table>
                <caption className="sr-only">Reorder settings for each material</caption>
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className="text-small text-ink-muted">Material</TableHead>
                    <TableHead className="text-right text-small text-ink-muted">On hand</TableHead>
                    <TableHead className="text-small text-ink-muted">Alert level</TableHead>
                    <TableHead className="text-small text-ink-muted">Order quantity</TableHead>
                    <TableHead className="text-small text-ink-muted">Preferred supplier</TableHead>
                    <TableHead className="text-small text-ink-muted">Alert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((material) => {
                    const { draft, isDirty, linkedSuppliers, onHand } = rowFor(material);
                    return (
                      <TableRow key={material.id} className={cn("border-line hover:bg-canvas", isDirty && "bg-brand-soft/60 hover:bg-brand-soft/60")}>
                        <TableCell className="min-w-40 text-table text-ink">
                          <span className="font-medium">{material.name}</span>
                          <span className="ml-1.5 text-small text-ink-muted">{material.baseUnit}</span>
                          {isDirty && <span className="block text-small font-medium text-ink">Changed</span>}
                        </TableCell>
                        <TableCell className="text-right text-table tabular-nums text-ink">{formatOnHand(onHand)}</TableCell>
                        <TableCell className="min-w-28">
                          <Input aria-label={`Alert level for ${material.name}`} inputMode="decimal" value={draft.threshold} onChange={(event) => update(material, { threshold: event.target.value })} placeholder="—" className="text-right tabular-nums" />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <Input aria-label={`Order quantity for ${material.name}`} inputMode="decimal" value={draft.quantity} onChange={(event) => update(material, { quantity: event.target.value })} placeholder="—" className="text-right tabular-nums" />
                        </TableCell>
                        <TableCell className="min-w-44">{supplierSelect(material, draft, linkedSuppliers)}</TableCell>
                        <TableCell>{alertCheckbox(material, draft)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ul className="mt-4 divide-y divide-line border-t border-line desk:hidden" aria-label="Reorder settings for each material">
              {materials.map((material) => {
                const { draft, isDirty, linkedSuppliers, onHand } = rowFor(material);
                return (
                  <li key={material.id} className={cn("space-y-3 px-4 py-4", isDirty && "bg-brand-soft/60")}>
                    <div>
                      <p className="text-body font-medium text-ink">
                        {material.name}
                        <span className="ml-1.5 text-small font-normal text-ink-muted">{material.baseUnit}</span>
                      </p>
                      <p className="text-small text-ink-muted">On hand <span className="tabular-nums text-ink">{formatOnHand(onHand)}</span></p>
                      {isDirty && <p className="text-small font-medium text-ink">Changed</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Alert level">
                        {(id) => <Input id={id} inputMode="decimal" value={draft.threshold} onChange={(event) => update(material, { threshold: event.target.value })} placeholder="—" className="text-right tabular-nums" />}
                      </FieldRow>
                      <FieldRow label="Order quantity">
                        {(id) => <Input id={id} inputMode="decimal" value={draft.quantity} onChange={(event) => update(material, { quantity: event.target.value })} placeholder="—" className="text-right tabular-nums" />}
                      </FieldRow>
                    </div>
                    <FieldRow label="Preferred supplier">
                      {(id) => supplierSelect(material, draft, linkedSuppliers, id)}
                    </FieldRow>
                    {alertCheckbox(material, draft)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {dirty.length > 0 && (
        <div
          className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-raised tablet:bottom-4"
        >
          <p className="text-table font-medium text-ink" aria-live="polite">{dirty.length} change{dirty.length === 1 ? "" : "s"} not saved</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setDrafts({})} disabled={saving}>Discard</Button>
            <Button type="button" loading={saving} onClick={() => void saveAll()}>
              {saving ? "Saving…" : `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
