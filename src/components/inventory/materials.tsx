"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, Check, Plus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { upsertInventoryMaterial } from "@/lib/data";
import { INVENTORY_UNITS, normalizeInventoryName } from "@/lib/inventory";
import { inventoryMaterialId } from "@/lib/inventory-source";
import type { InventoryMaterial, InventoryUnit } from "@/lib/types";

type MaterialsProps = {
  materials: InventoryMaterial[];
  onChanged: () => Promise<void>;
};

export function Materials({ materials, onChanged }: MaterialsProps) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("g");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  return (
    <div className="space-y-5">
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="flex gap-3 p-4">
          <Check className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Foundation only</p>
            <p className="mt-1 text-sm text-muted-foreground">Materials define names, base units, and review status. Opening stock, receipts, waste, and recipe consumption arrive in later phases.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a material</CardTitle>
          <CardDescription>Use one base unit per material. Do not convert mass and volume without an approved rule.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <div className="space-y-1.5"><Label htmlFor="new-inventory-material">Name</Label><Input id="new-inventory-material" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Chicken" onKeyDown={(event) => { if (event.key === "Enter") void addMaterial(); }} /></div>
            <div className="space-y-1.5"><Label htmlFor="new-inventory-unit">Base unit</Label><Select value={unit} onValueChange={(value) => setUnit(value as InventoryUnit)}><SelectTrigger id="new-inventory-unit" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_UNITS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={addMaterial} disabled={saving}><Plus className="size-4" />{saving ? "Adding…" : "Add material"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Material master</CardTitle><CardDescription>{materials.length} material{materials.length === 1 ? "" : "s"} currently defined.</CardDescription></CardHeader>
        <CardContent>
          {materials.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No materials yet. Review the source import or add one above.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Base unit</TableHead><TableHead>Review</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {materials.map((material) => {
                  const busy = updatingId === material.id;
                  return (
                    <TableRow key={material.id} className={!material.active ? "bg-surface-elevated" : undefined}>
                      <TableCell><span className="font-medium">{material.name}</span><span className="block font-mono text-[11px] text-muted-foreground">{material.id}</span></TableCell>
                      <TableCell className="text-muted-foreground">{material.type === "raw_ingredient" ? "Raw ingredient" : material.type}</TableCell>
                      <TableCell className="min-w-32"><Select value={material.baseUnit} disabled={busy} onValueChange={(value) => void updateMaterial(material, { baseUnit: value as InventoryUnit })}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_UNITS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></TableCell>
                      <TableCell>{material.reviewStatus === "approved" ? <Badge variant="default">Approved</Badge> : <Badge variant="destructive">Needs review</Badge>}</TableCell>
                      <TableCell><Badge variant={material.active ? "secondary" : "outline"}>{material.active ? "Active" : "Archived"}</Badge></TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => void updateMaterial(material, { active: !material.active })}>{material.active ? <><Archive className="size-3.5" />Archive</> : <><RotateCcw className="size-3.5" />Restore</>}</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
