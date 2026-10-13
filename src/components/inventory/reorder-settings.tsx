"use client";

import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveReorderSettings } from "@/lib/data";
import { draftFromMaterial, isDraftDirty, patchFromDraft, validateDraft, type ReorderDraft } from "@/lib/reorder-settings";
import type { InventoryBalance } from "@/lib/inventory-ledger";
import type { InventoryMaterial, InventorySupplier, InventorySupplierItem } from "@/lib/types";

/**
 * Reorder settings for every material in one table. Changed rows are highlighted and
 * saved together from the bar at the bottom, in one batch.
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reorder settings</CardTitle>
        <CardDescription>Set the alert level, suggested quantity and preferred supplier for each material. Save them together.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {materials.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No active materials yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-40 bg-card">Material</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead>Alert at</TableHead>
                  <TableHead>Order quantity</TableHead>
                  <TableHead>Preferred supplier</TableHead>
                  <TableHead>Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((material) => {
                  const draft = draftOf(material);
                  const isDirty = Boolean(drafts[material.id]) && isDraftDirty(draft, material);
                  const linkedSuppliers = supplierItems
                    .filter((item) => item.materialId === material.id)
                    .map((item) => supplierById.get(item.supplierId))
                    .filter((supplier): supplier is InventorySupplier => Boolean(supplier));
                  const onHand = balanceById.get(material.id)?.currentQuantity;
                  return (
                    <TableRow key={material.id} className={isDirty ? "bg-warning/5" : undefined}>
                      <TableCell className="sticky left-0 z-10 min-w-40 bg-card">
                        <span className="font-medium">{material.name}</span>
                        <span className="block text-xs text-muted-foreground">{material.baseUnit}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {onHand === null || onHand === undefined ? "—" : onHand.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="min-w-28">
                        <Input aria-label={`Alert level for ${material.name}`} inputMode="decimal" value={draft.threshold} onChange={(event) => update(material, { threshold: event.target.value })} placeholder="—" className="h-11 sm:h-9" />
                      </TableCell>
                      <TableCell className="min-w-28">
                        <Input aria-label={`Order quantity for ${material.name}`} inputMode="decimal" value={draft.quantity} onChange={(event) => update(material, { quantity: event.target.value })} placeholder="—" className="h-11 sm:h-9" />
                      </TableCell>
                      <TableCell className="min-w-44">
                        {linkedSuppliers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No supplier prices yet. Link a supplier first.</p>
                        ) : (
                          <Select value={draft.preferredSupplierId || "none"} onValueChange={(value) => update(material, { preferredSupplierId: value === "none" ? "" : value })}>
                            <SelectTrigger aria-label={`Preferred supplier for ${material.name}`} className="w-full">
                              <SelectValue placeholder="Optional" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No preferred supplier</SelectItem>
                              {linkedSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={draft.alertEnabled} onChange={(event) => update(material, { alertEnabled: event.target.checked })} className="size-4 accent-primary" />
                          <Bell className="size-4 text-muted-foreground" aria-hidden />
                          <span>Alert</span>
                        </label>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {dirty.length > 0 && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur sm:bottom-4">
            <p className="text-sm font-medium text-foreground">{dirty.length} change{dirty.length === 1 ? "" : "s"} not saved</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDrafts({})} disabled={saving}>Discard</Button>
              <Button onClick={() => void saveAll()} disabled={saving} className="bg-primary hover:bg-primary-hover">
                {saving ? "Saving…" : `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
