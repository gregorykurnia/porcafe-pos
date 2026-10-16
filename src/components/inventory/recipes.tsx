"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Plus, Save, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/patterns/states";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { UnsavedGuardDialog } from "@/components/patterns/dialogs";
import { Banner } from "@/components/patterns/banner";
import { FieldRow } from "@/components/fields/field-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { toast } from "@/lib/toast";
import { saveInventoryRecipeVersion } from "@/lib/data";
import { INVENTORY_UNITS, normalizeRecipeBoxLines, validateRecipe } from "@/lib/inventory";
import {
  INVENTORY_COMPONENT_TARGET_NAMES,
  inventoryComponentId,
  inventoryRecipeId,
  slugifyInventoryId,
} from "@/lib/inventory-source";
import { recipeStatusView, reviewStatusView } from "@/lib/status";
import { cn } from "@/lib/utils";
import type {
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  InventoryUnit,
  MenuItem,
  RecipeBasis,
  RecipeTargetType,
  RecipeVersionStatus,
} from "@/lib/types";

type RecipesProps = {
  menuItems: MenuItem[];
  materials: InventoryMaterial[];
  recipes: InventoryRecipeVersion[];
  recipeLines: InventoryRecipeLine[];
  onChanged: () => Promise<void>;
};

/** Recipe statuses use the Canopy tones of DESIGN_SYSTEM §6: Active ok, Draft info, Needs review warn, Retired neutral. */
const RECIPE_TONE: Record<InventoryRecipeVersion["status"], StatusTone> = {
  active: "ok",
  draft: "info",
  "needs-review": "warn",
  retired: "neutral",
};

/**
 * The line grid. Desk: ingredient, quantity, unit and remove on the first line, then the source and review beneath.
 * Phone and tablet: the ingredient and remove first, then quantity and unit, source and review.
 */
const NEW_COMPONENT = "__new-component__";

const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 gap-y-2 desk:grid-cols-[minmax(0,1fr)_112px_96px_44px] desk:gap-x-3";

function timestamp(): number {
  return Date.now();
}

function draftLineId(): string {
  return `draft-line-${timestamp()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newRecipe(menuItems: MenuItem[], recipes: InventoryRecipeVersion[]): InventoryRecipeVersion {
  const firstMenu = menuItems[0];
  const targetType: RecipeTargetType = firstMenu ? "menu_item" : "prepared_component";
  const defaultComponentName = INVENTORY_COMPONENT_TARGET_NAMES[0] ?? "New component";
  const targetId = firstMenu?.id ?? inventoryComponentId(defaultComponentName);
  const targetName = firstMenu?.name ?? defaultComponentName;
  const version = Math.max(0, ...recipes.filter((recipe) => recipe.targetId === targetId).map((recipe) => recipe.version)) + 1;
  const now = timestamp();
  return {
    id: "",
    targetType,
    targetId,
    targetName,
    version,
    status: "draft",
    basis: "per_portion",
    effectiveFrom: null,
    yieldQuantity: null,
    yieldUnit: null,
    reviewStatus: "approved",
    sourceRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** What the editor would save, without ids and timestamps. The draft is unsaved when this differs from the saved copy. */
function recipeSnapshot(recipe: InventoryRecipeVersion | null, lines: InventoryRecipeLine[]): string {
  return JSON.stringify([
    recipe
      ? [recipe.id, recipe.targetType, recipe.targetId, recipe.targetName, recipe.version, recipe.status, recipe.basis, recipe.effectiveFrom, recipe.yieldQuantity, recipe.yieldUnit]
      : null,
    lines.map((line) => [line.ingredientType, line.ingredientId, line.ingredientName, line.quantity, line.unit, line.sourceRef, line.note ?? null, line.reviewStatus]),
  ]);
}

function basisText(recipe: Pick<InventoryRecipeVersion, "basis" | "yieldQuantity" | "yieldUnit">): string {
  return recipe.basis === "batch" ? `Yield ${recipe.yieldQuantity ?? "—"} ${recipe.yieldUnit ?? ""}`.trim() : "Per portion";
}

function recipeLineApprovalIssue(
  line: InventoryRecipeLine,
  materials: InventoryMaterial[],
  recipes: InventoryRecipeVersion[]
): string | null {
  if (!line.ingredientId || !line.ingredientName.trim()) return "Choose an ingredient or component first.";
  if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    return "Enter a positive quantity before approving this line.";
  }
  if (!line.unit) return "Choose a unit before approving this line.";

  if (line.ingredientType === "material") {
    const material = materials.find((candidate) => candidate.id === line.ingredientId);
    if (!material) return "This material no longer exists. Choose another mapping.";
    if (material.reviewStatus !== "approved" || !material.active) {
      return `${material.name} must be approved and active before this mapping can be used.`;
    }
    if (material.baseUnit !== line.unit) {
      return `${material.name} is stored in ${material.baseUnit}; change the recipe line to that unit.`;
    }
  } else if (!recipes.some((recipe) => recipe.targetType === "prepared_component" && recipe.targetId === line.ingredientId)) {
    return `${line.ingredientName} needs a prepared-component recipe before this mapping can be approved.`;
  }

  return null;
}

export function Recipes({ menuItems, materials, recipes, recipeLines, onChanged }: RecipesProps) {
  const [draftRecipe, setDraftRecipe] = useState<InventoryRecipeVersion | null>(null);
  const [draftLines, setDraftLines] = useState<InventoryRecipeLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The saved copy the draft is compared with. Null means the draft has no saved copy yet (a copied version).
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  // An in-page choice (another version, a new recipe) that waits for the unsaved-changes dialog.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  // The name being typed for a brand-new prepared component. Null means the target is picked from the list.
  const [newComponentName, setNewComponentName] = useState<string | null>(null);

  const dirty = draftRecipe !== null && recipeSnapshot(draftRecipe, draftLines) !== savedSnapshot;
  // Nav links, browser back and forward, reload and tab close are guarded by the shared provider.
  useUnsavedChangesGuard({
    dirty,
    message: `You have unsaved changes to ${draftRecipe?.targetName || "this recipe"}. Save the recipe to keep them.`,
    onSave: () => saveRecipe(),
  });

  const componentOptions = useMemo(() => {
    const options = new Map(INVENTORY_COMPONENT_TARGET_NAMES.map((name) => [inventoryComponentId(name), name]));
    for (const recipe of recipes) {
      if (recipe.targetType === "prepared_component") options.set(recipe.targetId, recipe.targetName);
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [recipes]);

  const ingredientOptions = useMemo(() => {
    const components = componentOptions.map(([id, name]) => ({ key: `component:${id}`, id, name, type: "component" as const }));
    const materialOptions = materials.map((material) => ({ key: `material:${material.id}`, id: material.id, name: material.name, type: "material" as const }));
    return [...materialOptions, ...components].sort((a, b) => a.name.localeCompare(b.name));
  }, [componentOptions, materials]);

  // Runs `action` now, or after the user has chosen what to do with the unsaved draft.
  function leaveThen(action: () => void) {
    if (!dirty) {
      action();
      return;
    }
    setLeaveError(null);
    setPendingLeave(() => action);
  }

  function editRecipe(recipe: InventoryRecipeVersion) {
    setNewComponentName(null);
    const lines = normalizeRecipeBoxLines(recipe, recipeLines.filter((line) => line.recipeId === recipe.id).map((line) => ({ ...line })));
    setSelectedId(recipe.id);
    setDraftRecipe({ ...recipe });
    setDraftLines(lines);
    setSavedSnapshot(recipeSnapshot(recipe, lines));
  }

  function startNewRecipe() {
    const recipe = newRecipe(menuItems, recipes);
    setNewComponentName(null);
    setSelectedId(null);
    setDraftRecipe(recipe);
    setDraftLines([]);
    setSavedSnapshot(recipeSnapshot(recipe, []));
  }

  function updateRecipe(patch: Partial<InventoryRecipeVersion>) {
    setDraftRecipe((current) => current ? { ...current, ...patch } : current);
  }

  function setTargetType(value: RecipeTargetType) {
    setNewComponentName(null);
    const defaultComponent = componentOptions.find(([, name]) => name === "Rice") ?? componentOptions[0];
    const targetId = value === "menu_item"
      ? menuItems[0]?.id ?? ""
      : defaultComponent?.[0] ?? "";
    const targetName = value === "menu_item"
      ? menuItems[0]?.name ?? ""
      : defaultComponent?.[1] ?? "";
    const version = Math.max(0, ...recipes.filter((recipe) => recipe.targetId === targetId).map((recipe) => recipe.version)) + 1;
    updateRecipe({
      id: "",
      targetType: value,
      targetId,
      targetName,
      version,
      basis: value === "menu_item" ? "per_portion" : "per_portion",
      yieldQuantity: null,
      yieldUnit: null,
      status: "draft",
    });
    setDraftLines([]);
  }

  function setTargetId(value: string) {
    if (!draftRecipe) return;
    const targetName = draftRecipe.targetType === "menu_item"
      ? menuItems.find((item) => item.id === value)?.name ?? ""
      : componentOptions.find(([id]) => id === value)?.[1] ?? "";
    const version = Math.max(0, ...recipes.filter((recipe) => recipe.targetId === value).map((recipe) => recipe.version)) + 1;
    updateRecipe({ targetId: value, targetName, version, id: "" });
  }

  function startNewComponent() {
    setNewComponentName("");
    updateRecipe({ id: "", targetId: "", targetName: "", version: 1, status: "draft" });
  }

  function setNewComponent(name: string) {
    setNewComponentName(name);
    const trimmed = name.trim();
    const targetId = slugifyInventoryId(trimmed) ? inventoryComponentId(trimmed) : "";
    const version = Math.max(0, ...recipes.filter((recipe) => recipe.targetId === targetId).map((recipe) => recipe.version)) + 1;
    updateRecipe({ id: "", targetId, targetName: trimmed, version });
  }

  function addLine() {
    if (!draftRecipe) return;
    const first = ingredientOptions[0];
    if (!first) {
      toast.error("Add a material or component before adding a recipe line.");
      return;
    }
    const material = first.type === "material" ? materials.find((candidate) => candidate.id === first.id) : null;
    setDraftLines((current) => [
      ...current,
      {
        id: draftLineId(),
        recipeId: draftRecipe.id,
        ingredientType: first.type,
        ingredientId: first.id,
        ingredientName: first.name,
        quantity: null,
        unit: material?.baseUnit ?? "g",
        sourceRef: null,
        reviewStatus: "needs-review",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      },
    ]);
  }

  function updateLine(lineId: string, patch: Partial<InventoryRecipeLine>) {
    setDraftLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const mappingChanged = (["ingredientType", "ingredientId", "quantity", "unit"] as const)
        .some((key) => key in patch && patch[key] !== line[key]);
      return {
        ...line,
        ...patch,
        ...(mappingChanged ? { reviewStatus: "needs-review" as const } : {}),
      };
    }));
  }

  function approveLine(line: InventoryRecipeLine) {
    const issue = recipeLineApprovalIssue(line, materials, recipes);
    if (issue) {
      toast.error(issue);
      return;
    }
    updateLine(line.id, { reviewStatus: "approved" });
    toast.success(`${line.ingredientName} approved. Save recipe to keep this change.`);
  }

  function removeLine(lineId: string) {
    setDraftLines((current) => current.filter((line) => line.id !== lineId));
  }

  function duplicateAsNewVersion() {
    if (!draftRecipe) return;
    const version = Math.max(0, ...recipes.filter((recipe) => recipe.targetId === draftRecipe.targetId).map((recipe) => recipe.version)) + 1;
    const now = timestamp();
    setSelectedId(null);
    setDraftRecipe({ ...draftRecipe, id: "", version, status: "draft", reviewStatus: "approved", createdAt: now, updatedAt: now });
    setDraftLines((current) => current.map((line) => ({ ...line, id: draftLineId(), recipeId: "", createdAt: now, updatedAt: now })));
    // A copied version has no saved copy yet, so it counts as unsaved until it is saved.
    setSavedSnapshot(null);
  }

  // Resolves true only when the recipe was saved. The unsaved-changes guard uses this to decide whether to leave.
  async function saveRecipe(): Promise<boolean> {
    if (!draftRecipe) return false;
    if (!draftRecipe.targetId) {
      toast.error(newComponentName !== null ? "Name the new component before saving." : "Choose a recipe target before saving.");
      return false;
    }
    const version = draftRecipe.version || 1;
    const recipeId = draftRecipe.id || inventoryRecipeId(draftRecipe.targetType, draftRecipe.targetId, version);
    const now = timestamp();
    const recipe: InventoryRecipeVersion = {
      ...draftRecipe,
      id: recipeId,
      version,
      reviewStatus: draftRecipe.status === "needs-review" ? "needs-review" : "approved",
      createdAt: draftRecipe.createdAt || now,
      updatedAt: now,
    };
    const lines = normalizeRecipeBoxLines(recipe, draftLines.map((line, index) => ({
      ...line,
      id: line.sourceRef ? `${recipeId}-line-${slugifyInventoryId(line.sourceRef)}` : line.id.startsWith("draft-line-") ? `${recipeId}-line-${index + 1}` : line.id,
      recipeId,
      createdAt: line.createdAt || now,
      updatedAt: now,
    })), now);
    const validation = validateRecipe(recipe, lines, materials, recipes, recipeLines);
    if (!validation.valid) {
      toast.error(validation.errors[0] ?? "Recipe needs review before saving.");
      return false;
    }
    if (validation.warnings.length > 0) toast.warning(validation.warnings[0]);

    const oldLineIds = selectedId === recipeId ? recipeLines.filter((line) => line.recipeId === recipeId).map((line) => line.id) : [];
    const newLineIds = new Set(lines.map((line) => line.id));
    setSaving(true);
    try {
      await saveInventoryRecipeVersion(recipe, lines, { deleteLineIds: oldLineIds.filter((id) => !newLineIds.has(id)) });
      toast.success("Recipe version saved");
      setSelectedId(recipe.id);
      setNewComponentName(null);
      setDraftRecipe(recipe);
      setDraftLines(lines);
      setSavedSnapshot(recipeSnapshot(recipe, lines));
      await onChanged();
      return true;
    } catch (error) {
      console.error("Failed to save recipe", error);
      toast.error(error instanceof Error ? error.message : "Failed to save recipe");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const targetOptions = draftRecipe?.targetType === "menu_item"
    ? menuItems.map((item) => ({ value: item.id, label: item.name }))
    : componentOptions.map(([id, name]) => ({ value: id, label: name }));

  return (
    <div className="grid gap-5 desk:grid-cols-[300px_minmax(0,1fr)] desk:items-start">
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-label="Recipe versions">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4 desk:px-5">
          <div className="min-w-0">
            <h2 className="font-display text-title-2 text-ink">Recipe versions</h2>
            <p className="mt-1 text-small text-ink-muted">Draft and review versions are safe to edit; active versions should be copied forward.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => leaveThen(startNewRecipe)} className="shrink-0">
            <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
            New recipe
          </Button>
        </div>
        {recipes.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No recipe versions yet">Review the import or create one.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recipes.map((recipe) => {
              const selected = selectedId === recipe.id;
              return (
                <li key={recipe.id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => leaveThen(() => editRecipe(recipe))}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas desk:px-5",
                      selected && "bg-brand-soft hover:bg-brand-soft"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-table font-semibold text-ink">{recipe.targetName}</span>
                      <span className="mt-0.5 block text-small text-ink-muted">
                        v{recipe.version} · {recipe.targetType === "menu_item" ? "Menu item" : "Prepared component"} · {basisText(recipe)}
                      </span>
                    </span>
                    <StatusChip tone={RECIPE_TONE[recipe.status]}>{recipeStatusView(recipe.status).label}</StatusChip>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-label="Recipe editor">
        {!draftRecipe ? (
          <div className="p-6 desk:p-8">
            <EmptyState
              title="Choose a version to edit"
              action={
                <Button onClick={() => leaveThen(startNewRecipe)}>
                  <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  New recipe
                </Button>
              }
            >
              Or use New recipe to define a new menu or prepared-component recipe.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b border-line p-4 desk:px-6 desk:pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-title-2 text-ink">{draftRecipe.targetName || "New recipe"} · v{draftRecipe.version}</h2>
                    <StatusChip tone={RECIPE_TONE[draftRecipe.status]} header>
                      {recipeStatusView(draftRecipe.status).label}
                    </StatusChip>
                  </div>
                  <p className="mt-1 text-small text-ink-muted">
                    Basis: <span className="font-medium text-ink">{basisText(draftRecipe)}</span>
                    {draftRecipe.targetType === "menu_item" ? " · menu recipes are always per portion." : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={duplicateAsNewVersion} disabled={!draftRecipe.id || saving}>
                    <Copy className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    New version
                  </Button>
                  <Button loading={saving} disabled={saving} onClick={() => void saveRecipe()}>
                    <Save className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    {saving ? "Saving…" : "Save recipe"}
                  </Button>
                </div>
              </div>
              {dirty && (
                <p className="flex items-center gap-1.5 text-small font-medium text-warn" role="status">
                  <ToneShape tone="warn" className="size-3" />
                  Unsaved changes — save recipe to keep them.
                </p>
              )}
            </div>

            <div className="grid gap-4 p-4 tablet:grid-cols-2 desk:px-6">
              <FieldRow label="Target type">
                {() => (
                  <SegmentedControl
                    label="Target type"
                    value={draftRecipe.targetType}
                    options={[
                      { value: "menu_item", label: "Menu item" },
                      { value: "prepared_component", label: "Prepared component" },
                    ]}
                    onChange={(value) => setTargetType(value)}
                  />
                )}
              </FieldRow>
              <FieldRow label="Target">
                {(id) => (
                  <Select
                    value={newComponentName !== null ? NEW_COMPONENT : draftRecipe.targetId}
                    onValueChange={(value) => {
                      if (value === NEW_COMPONENT) startNewComponent();
                      else {
                        setNewComponentName(null);
                        setTargetId(value);
                      }
                    }}
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue placeholder="Choose a target" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {draftRecipe.targetType === "prepared_component" && (
                        <SelectItem value={NEW_COMPONENT}>+ New component…</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </FieldRow>
              {draftRecipe.targetType === "prepared_component" && newComponentName !== null && (
                <FieldRow
                  label="New component name"
                  hint={
                    draftRecipe.version > 1
                      ? `${draftRecipe.targetName} already has a recipe. Saving adds version ${draftRecipe.version}.`
                      : "Once saved, it can be used as an ingredient in other recipes."
                  }
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={newComponentName}
                      onChange={(event) => setNewComponent(event.target.value)}
                      placeholder="e.g. Pickled Cucumber"
                      autoFocus
                    />
                  )}
                </FieldRow>
              )}
              <FieldRow label="Status">
                {(id) => (
                  <Select value={draftRecipe.status} onValueChange={(value) => updateRecipe({ status: value as RecipeVersionStatus })}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["draft", "needs-review", "active", "retired"] as RecipeVersionStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {recipeStatusView(status).label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldRow>
              <FieldRow label="Effective from" hint="Needed before it can be Active.">
                {(id) => (
                  <Input id={id} type="date" value={draftRecipe.effectiveFrom ?? ""} onChange={(event) => updateRecipe({ effectiveFrom: event.target.value || null })} />
                )}
              </FieldRow>
            </div>

            {draftRecipe.targetType === "prepared_component" && (
              <div className="mx-4 mb-4 space-y-4 rounded-lg border border-line bg-canvas p-4 desk:mx-6">
                <div className="grid gap-4 tablet:grid-cols-3">
                  <FieldRow label="Component basis">
                    {(id) => (
                      <Select
                        value={draftRecipe.basis}
                        onValueChange={(value) => updateRecipe({
                          basis: value as RecipeBasis,
                          yieldQuantity: value === "batch" ? draftRecipe.yieldQuantity : null,
                          yieldUnit: value === "batch" ? draftRecipe.yieldUnit : null,
                        })}
                      >
                        <SelectTrigger id={id} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per_portion">Per portion</SelectItem>
                          <SelectItem value="batch">Batch with yield</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </FieldRow>
                  {draftRecipe.basis === "batch" && (
                    <>
                      <FieldRow label="Yield quantity">
                        {(id) => (
                          <Input
                            id={id}
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftRecipe.yieldQuantity ?? ""}
                            onChange={(event) => updateRecipe({ yieldQuantity: event.target.value ? Number(event.target.value) : null })}
                          />
                        )}
                      </FieldRow>
                      <FieldRow label="Yield unit">
                        {(id) => (
                          <Select value={draftRecipe.yieldUnit ?? ""} onValueChange={(value) => updateRecipe({ yieldUnit: value as InventoryUnit })}>
                            <SelectTrigger id={id} className="w-full">
                              <SelectValue placeholder="Choose unit" />
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
                    </>
                  )}
                </div>
                {draftRecipe.basis === "per_portion" && (
                  <p className="text-small text-ink-muted">This records the reviewed one-portion basis without inventing a batch yield.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line px-4 pt-5 desk:px-6">
              <div className="min-w-0">
                <h3 className="font-display text-title-3 text-ink">Recipe lines</h3>
                <p className="text-small text-ink-muted">Review each mapping, quantity, and unit, then approve the line before saving.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={addLine}>
                <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Add line
              </Button>
            </div>

            <div className="mt-3 border-t border-line">
              {draftLines.length === 0 ? (
                <p className="px-4 py-8 text-center text-small text-ink-muted">No lines yet.</p>
              ) : (
                <ul className="divide-y divide-line" aria-label="Recipe lines">
                  {draftLines.map((line) => {
                    const approvalIssue = recipeLineApprovalIssue(line, materials, recipes);
                    const approved = line.reviewStatus === "approved" && !approvalIssue;
                    return (
                      <li key={line.id} className="px-4 py-3 desk:px-6 desk:py-2">
                        <div className={LINE_GRID}>
                          <div className="row-start-1 col-start-1 min-w-0">
                            <Select
                              value={`${line.ingredientType}:${line.ingredientId}`}
                              onValueChange={(value) => {
                                const [type, id] = value.split(":");
                                const option = ingredientOptions.find((candidate) => candidate.type === type && candidate.id === id);
                                const material = type === "material" ? materials.find((candidate) => candidate.id === id) : null;
                                updateLine(line.id, {
                                  ingredientType: type as "material" | "component",
                                  ingredientId: id,
                                  ingredientName: option?.name ?? line.ingredientName,
                                  unit: material?.baseUnit ?? line.unit ?? "g",
                                });
                              }}
                            >
                              <SelectTrigger aria-label={`Ingredient for this line, ${line.ingredientName}`} className="w-full min-w-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ingredientOptions.map((option) => (
                                  <SelectItem key={option.key} value={option.key}>
                                    {option.name} <span className="text-small text-ink-muted">· {option.type}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 desk:contents">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.quantity ?? ""}
                              onChange={(event) => updateLine(line.id, { quantity: event.target.value ? Number(event.target.value) : null })}
                              className="text-right desk:col-start-2 desk:row-start-1"
                              aria-label={`Quantity for ${line.ingredientName}`}
                            />
                            <Select value={line.unit ?? ""} onValueChange={(value) => updateLine(line.id, { unit: value as InventoryUnit })}>
                              <SelectTrigger aria-label={`Unit for ${line.ingredientName}`} className="w-full min-w-0 desk:col-start-3 desk:row-start-1">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {INVENTORY_UNITS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-2 min-w-0 text-small text-ink-muted [overflow-wrap:anywhere] desk:col-span-1 desk:col-start-1 desk:row-start-2">
                            {line.sourceRef ?? "Manual"}
                            {line.note && <span className="block">{line.note}</span>}
                          </div>

                          <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 desk:col-span-3 desk:col-start-2 desk:row-start-2">
                            {approved ? (
                              <StatusChip tone="ok">{reviewStatusView("approved").label}</StatusChip>
                            ) : (
                              <>
                                <StatusChip tone="warn">{reviewStatusView("needs-review").label}</StatusChip>
                                <Button variant="secondary" size="sm" onClick={() => approveLine(line)}>
                                  <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
                                  Approve
                                </Button>
                                {approvalIssue && <p className="w-full text-micro font-semibold text-danger">{approvalIssue}</p>}
                              </>
                            )}
                          </div>

                          <div className="row-start-1 col-start-2 desk:col-start-4">
                            <Button variant="ghost" size="icon-sm" onClick={() => removeLine(line.id)} aria-label={`Remove ${line.ingredientName}`}>
                              <Trash2 className="text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-line px-4 py-3 desk:px-6">
              <Banner tone="info">Active versions require an effective date. Prepared components only require a yield when marked as batch-based.</Banner>
            </div>
          </>
        )}
      </section>

      <UnsavedGuardDialog
        open={pendingLeave !== null}
        saving={leaveSaving}
        error={leaveError}
        onSaveAndContinue={async () => {
          const action = pendingLeave;
          setLeaveSaving(true);
          const saved = await saveRecipe();
          setLeaveSaving(false);
          if (!saved) {
            setLeaveError("The recipe wasn't saved, so it is still open with your changes. Fix the message above and try again.");
            return;
          }
          setPendingLeave(null);
          action?.();
        }}
        onStay={() => setPendingLeave(null)}
        onDiscard={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          action?.();
        }}
      />
    </div>
  );
}
