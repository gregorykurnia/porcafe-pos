"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Banner } from "@/components/patterns/banner";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
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
 * Counts many materials in one sheet (DESIGN_SYSTEM §10 "Sheets"): a side sheet on tablet and desk, full screen on
 * phone. Each row shows the system balance, the counted amount and the difference. Entries are kept on this device
 * until saved.
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

  // The save bar says what blocks saving, using the same rules as saveSheet.
  let invalidCount = false;
  let missingReasons = 0;
  for (const material of materials) {
    const line = lines[material.id];
    if (!line || line.counted.trim() === "") continue;
    const observed = parseCountQuantity(line.counted);
    if (observed === null) {
      invalidCount = true;
      continue;
    }
    if (countVariance(systemTotals[material.id] ?? 0, observed).needsReason && !line.reason.trim()) missingReasons += 1;
  }
  const blocker = invalidCount
    ? "Check the counted amounts. Use digits, for example 12 or 1,5."
    : missingReasons > 0
      ? `${missingReasons} ${missingReasons === 1 ? "difference is" : "differences are"} over 20 % and need a reason.`
      : `${enteredCount} counted`;

  const columns: Column<InventoryMaterial>[] = [
    {
      key: "material",
      label: "Material",
      cell: (material) => <span className="font-medium">{material.name}</span>,
      phone: "title",
    },
    {
      key: "system",
      label: "System",
      align: "right",
      cell: (material) => <span className="text-ink-muted">{formatInventoryUsageQuantity(systemTotals[material.id] ?? 0)} {material.baseUnit}</span>,
      phone: "meta",
    },
    {
      key: "counted",
      label: "Counted",
      align: "right",
      cell: (material) => {
        const value = lines[material.id]?.counted ?? "";
        return (
          <div className="relative ml-auto w-40">
            <Input
              aria-label={`Counted quantity for ${material.name}`}
              inputMode="decimal"
              placeholder="0"
              value={value}
              onChange={(event) => {
                const raw = event.target.value;
                if (/^\d*([.,]\d*)?$/.test(raw)) updateLine(material.id, { counted: raw });
              }}
              className="pr-12 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-ink-muted">{material.baseUnit}</span>
          </div>
        );
      },
      phone: "figure",
    },
    {
      key: "difference",
      label: "Difference",
      align: "right",
      cell: (material) => {
        const line = lines[material.id] ?? { counted: "", reason: "" };
        const counted = parseCountQuantity(line.counted);
        const variance = line.counted.trim() === "" || counted === null ? null : countVariance(systemTotals[material.id] ?? 0, counted);
        if (!variance) return <span className="text-ink-muted">—</span>;
        return (
          <span className={variance.needsReason ? "font-medium text-warn" : "text-ink"}>
            {signed(variance.difference, material.baseUnit)}
          </span>
        );
      },
      phone: "meta",
    },
    {
      key: "reason",
      label: "Reason",
      cell: (material) => {
        const line = lines[material.id] ?? { counted: "", reason: "" };
        const counted = parseCountQuantity(line.counted);
        const variance = line.counted.trim() === "" || counted === null ? null : countVariance(systemTotals[material.id] ?? 0, counted);
        if (!variance?.needsReason) return null;
        return (
          <Input
            aria-label={`Reason for the difference in ${material.name}`}
            placeholder="Reason (required)"
            value={line.reason}
            onChange={(event) => updateLine(material.id, { reason: event.target.value })}
            className="min-w-44"
          />
        );
      },
      phone: "detail",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="secondary">
          <ClipboardList className="size-5" strokeWidth={1.5} aria-hidden="true" />
          Count stock
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4">
        <SheetHeader>
          <SheetTitle>Count stock · {formatDisplay(today)}</SheetTitle>
          <SheetDescription>
            Enter what you counted. Blank rows are skipped. A difference over 20 % needs a reason.
          </SheetDescription>
        </SheetHeader>
        <Banner tone="info">Entries are kept on this device until you save them.</Banner>
        <Input aria-label="Search materials" placeholder="Search material" value={query} onChange={(event) => setQuery(event.target.value)} />
        <DataTable
          caption="Count stock sheet"
          columns={columns}
          rows={rows}
          getKey={(material) => material.id}
          density="compact"
          empty={<EmptyState title="No materials match.">Clear the search to see every material.</EmptyState>}
        />
        <SheetFooter>
          <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{blocker}</p>
          <Button loading={saving} onClick={() => void saveSheet()} disabled={saving || enteredCount === 0}>
            {saving ? "Saving…" : "Save counts"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
