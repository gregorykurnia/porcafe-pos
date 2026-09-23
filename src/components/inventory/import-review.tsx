"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, FileSpreadsheet, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  commitInventoryFoundation,
  type InventoryFoundationCommit,
} from "@/lib/data";
import {
  INVENTORY_SOURCE_BOUNDARY,
  INVENTORY_SOURCE_GROUPS,
  INVENTORY_SOURCE_ROWS,
  inventoryAliasId,
  inventoryComponentId,
  inventoryMaterialId,
  inventoryRecipeId,
  normalizeSourceLabel,
  slugifyInventoryId,
  sourceRowIsImportable,
  type InventorySourceRow,
} from "@/lib/inventory-source";
import { normalizeInventoryName, validateRecipe } from "@/lib/inventory";
import type {
  InventoryAliasMapping,
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  MenuItem,
} from "@/lib/types";

type ImportReviewProps = {
  menuItems: MenuItem[];
  materials: InventoryMaterial[];
  aliases: InventoryAliasMapping[];
  recipes: InventoryRecipeVersion[];
  recipeLines: InventoryRecipeLine[];
  onChanged: () => Promise<void>;
};

const CREATE_PREFIX = "__create__:";

function now(): number {
  return Date.now();
}

function matchingMenuItem(menuItems: MenuItem[], sourceLabel: string, canonicalName: string): MenuItem | undefined {
  const normalizeMenuMatch = (value: string) => normalizeSourceLabel(value)
    .replace(/\band\b/g, "&")
    .replace(/\s*&\s*/g, " & ");
  const source = normalizeMenuMatch(sourceLabel);
  const canonical = normalizeMenuMatch(canonicalName);
  return menuItems.find((item) => {
    const name = normalizeMenuMatch(item.name);
    return name === canonical || name === source || (source === "nanban" && name.includes("nanban"));
  });
}

function statusBadge(status: InventorySourceRow["status"] | "approved" | "mapping") {
  if (status === "excluded") return <Badge variant="outline">Excluded</Badge>;
  if (status === "needs-review") return <Badge variant="destructive">Needs review</Badge>;
  if (status === "approved") return <Badge variant="default">Approved</Badge>;
  return <Badge variant="secondary">Map first</Badge>;
}

function sourceRowsForGroup(groupId: string): InventorySourceRow[] {
  return INVENTORY_SOURCE_ROWS.filter((row) => row.sourceGroup === groupId);
}

function conflictingMenuGroupIds(menuSelections: Record<string, string>): Set<string> {
  const groupsByTarget = new Map<string, string[]>();
  for (const group of INVENTORY_SOURCE_GROUPS) {
    if (group.targetType !== "menu_item") continue;
    const targetId = menuSelections[group.id];
    if (!targetId) continue;
    const groups = groupsByTarget.get(targetId) ?? [];
    groups.push(group.id);
    groupsByTarget.set(targetId, groups);
  }

  const conflicts = new Set<string>();
  for (const groups of groupsByTarget.values()) {
    if (groups.length < 2) continue;
    for (const groupId of groups) conflicts.add(groupId);
  }
  return conflicts;
}

export function ImportReview({
  menuItems,
  materials,
  aliases,
  recipes,
  recipeLines,
  onChanged,
}: ImportReviewProps) {
  const [menuSelections, setMenuSelections] = useState<Record<string, string>>({});
  const [materialSelections, setMaterialSelections] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<"mappings" | "foundation" | null>(null);
  const conflictingMenuGroups = useMemo(
    () => conflictingMenuGroupIds(menuSelections),
    [menuSelections]
  );

  const rawSourceLabels = useMemo(
    () => [...new Set(INVENTORY_SOURCE_ROWS.filter((row) => row.ingredientType === "material" && row.status !== "excluded").map((row) => row.ingredientSourceLabel))].sort(),
    []
  );

  useEffect(() => {
    const menuDefaults: Record<string, string> = {};
    const assignedTargetIds = new Set<string>();
    for (const group of INVENTORY_SOURCE_GROUPS) {
      if (group.targetType !== "menu_item") continue;
      const alias = aliases.find(
        (candidate) => candidate.entityType === "menu_item" && candidate.sourceLabel === group.targetLabel
      );
      const aliasedMenu = alias?.targetId
        ? menuItems.find((item) => item.id === alias.targetId)
        : undefined;
      const canonicalMenu = matchingMenuItem(menuItems, group.targetLabel, group.targetName);
      const menu = [canonicalMenu, aliasedMenu].find(
        (candidate) => candidate && !assignedTargetIds.has(candidate.id)
      );
      menuDefaults[group.id] = menu?.id ?? "";
      if (menu) assignedTargetIds.add(menu.id);
    }
    const materialDefaults: Record<string, string> = {};
    for (const sourceLabel of rawSourceLabels) {
      const alias = aliases.find(
        (candidate) =>
          candidate.entityType === "material" &&
          candidate.sourceLabel === sourceLabel
      );
      const canonicalName = INVENTORY_SOURCE_ROWS.find((row) => row.ingredientSourceLabel === sourceLabel)?.ingredientName ?? sourceLabel;
      const existing = alias?.targetId
        ? materials.find((material) => material.id === alias.targetId)
        : materials.find((material) => material.normalizedName === normalizeInventoryName(canonicalName));
      materialDefaults[sourceLabel] = existing?.id ?? `${CREATE_PREFIX}${inventoryMaterialId(canonicalName)}`;
    }
    queueMicrotask(() => {
      setMenuSelections(menuDefaults);
      setMaterialSelections(materialDefaults);
    });
  }, [aliases, menuItems, materials, rawSourceLabels]);

  const rowsWithQuery = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return INVENTORY_SOURCE_ROWS;
    return INVENTORY_SOURCE_ROWS.filter((row) =>
      [row.targetLabel, row.ingredientSourceLabel, row.ingredientName, row.sourceRef]
        .join(" ")
        .toLocaleLowerCase()
        .includes(value)
    );
  }, [query]);

  function targetIdForRow(row: InventorySourceRow): string | null {
    if (row.targetType === "prepared_component") return inventoryComponentId(row.targetName);
    return menuSelections[row.sourceGroup] || null;
  }

  function ingredientIdForRow(row: InventorySourceRow): string | null {
    if (row.ingredientType === "component") return inventoryComponentId(row.ingredientName);
    const choice = materialSelections[row.ingredientSourceLabel];
    if (!choice) return null;
    return choice.startsWith(CREATE_PREFIX) ? choice.slice(CREATE_PREFIX.length) : choice;
  }

  function rowIsApproved(row: InventorySourceRow): boolean {
    const targetIsConflicting = row.targetType === "menu_item" && conflictingMenuGroups.has(row.sourceGroup);
    return sourceRowIsImportable(row) && Boolean(targetIdForRow(row)) && !targetIsConflicting && Boolean(ingredientIdForRow(row));
  }

  const approvedRows = INVENTORY_SOURCE_ROWS.filter(rowIsApproved);
  const sourceNeedsReview = INVENTORY_SOURCE_ROWS.filter((row) => row.status === "needs-review").length;
  const unresolvedRows = INVENTORY_SOURCE_ROWS.filter(
    (row) => sourceRowIsImportable(row) && !rowIsApproved(row)
  ).length;
  const excludedRows = INVENTORY_SOURCE_ROWS.filter((row) => row.status === "excluded").length;

  function buildAliases(): InventoryAliasMapping[] {
    const timestamp = now();
    const result: InventoryAliasMapping[] = [];

    for (const group of INVENTORY_SOURCE_GROUPS) {
      const rows = sourceRowsForGroup(group.id);
      const targetId = targetIdForRow(rows[0]);
      const targetName =
        group.targetType === "prepared_component"
          ? group.targetName
          : menuItems.find((item) => item.id === targetId)?.name ?? null;
      result.push({
        id: inventoryAliasId(group.targetType, group.targetLabel),
        sourceLabel: group.targetLabel,
        normalizedSourceLabel: normalizeSourceLabel(group.targetLabel),
        entityType: group.targetType,
        targetId,
        targetName,
        status: targetId ? "approved" : "needs-review",
        sourceRefs: rows.map((row) => row.sourceRef),
        note: group.targetType === "menu_item" && group.targetLabel === "Nanban"
          ? "Phase 0 maps Nanban to Chicken Nanban. Confirm the live menu item before importing."
          : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const sourceMappingKeys = [...new Set(
      INVENTORY_SOURCE_ROWS
        .filter((row) => row.status !== "excluded")
        .map((row) => `${row.ingredientType}:${row.ingredientSourceLabel}`)
    )];
    for (const key of sourceMappingKeys) {
      const separator = key.indexOf(":");
      const ingredientType = key.slice(0, separator);
      const sourceLabel = key.slice(separator + 1);
      const rows = INVENTORY_SOURCE_ROWS.filter(
        (row) => row.ingredientType === ingredientType && row.ingredientSourceLabel === sourceLabel
      );
      const first = rows[0];
      const targetId = ingredientIdForRow(first);
      const targetName = first.ingredientName;
      const entityType = first.ingredientType === "component" ? "prepared_component" : "material";
      const sourceReady = rows.every((row) => row.status === "ready");
      result.push({
        id: inventoryAliasId(entityType, sourceLabel),
        sourceLabel,
        normalizedSourceLabel: normalizeSourceLabel(sourceLabel),
        entityType,
        targetId,
        targetName: targetId ? targetName : null,
        status: targetId && sourceReady ? "approved" : "needs-review",
        sourceRefs: rows.map((row) => row.sourceRef),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return result;
  }

  function buildMaterials(): InventoryMaterial[] {
    const timestamp = now();
    const byId = new Map<string, InventoryMaterial>();
    const sourceRows = INVENTORY_SOURCE_ROWS.filter(
      (row) => row.ingredientType === "material" && row.status !== "excluded"
    );

    for (const sourceLabel of rawSourceLabels) {
      const rows = sourceRows.filter((row) => row.ingredientSourceLabel === sourceLabel);
      const first = rows[0];
      const id = ingredientIdForRow(first);
      if (!id) continue;
      const existing = materials.find((material) => material.id === id);
      const previous = byId.get(id);
      const baseUnit = existing?.baseUnit ?? first.unit ?? "g";
      byId.set(id, {
        id,
        name: existing?.name ?? first.ingredientName,
        normalizedName: existing?.normalizedName ?? normalizeInventoryName(first.ingredientName),
        type: existing?.type ?? "raw_ingredient",
        baseUnit,
        active: existing?.active ?? true,
        reviewStatus: rows.every((row) => row.status === "ready") ? "approved" : "needs-review",
        sourceRefs: [...new Set([...(previous?.sourceRefs ?? []), ...rows.map((row) => row.sourceRef)])],
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }
    return [...byId.values()];
  }

  function buildRecipes(): InventoryFoundationCommit["recipes"] {
    const timestamp = now();
    const result: InventoryFoundationCommit["recipes"] = [];

    for (const group of INVENTORY_SOURCE_GROUPS) {
      const rows = sourceRowsForGroup(group.id);
      const importableRows = rows.filter(sourceRowIsImportable);
      if (rows.some((row) => row.status === "needs-review") || !importableRows.every((row) => rowIsApproved(row))) continue;
      const targetId = targetIdForRow(importableRows[0]);
      if (!targetId) continue;

      const existing = recipes
        .filter((recipe) => recipe.targetId === targetId && recipe.targetType === group.targetType)
        .sort((a, b) => b.version - a.version)[0];
      const shouldCreateNewVersion = existing?.status === "active";
      const version = shouldCreateNewVersion ? (existing?.version ?? 0) + 1 : existing?.version ?? 1;
      const recipeId = shouldCreateNewVersion
        ? inventoryRecipeId(group.targetType, targetId, version)
        : existing?.id ?? inventoryRecipeId(group.targetType, targetId, version);
      const basis = group.targetName === "Saus Mentai" ? "batch" : "per_portion";
      const recipeStatus = "draft";
      const recipe: InventoryRecipeVersion = {
        id: recipeId,
        targetType: group.targetType,
        targetId,
        targetName: group.targetType === "menu_item"
          ? menuItems.find((item) => item.id === targetId)?.name ?? group.targetName
          : group.targetName,
        version,
        status: recipeStatus,
        basis,
        effectiveFrom: null,
        yieldQuantity: basis === "batch" ? 150 : null,
        yieldUnit: basis === "batch" ? "g" : null,
        reviewStatus: recipeStatus === "draft" ? "approved" : "needs-review",
        sourceRefs: rows.map((row) => row.sourceRef),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const lines: InventoryRecipeLine[] = importableRows.map((row) => {
        const ingredientId = ingredientIdForRow(row)!;
        const existingLine = recipeLines.find(
          (line) => line.recipeId === recipeId && line.sourceRef === row.sourceRef
        );
        return {
          id: existingLine?.id ?? `${recipeId}-line-${slugifyInventoryId(row.sourceRef)}`,
          recipeId,
          ingredientType: row.ingredientType,
          ingredientId,
          ingredientName: row.ingredientName,
          quantity: row.amount,
          unit: row.unit,
          sourceRef: row.sourceRef,
          reviewStatus: "approved",
          note: row.ingredientSourceLabel !== row.ingredientName
            ? `Source label: ${row.ingredientSourceLabel}`
            : undefined,
          createdAt: existingLine?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
      });
      result.push({ recipe, lines });
    }
    return result;
  }

  async function saveMappings() {
    setSaving("mappings");
    try {
      await commitInventoryFoundation({ materials: [], aliases: buildAliases(), recipes: [] });
      toast.success("Mapping review saved");
      await onChanged();
    } catch (error) {
      console.error("Failed to save inventory mappings", error);
      toast.error(error instanceof Error ? error.message : "Failed to save mapping review");
    } finally {
      setSaving(null);
    }
  }

  async function commitFoundation() {
    if (conflictingMenuGroups.size > 0) {
      toast.error("Each source menu group must map to a different live menu item.");
      return;
    }
    if (unresolvedRows > 0 || sourceNeedsReview > 0) {
      toast.error("Resolve mapping and source review rows before creating draft recipes.");
      return;
    }
    const materialsToCommit = buildMaterials();
    const recipesToCommit = buildRecipes();
    if (recipesToCommit.length === 0) {
      toast.error("No fully mapped recipe groups are ready to import.");
      return;
    }
    const recipesForValidation = [...recipes, ...recipesToCommit.map(({ recipe }) => recipe)];
    const linesForValidation = [...recipeLines, ...recipesToCommit.flatMap(({ lines }) => lines)];
    for (const { recipe, lines } of recipesToCommit) {
      const validation = validateRecipe(recipe, lines, [...materials, ...materialsToCommit], recipesForValidation, linesForValidation);
      if (!validation.valid) {
        toast.error(`${recipe.targetName}: ${validation.errors[0] ?? "recipe needs review"}`);
        return;
      }
    }
    const recipeIdsBeingReplaced = new Set(recipesToCommit.map(({ recipe }) => recipe.id));
    const newLineIds = new Set(recipesToCommit.flatMap(({ lines }) => lines.map((line) => line.id)));
    const deleteLineIds = recipeLines
      .filter((line) => recipeIdsBeingReplaced.has(line.recipeId) && !newLineIds.has(line.id))
      .map((line) => line.id);
    setSaving("foundation");
    try {
      await commitInventoryFoundation({
        materials: materialsToCommit,
        aliases: buildAliases(),
        recipes: recipesToCommit,
        deleteLineIds,
      });
      toast.success(`${recipesToCommit.length} draft recipe groups saved. No stock usage was created.`);
      await onChanged();
    } catch (error) {
      console.error("Failed to import inventory foundation", error);
      toast.error(error instanceof Error ? error.message : "Failed to create draft recipes");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-info/20 bg-info/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-info" />
            <div>
              <p className="font-medium">Reviewed source preview only</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This preview is bounded to {INVENTORY_SOURCE_BOUNDARY}. Blank quantities are review issues; packaging and the two explicitly ignored ingredients stay excluded.
              </p>
            </div>
          </div>
          <Badge variant="outline">No inventory deductions</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Source rows</p><p className="mt-1 text-xl font-semibold tabular-nums">{INVENTORY_SOURCE_ROWS.length}</p></CardContent></Card>
        <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Ready after mapping</p><p className="mt-1 text-xl font-semibold tabular-nums text-success">{approvedRows.length}</p></CardContent></Card>
        <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Source review</p><p className="mt-1 text-xl font-semibold tabular-nums text-warning">{sourceNeedsReview}</p></CardContent></Card>
        <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Excluded by policy</p><p className="mt-1 text-xl font-semibold tabular-nums">{excludedRows}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Confirm menu and component targets</CardTitle>
          <CardDescription>Source labels remain visible in the alias mapping so the import can be audited later.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {INVENTORY_SOURCE_GROUPS.map((group) => {
              const rows = sourceRowsForGroup(group.id);
              const selected = targetIdForRow(rows[0]);
              const hasTargetConflict = conflictingMenuGroups.has(group.id);
              return (
                <div key={group.id} className="rounded-xl border border-border/70 bg-surface/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Source group {group.id}</p>
                      <p className="font-medium">{group.targetLabel}</p>
                      {group.targetName !== group.targetLabel && <p className="text-xs text-muted-foreground">Planned target: {group.targetName}</p>}
                    </div>
                    {hasTargetConflict ? statusBadge("needs-review") : selected ? statusBadge("approved") : statusBadge("mapping")}
                  </div>
                  {group.targetType === "prepared_component" ? (
                    <p className="mt-3 text-sm text-muted-foreground">Prepared component ID: <span className="font-mono text-xs">{inventoryComponentId(group.targetName)}</span></p>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor={`menu-map-${group.id}`} className="text-xs">Live menu item</Label>
                      <Select value={menuSelections[group.id] ?? ""} onValueChange={(value) => {
                        const conflictsWithAnotherGroup = INVENTORY_SOURCE_GROUPS.some(
                          (candidate) => candidate.id !== group.id && candidate.targetType === "menu_item" && menuSelections[candidate.id] === value
                        );
                        if (conflictsWithAnotherGroup) {
                          toast.error("Each source menu group must map to a different live menu item.");
                          return;
                        }
                        setMenuSelections((current) => ({ ...current, [group.id]: value }));
                      }}>
                        <SelectTrigger id={`menu-map-${group.id}`} className="w-full"><SelectValue placeholder="Choose a live menu item" /></SelectTrigger>
                        <SelectContent>
                          {menuItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {hasTargetConflict && <p className="mt-1 text-xs text-destructive">This menu item is already assigned to another source group.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Confirm material aliases</CardTitle>
          <CardDescription>New canonical materials are staged with stable IDs and can be edited in Materials before use.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Source label</TableHead><TableHead>Canonical target</TableHead><TableHead>Material</TableHead></TableRow></TableHeader>
            <TableBody>
              {rawSourceLabels.map((sourceLabel) => {
                const row = INVENTORY_SOURCE_ROWS.find((candidate) => candidate.ingredientSourceLabel === sourceLabel)!;
                const choice = materialSelections[sourceLabel] ?? "";
                return (
                  <TableRow key={sourceLabel}>
                    <TableCell><span className="font-medium">{sourceLabel}</span><span className="block text-xs text-muted-foreground">{row.sourceRef}</span></TableCell>
                    <TableCell>{row.ingredientName}</TableCell>
                    <TableCell className="min-w-64">
                      <Select value={choice} onValueChange={(value) => setMaterialSelections((current) => ({ ...current, [sourceLabel]: value }))}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Choose or create" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={`${CREATE_PREFIX}${inventoryMaterialId(row.ingredientName)}`}>Create: {row.ingredientName}</SelectItem>
                          {materials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name} ({material.baseUnit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><CardTitle>3. Review source lines</CardTitle><CardDescription>Every row carries its original source reference; imported recipe lines are never inferred from blank cells.</CardDescription></div>
          <div className="w-full sm:w-64"><Label htmlFor="inventory-import-search" className="sr-only">Search source preview</Label><Input id="inventory-import-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source rows" /></div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Recipe target</TableHead><TableHead>Ingredient mapping</TableHead><TableHead>Qty / unit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {rowsWithQuery.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><span className="font-mono text-xs">{row.sourceRef}</span><span className="block text-xs text-muted-foreground">{row.ingredientSourceLabel}</span></TableCell>
                    <TableCell>{row.targetLabel}</TableCell>
                    <TableCell><span className="font-medium">{row.ingredientName}</span><span className="block text-xs text-muted-foreground">{row.ingredientType === "component" ? "prepared component" : "material"}</span></TableCell>
                    <TableCell className="tabular-nums">{row.amount === null ? "—" : row.amount} <span className="text-muted-foreground">{row.sourceUnit ?? "—"}</span>{row.unit && row.sourceUnit !== row.unit && <span className="block text-xs text-success">→ {row.unit}</span>}</TableCell>
                    <TableCell>{row.status === "ready" ? (rowIsApproved(row) ? statusBadge("approved") : statusBadge("mapping")) : statusBadge(row.status)}{row.reviewReason && <span className="mt-1 block max-w-52 whitespace-normal text-xs text-muted-foreground">{row.reviewReason}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{unresolvedRows + sourceNeedsReview === 0 ? "All importable rows are ready for a draft recipe import." : `${unresolvedRows + sourceNeedsReview} row${unresolvedRows + sourceNeedsReview === 1 ? "" : "s"} still need review.`}</p>
          <p className="mt-1 text-sm text-muted-foreground">Saving mappings is safe to do first. Creating recipes writes only foundation records, never stock movements.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={saveMappings} disabled={saving !== null}><Save className="size-4" />{saving === "mappings" ? "Saving…" : "Save mappings"}</Button>
          <Button onClick={commitFoundation} disabled={saving !== null || unresolvedRows > 0 || sourceNeedsReview > 0}><Upload className="size-4" />{saving === "foundation" ? "Creating drafts…" : "Create draft recipes"}</Button>
        </div>
      </div>

      {approvedRows.length > 0 && unresolvedRows + sourceNeedsReview === 0 && (
        <p className="flex items-center gap-2 text-sm text-success"><Check className="size-4" />{approvedRows.length} importable source lines are mapped and validated for Phase 1.</p>
      )}
    </div>
  );
}
