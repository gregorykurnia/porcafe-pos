"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveInventoryRecipeVersion } from "@/lib/data";
import { INVENTORY_UNITS, recipeStatusLabel, validateRecipe } from "@/lib/inventory";
import {
  INVENTORY_SOURCE_GROUPS,
  inventoryComponentId,
  inventoryRecipeId,
  slugifyInventoryId,
} from "@/lib/inventory-source";
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

function timestamp(): number {
  return Date.now();
}

function draftLineId(): string {
  return `draft-line-${timestamp()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newRecipe(menuItems: MenuItem[], recipes: InventoryRecipeVersion[]): InventoryRecipeVersion {
  const firstMenu = menuItems[0];
  const targetType: RecipeTargetType = firstMenu ? "menu_item" : "prepared_component";
  const targetId = firstMenu?.id ?? inventoryComponentId(INVENTORY_SOURCE_GROUPS.find((group) => group.targetType === "prepared_component")?.targetName ?? "New component");
  const targetName = firstMenu?.name ?? "New component";
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

function recipeBadge(status: InventoryRecipeVersion["status"]) {
  return <Badge variant={status === "active" ? "default" : status === "needs-review" ? "destructive" : "secondary"}>{recipeStatusLabel(status)}</Badge>;
}

export function Recipes({ menuItems, materials, recipes, recipeLines, onChanged }: RecipesProps) {
  const [draftRecipe, setDraftRecipe] = useState<InventoryRecipeVersion | null>(null);
  const [draftLines, setDraftLines] = useState<InventoryRecipeLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const componentOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const group of INVENTORY_SOURCE_GROUPS) {
      if (group.targetType === "prepared_component") options.set(inventoryComponentId(group.targetName), group.targetName);
    }
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

  function editRecipe(recipe: InventoryRecipeVersion) {
    setSelectedId(recipe.id);
    setDraftRecipe({ ...recipe });
    setDraftLines(recipeLines.filter((line) => line.recipeId === recipe.id).map((line) => ({ ...line })));
  }

  function startNewRecipe() {
    setSelectedId(null);
    setDraftRecipe(newRecipe(menuItems, recipes));
    setDraftLines([]);
  }

  function updateRecipe(patch: Partial<InventoryRecipeVersion>) {
    setDraftRecipe((current) => current ? { ...current, ...patch } : current);
  }

  function setTargetType(value: RecipeTargetType) {
    const targetId = value === "menu_item"
      ? menuItems[0]?.id ?? ""
      : componentOptions[0]?.[0] ?? "";
    const targetName = value === "menu_item"
      ? menuItems[0]?.name ?? ""
      : componentOptions[0]?.[1] ?? "";
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
    setDraftLines((current) => current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
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
  }

  async function saveRecipe() {
    if (!draftRecipe) return;
    if (!draftRecipe.targetId) {
      toast.error("Choose a recipe target before saving.");
      return;
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
    const lines = draftLines.map((line, index) => ({
      ...line,
      id: line.sourceRef ? `${recipeId}-line-${slugifyInventoryId(line.sourceRef)}` : line.id.startsWith("draft-line-") ? `${recipeId}-line-${index + 1}` : line.id,
      recipeId,
      createdAt: line.createdAt || now,
      updatedAt: now,
    }));
    const validation = validateRecipe(recipe, lines, materials, recipes, recipeLines);
    if (!validation.valid) {
      toast.error(validation.errors[0] ?? "Recipe needs review before saving.");
      return;
    }
    if (validation.warnings.length > 0) toast.warning(validation.warnings[0]);

    const oldLineIds = selectedId === recipeId ? recipeLines.filter((line) => line.recipeId === recipeId).map((line) => line.id) : [];
    const newLineIds = new Set(lines.map((line) => line.id));
    setSaving(true);
    try {
      await saveInventoryRecipeVersion(recipe, lines, { deleteLineIds: oldLineIds.filter((id) => !newLineIds.has(id)) });
      toast.success("Recipe version saved");
      setSelectedId(recipe.id);
      setDraftRecipe(recipe);
      setDraftLines(lines);
      await onChanged();
    } catch (error) {
      console.error("Failed to save recipe", error);
      toast.error(error instanceof Error ? error.message : "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.38fr)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Recipe versions</CardTitle><CardDescription>Draft and review versions are safe to edit; active versions should be copied forward.</CardDescription></div><Button size="icon-sm" variant="outline" onClick={startNewRecipe} aria-label="Create recipe"><Plus className="size-4" /></Button></div></CardHeader>
        <CardContent className="space-y-2">
          {recipes.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No recipe versions yet. Review the import or create one.</p>}
          {recipes.map((recipe) => (
            <button key={recipe.id} type="button" onClick={() => editRecipe(recipe)} className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === recipe.id ? "border-primary bg-primary/5" : "border-border/70"}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{recipe.targetName}</span>{recipeBadge(recipe.status)}</div>
              <p className="mt-1 text-xs text-muted-foreground">v{recipe.version} · {recipe.targetType === "menu_item" ? "Menu item" : "Prepared component"} · {recipe.basis === "batch" ? `Yield ${recipe.yieldQuantity ?? "—"} ${recipe.yieldUnit ?? ""}` : "Per portion"}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{draftRecipe ? `${draftRecipe.targetName || "New recipe"} · v${draftRecipe.version}` : "Recipe editor"}</CardTitle><CardDescription>Recipe lines retain source references where they came from the reviewed workbook preview.</CardDescription></CardHeader>
        <CardContent>
          {!draftRecipe ? (
            <div className="rounded-xl border border-dashed p-10 text-center"><p className="font-medium">Choose a version to edit</p><p className="mt-1 text-sm text-muted-foreground">Or use the plus button to define a new menu or prepared-component recipe.</p><Button className="mt-4" onClick={startNewRecipe}><Plus className="size-4" />New recipe</Button></div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Target type</Label><Select value={draftRecipe.targetType} onValueChange={(value) => setTargetType(value as RecipeTargetType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="menu_item">Menu item</SelectItem><SelectItem value="prepared_component">Prepared component</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Target</Label><Select value={draftRecipe.targetId} onValueChange={setTargetId}><SelectTrigger className="w-full"><SelectValue placeholder="Choose a target" /></SelectTrigger><SelectContent>{draftRecipe.targetType === "menu_item" ? menuItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>) : componentOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Status</Label><Select value={draftRecipe.status} onValueChange={(value) => updateRecipe({ status: value as RecipeVersionStatus })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["draft", "needs-review", "active", "retired"] as RecipeVersionStatus[]).map((status) => <SelectItem key={status} value={status}>{recipeStatusLabel(status)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Effective from</Label><Input type="date" value={draftRecipe.effectiveFrom ?? ""} onChange={(event) => updateRecipe({ effectiveFrom: event.target.value || null })} /></div>
              </div>

              {draftRecipe.targetType === "prepared_component" && <div className="rounded-xl border border-border/70 bg-surface/50 p-3"><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label>Component basis</Label><Select value={draftRecipe.basis} onValueChange={(value) => updateRecipe({ basis: value as RecipeBasis, yieldQuantity: value === "batch" ? draftRecipe.yieldQuantity : null, yieldUnit: value === "batch" ? draftRecipe.yieldUnit : null })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="per_portion">Per portion</SelectItem><SelectItem value="batch">Batch with yield</SelectItem></SelectContent></Select></div>{draftRecipe.basis === "batch" && <><div className="space-y-1.5"><Label>Yield quantity</Label><Input type="number" min="0" step="0.01" value={draftRecipe.yieldQuantity ?? ""} onChange={(event) => updateRecipe({ yieldQuantity: event.target.value ? Number(event.target.value) : null })} /></div><div className="space-y-1.5"><Label>Yield unit</Label><Select value={draftRecipe.yieldUnit ?? ""} onValueChange={(value) => updateRecipe({ yieldUnit: value as InventoryUnit })}><SelectTrigger className="w-full"><SelectValue placeholder="Choose unit" /></SelectTrigger><SelectContent>{INVENTORY_UNITS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></>}</div>{draftRecipe.basis === "per_portion" && <p className="mt-2 text-xs text-muted-foreground">This records the reviewed one-portion basis without inventing a batch yield.</p>}</div>}

              <div className="flex items-end justify-between gap-3"><div><h3 className="font-semibold">Recipe lines</h3><p className="text-sm text-muted-foreground">Every line needs a mapped material/component, positive quantity, and normalized unit.</p></div><Button size="sm" variant="outline" onClick={addLine}><Plus className="size-4" />Add line</Button></div>
              <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Ingredient / component</TableHead><TableHead className="w-28">Quantity</TableHead><TableHead className="w-40">Unit</TableHead><TableHead>Source</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{draftLines.map((line) => <TableRow key={line.id}><TableCell className="p-1"><Select value={`${line.ingredientType}:${line.ingredientId}`} onValueChange={(value) => { const [type, id] = value.split(":"); const option = ingredientOptions.find((candidate) => candidate.type === type && candidate.id === id); const material = type === "material" ? materials.find((candidate) => candidate.id === id) : null; updateLine(line.id, { ingredientType: type as "material" | "component", ingredientId: id, ingredientName: option?.name ?? line.ingredientName, unit: material?.baseUnit ?? line.unit ?? "g" }); }}><SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ingredientOptions.map((option) => <SelectItem key={option.key} value={option.key}>{option.name} <span className="text-xs text-muted-foreground">· {option.type}</span></SelectItem>)}</SelectContent></Select></TableCell><TableCell className="p-1"><Input type="number" min="0" step="0.01" value={line.quantity ?? ""} onChange={(event) => updateLine(line.id, { quantity: event.target.value ? Number(event.target.value) : null })} className="h-8 text-right" /></TableCell><TableCell className="p-1"><Select value={line.unit ?? ""} onValueChange={(value) => updateLine(line.id, { unit: value as InventoryUnit })}><SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Unit" /></SelectTrigger><SelectContent>{INVENTORY_UNITS.map((option) => <SelectItem key={option.value} value={option.value}>{option.value}</SelectItem>)}</SelectContent></Select></TableCell><TableCell className="text-xs text-muted-foreground">{line.sourceRef ?? "Manual"}{line.note && <span className="block">{line.note}</span>}</TableCell><TableCell className="p-1"><Button size="icon-sm" variant="ghost" onClick={() => removeLine(line.id)} aria-label={`Remove ${line.ingredientName}`}><Trash2 className="size-4 text-muted-foreground" /></Button></TableCell></TableRow>)}{draftLines.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No lines yet.</TableCell></TableRow>}</TableBody></Table></div>

              <div className="flex flex-col gap-3 rounded-xl border border-info/20 bg-info/5 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Active versions require an effective date. Prepared components only require a yield when marked as batch-based.</p><div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={duplicateAsNewVersion} disabled={!draftRecipe.id}><Copy className="size-4" />New version</Button><Button onClick={saveRecipe} disabled={saving}><Save className="size-4" />{saving ? "Saving…" : "Save recipe"}</Button></div></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
