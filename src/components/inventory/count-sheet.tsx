"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordInventoryStockCounts } from "@/lib/data";
import { formatDisplay, todayISO } from "@/lib/dates";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from "@/lib/session-draft";
import { countDraftKey, countVariance, parseCountQuantity } from "@/lib/stock-count";
import type { InventoryMaterial } from "@/lib/types";

type CountLine = { counted: string; reason: string };

function signed(value: number, unit: string): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatInventoryUsageQuantity(Math.abs(value))} ${unit}`;
}

/**
 * Counts many materials in one sheet. Each row shows the system balance, the counted
 * amount and the difference. Entries are kept on this phone until saved.
 */
export function CountSheet({
  materials,
  systemTotals,
  onSaved,
}: {
  materials: InventoryMaterial[];
  systemTotals: Record<string, number>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Record<string, CountLine>>({});
  const [saving, setSaving] = useState(false);
  const today = todayISO();
  const draftKey = countDraftKey(today);

  const rows = useMemo(
    () => materials
      .filter((material) => material.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [materials, query]
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reading the draft here, in the open handler, keeps unsaved counts across reloads.
    if (next) setLines(readSessionDraft<Record<string, CountLine>>(draftKey)?.value ?? {});
  }

  function updateLine(materialId: string, patch: Partial<CountLine>) {
    const current = lines[materialId] ?? { counted: "", reason: "" };
    const next = { ...lines, [materialId]: { ...current, ...patch } };
    setLines(next);
    writeSessionDraft(draftKey, next);
  }

  async function saveSheet() {
    const entries: Parameters<typeof recordInventoryStockCounts>[0] = [];
    for (const material of materials) {
      const line = lines[material.id];
      if (!line || line.counted.trim() === "") continue;
      const observed = parseCountQuantity(line.counted);
      if (observed === null) {
        toast.error(`Check the count for ${material.name}.`);
        return;
      }
      if (countVariance(systemTotals[material.id] ?? 0, observed).needsReason && !line.reason.trim()) {
        toast.error(`${material.name} differs by more than 20 %. Add a reason for it.`);
        return;
      }
      entries.push({
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        observedQuantity: observed,
        occurredOn: today,
        reason: line.reason,
      });
    }
    if (entries.length === 0) {
      toast.error("Enter at least one count.");
      return;
    }

    setSaving(true);
    try {
      await recordInventoryStockCounts(entries);
      clearSessionDraft(draftKey);
      setLines({});
      setOpen(false);
      toast.success(`${entries.length} count${entries.length === 1 ? "" : "s"} recorded`);
      onSaved();
    } catch (err) {
      console.error("Failed to save the count sheet:", err);
      toast.error(err instanceof Error ? err.message : "Could not save the counts.");
    } finally {
      setSaving(false);
    }
  }

  const enteredCount = Object.values(lines).filter((line) => line.counted.trim() !== "").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardList className="size-4" /> Count stock sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Count stock · {formatDisplay(today)}</DialogTitle>
          <DialogDescription>
            Enter what you counted. Blank rows are skipped. A difference over 20 % needs a reason. Entries stay on this phone until you save.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Search materials" placeholder="Search material" value={query} onChange={(event) => setQuery(event.target.value)} />
        <ul className="space-y-2">
          {rows.map((material) => {
            const line = lines[material.id] ?? { counted: "", reason: "" };
            const system = systemTotals[material.id] ?? 0;
            const counted = parseCountQuantity(line.counted);
            const variance = line.counted.trim() === "" || counted === null ? null : countVariance(system, counted);
            return (
              <li key={material.id} className="space-y-2 rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{material.name}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">System {formatInventoryUsageQuantity(system)} {material.baseUnit}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Counted quantity for ${material.name}`}
                    inputMode="decimal"
                    placeholder="Counted"
                    value={line.counted}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (/^\d*([.,]\d*)?$/.test(raw)) updateLine(material.id, { counted: raw });
                    }}
                    className="h-11 w-36 text-right tabular-nums sm:h-9"
                  />
                  <span className="text-sm text-muted-foreground">{material.baseUnit}</span>
                  {variance && (
                    <span className={`text-sm tabular-nums ${variance.needsReason ? "text-warning" : "text-muted-foreground"}`}>
                      {signed(variance.difference, material.baseUnit)}
                    </span>
                  )}
                </div>
                {variance?.needsReason && (
                  <Input
                    aria-label={`Reason for the difference in ${material.name}`}
                    placeholder="Reason (required)"
                    value={line.reason}
                    onChange={(event) => updateLine(material.id, { reason: event.target.value })}
                    className="h-11 sm:h-9"
                  />
                )}
              </li>
            );
          })}
          {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No materials match.</li>}
        </ul>
        <DialogFooter>
          <p className="mr-auto self-center text-xs text-muted-foreground">{enteredCount} counted</p>
          <Button onClick={() => void saveSheet()} disabled={saving || enteredCount === 0} className="bg-primary hover:bg-primary-hover">
            {saving ? "Saving…" : "Save counts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
