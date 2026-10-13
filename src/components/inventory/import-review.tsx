"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Save, Upload } from "lucide-react";
import { Banner } from "@/components/patterns/banner";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { StatStrip } from "@/components/patterns/stat-strip";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { normalizeInventoryName, normalizeRecipeBoxLines, RECIPE_BOX_MATERIAL_ID, RECIPE_BOX_NAME, validateRecipe } from "@/lib/inventory";
import { importRowStatusView } from "@/lib/status";
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

type ImportRowStatus = "excluded" | "needs-review" | "approved" | "mapping";
type SourceGroup = (typeof INVENTORY_SOURCE_GROUPS)[number];

const SECTION_CLASS = "overflow-hidden rounded-xl border border-line bg-surface shadow-card";

/** An import row status with its word, shape and tone (DESIGN_SYSTEM §6, the Import row set). */
function importChip(status: ImportRowStatus) {
  const view = importRowStatusView(status);
  const tone: StatusTone = view.tone === "success" ? "ok" : view.tone === "warning" ? "warn" : view.tone === "info" ? "info" : "neutral";
  return <StatusChip tone={tone}>{view.label}</StatusChip>;
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
    const existingBox = materials.find((material) => material.id === RECIPE_BOX_MATERIAL_ID);
    byId.set(RECIPE_BOX_MATERIAL_ID, {
      id: RECIPE_BOX_MATERIAL_ID,
      name: RECIPE_BOX_NAME,
      normalizedName: "box",
      type: "packaging",
      baseUnit: "pcs",
      active: existingBox?.active ?? true,
      reviewStatus: "approved",
      sourceRefs: existingBox?.sourceRefs ?? [],
      createdAt: existingBox?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
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
      const lines = normalizeRecipeBoxLines(recipe, importableRows.map((row) => {
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
      }), timestamp);
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

  const blockedCount = unresolvedRows + sourceNeedsReview;
  const createBlocked = saving !== null || blockedCount > 0;
  const aliasRows = rawSourceLabels.map((sourceLabel) => ({
    sourceLabel,
    row: INVENTORY_SOURCE_ROWS.find((candidate) => candidate.ingredientSourceLabel === sourceLabel)!,
  }));

  function chooseMenuItem(groupId: string, value: string) {
    const conflictsWithAnotherGroup = INVENTORY_SOURCE_GROUPS.some(
      (candidate) => candidate.id !== groupId && candidate.targetType === "menu_item" && menuSelections[candidate.id] === value
    );
    if (conflictsWithAnotherGroup) {
      toast.error("Each source menu group must map to a different live menu item.");
      return;
    }
    setMenuSelections((current) => ({ ...current, [groupId]: value }));
  }

  const targetColumns: Column<SourceGroup>[] = [
    {
      key: "label",
      label: "Source label",
      phone: "title",
      cell: (group) => (
        <>
          <span className="font-medium">{group.targetLabel}</span>
          <span className="text-small text-ink-muted"> · group {group.id}</span>
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      phone: "figure",
      cell: (group) => {
        const selected = targetIdForRow(sourceRowsForGroup(group.id)[0]);
        return importChip(conflictingMenuGroups.has(group.id) ? "needs-review" : selected ? "approved" : "mapping");
      },
    },
    {
      key: "planned",
      label: "Planned target",
      phone: "meta",
      cell: (group) => (group.targetName !== group.targetLabel ? group.targetName : "—"),
    },
    {
      key: "target",
      label: "Live menu item",
      phone: "detail",
      cellClassName: "min-w-56 whitespace-normal",
      cell: (group) =>
        group.targetType === "prepared_component" ? (
          <p className="text-small text-ink-muted">
            Prepared component ID: <span className="font-mono text-micro">{inventoryComponentId(group.targetName)}</span>
          </p>
        ) : (
          <div className="space-y-1.5">
            <Select value={menuSelections[group.id] ?? ""} onValueChange={(value) => chooseMenuItem(group.id, value)}>
              <SelectTrigger aria-label={`Live menu item for ${group.targetLabel}`} className="w-full">
                <SelectValue placeholder="Choose a live menu item" />
              </SelectTrigger>
              <SelectContent>
                {menuItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conflictingMenuGroups.has(group.id) ? <p className="text-small text-danger">This menu item is already assigned to another source group.</p> : null}
          </div>
        ),
    },
  ];

  const aliasColumns: Column<(typeof aliasRows)[number]>[] = [
    {
      key: "source",
      label: "Source label",
      phone: "title",
      cell: ({ sourceLabel, row }) => (
        <>
          <span className="font-medium">{sourceLabel}</span>
          <span className="text-small text-ink-muted"> · {row.sourceRef}</span>
        </>
      ),
    },
    { key: "canonical", label: "Canonical target", phone: "meta", cell: ({ row }) => row.ingredientName },
    {
      key: "material",
      label: "Material",
      phone: "detail",
      cellClassName: "min-w-64",
      cell: ({ sourceLabel, row }) => {
        const choice = materialSelections[sourceLabel] ?? "";
        return (
          <Select value={choice} onValueChange={(value) => setMaterialSelections((current) => ({ ...current, [sourceLabel]: value }))}>
            <SelectTrigger aria-label={`Material for ${sourceLabel}`} className="w-full">
              <SelectValue placeholder="Choose or create" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={`${CREATE_PREFIX}${inventoryMaterialId(row.ingredientName)}`}>Create: {row.ingredientName}</SelectItem>
              {materials.map((material) => (
                <SelectItem key={material.id} value={material.id}>{material.name} ({material.baseUnit})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
  ];

  const lineColumns: Column<InventorySourceRow>[] = [
    {
      key: "source",
      label: "Source",
      phone: "detail",
      cell: (row) => (
        <>
          <span className="font-mono text-micro">{row.sourceRef}</span>
          <span className="text-ink-muted"> · {row.ingredientSourceLabel}</span>
        </>
      ),
    },
    { key: "target", label: "Recipe target", phone: "meta", cell: (row) => row.targetLabel },
    {
      key: "ingredient",
      label: "Ingredient mapping",
      phone: "title",
      cell: (row) => (
        <>
          <span className="font-medium">{row.ingredientName}</span>
          <span className="text-small text-ink-muted"> · {row.ingredientType === "component" ? "prepared component" : "material"}</span>
        </>
      ),
    },
    {
      key: "qty",
      label: "Qty / unit",
      align: "right",
      phone: "figure",
      cell: (row) => (
        <>
          {row.amount === null ? "—" : row.amount} <span className="text-ink-muted">{row.sourceUnit ?? "—"}</span>
          {row.unit && row.sourceUnit !== row.unit ? <span className="block text-small text-ink-muted">→ {row.unit}</span> : null}
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      phone: "detail",
      cell: (row) => (
        <>
          {row.status === "ready" ? importChip(rowIsApproved(row) ? "approved" : "mapping") : importChip(row.status)}
          {row.reviewReason ? <span className="mt-1 block max-w-52 whitespace-normal text-small text-ink-muted">{row.reviewReason}</span> : null}
        </>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Banner tone="info">
        <p className="font-medium">Reviewed source preview only</p>
        <p className="mt-1 text-small">
          This preview is bounded to {INVENTORY_SOURCE_BOUNDARY}. Blank quantities are review issues; packaging and the two explicitly ignored ingredients stay excluded.
        </p>
        <p className="mt-1 text-small font-medium">No inventory deductions.</p>
      </Banner>

      <StatStrip
        label="Import summary"
        cells={[
          { label: "Source rows", value: INVENTORY_SOURCE_ROWS.length },
          { label: "Ready after mapping", value: approvedRows.length },
          { label: "Source review", value: sourceNeedsReview },
          { label: "Excluded by policy", value: excludedRows },
        ]}
      />

      <section aria-labelledby="import-step-1" className={SECTION_CLASS}>
        <div className="p-4 desk:px-6">
          <h2 id="import-step-1" className="font-display text-title-2 text-ink">1. Confirm menu and component targets</h2>
          <p className="mt-1 text-small text-ink-muted">Source labels stay visible in the alias mapping so the import can be audited later.</p>
        </div>
        <DataTable caption="Menu and component targets" columns={targetColumns} rows={[...INVENTORY_SOURCE_GROUPS]} getKey={(group) => group.id} density="comfortable" />
      </section>

      <section aria-labelledby="import-step-2" className={SECTION_CLASS}>
        <div className="p-4 desk:px-6">
          <h2 id="import-step-2" className="font-display text-title-2 text-ink">2. Confirm material aliases</h2>
          <p className="mt-1 text-small text-ink-muted">New materials are listed here and can be edited in Materials before use.</p>
        </div>
        <DataTable caption="Material aliases" columns={aliasColumns} rows={aliasRows} getKey={(entry) => entry.sourceLabel} density="comfortable" />
      </section>

      <section aria-labelledby="import-step-3" className={SECTION_CLASS}>
        <div className="flex flex-col gap-3 p-4 desk:flex-row desk:items-end desk:justify-between desk:px-6">
          <div>
            <h2 id="import-step-3" className="font-display text-title-2 text-ink">3. Review source lines</h2>
            <p className="mt-1 text-small text-ink-muted">Every row carries its original source reference. Imported recipe lines are never inferred from blank cells.</p>
          </div>
          <div className="w-full desk:w-72">
            <label htmlFor="inventory-import-search" className="sr-only">Search source rows</label>
            <Input id="inventory-import-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source rows" />
          </div>
        </div>
        <DataTable
          caption="Source lines"
          columns={lineColumns}
          rows={rowsWithQuery}
          getKey={(row) => row.id}
          density="comfortable"
          empty={<EmptyState title="No source rows match">Try a material, a menu item or a source reference.</EmptyState>}
        />
      </section>

      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card desk:flex-row desk:items-center desk:justify-between desk:p-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">
            {blockedCount === 0 ? <ToneShape tone="ok" className="text-ok" /> : <ToneShape tone="warn" className="text-warn-mark" />}
            {blockedCount === 0 ? "All importable rows are ready for a draft recipe import." : `${blockedCount} row${blockedCount === 1 ? "" : "s"} still need review.`}
          </p>
          <p className="mt-1 text-small text-ink-muted">Saving mappings is safe to do first. Creating draft recipes never changes stock.</p>
        </div>
        <div className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-end">
          {blockedCount > 0 ? <p className="text-small text-ink-muted tablet:mr-2">Blocked until every row is ready.</p> : null}
          <Button variant="secondary" onClick={saveMappings} loading={saving === "mappings"} disabled={saving !== null}>
            <Save strokeWidth={1.5} aria-hidden="true" />
            {saving === "mappings" ? "Saving…" : "Save mappings"}
          </Button>
          <Button onClick={commitFoundation} loading={saving === "foundation"} disabled={createBlocked}>
            <Upload strokeWidth={1.5} aria-hidden="true" />
            {saving === "foundation" ? "Creating drafts…" : "Create draft recipes"}
          </Button>
        </div>
      </div>

      {approvedRows.length > 0 && blockedCount === 0 ? (
        <p className="flex items-center gap-2 text-small text-ink-muted">
          <ToneShape tone="ok" className="text-ok" />
          {approvedRows.length} importable source lines are mapped and validated for Phase 1.
        </p>
      ) : null}
    </div>
  );
}
