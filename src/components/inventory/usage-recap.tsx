"use client";

import { StatusBadge } from "@/components/state/status-badge";
import { usageStatusView } from "@/lib/status";
import { Stat } from "@/components/state/stat";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, ChevronRight, CircleCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDisplay, todayISO } from "@/lib/dates";
import { getDailyItemLog } from "@/lib/data";
import {
  calculateAndPersistDailyInventoryUsage,
  formatInventoryUsageQuantity,
  INVENTORY_USAGE_GO_LIVE_DATE,
  listInventoryUsageRecap,
  setInventoryUsageItemExcluded,
  summarizeInventoryUsage,
  usageStatusDeductsStock,
} from "@/lib/inventory-usage";
import { daysNeedingExclusion, excludableItemsFor, sourceStatusLabel } from "@/lib/usage-exclusions";
import type { InventoryUsageEvent } from "@/lib/types";

function statusBadge(event: InventoryUsageEvent) {
  return <StatusBadge view={usageStatusView(event.status)} />;
}

function safeEndDate(): string {
  return todayISO() >= INVENTORY_USAGE_GO_LIVE_DATE ? todayISO() : INVENTORY_USAGE_GO_LIVE_DATE;
}

// A day that now deducts stock may change the reorder state, so the push processing is asked to look again.
function notifyReorderTransition(event: InventoryUsageEvent) {
  if (!usageStatusDeductsStock(event.status)) return;
  void fetch("/api/push/reorder-transition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: event.sourceDate }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.warn("Reorder push processing was not accepted", response.status);
  }).catch((pushError) => {
    console.warn("Reorder push processing could not be reached", pushError);
  });
}

export function UsageRecap() {
  const confirm = useConfirm();
  const [from, setFrom] = useState(INVENTORY_USAGE_GO_LIVE_DATE);
  const [to, setTo] = useState(safeEndDate());
  const [events, setEvents] = useState<InventoryUsageEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingExclusionFor, setUpdatingExclusionFor] = useState<string | null>(null);
  const [recalculatingDate, setRecalculatingDate] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ menuItemId: string; done: number; total: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!from || !to || from > to) {
      setEvents([]);
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextEvents = await listInventoryUsageRecap(from, to);
      setEvents(nextEvents);
      setSelectedDate((current) =>
        current && nextEvents.some((event) => event.sourceDate === current)
          ? current
          : nextEvents[0]?.sourceDate ?? null
      );
    } catch (loadError) {
      console.error("Failed to load inventory usage recap", loadError);
      setError(loadError instanceof Error ? loadError.message : "Could not load usage recap.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const selectedEvent = events.find((event) => event.sourceDate === selectedDate) ?? null;
  const materialSummary = useMemo(() => summarizeInventoryUsage(events), [events]);
  const totalPortions = events.reduce((total, event) => total + event.totalPortions, 0);
  const reviewEvents = events.filter((event) => event.status === "needs-review").length;
  const exclusionEvents = events.filter((event) => event.status === "calculated-with-exclusions").length;
  const issueCount = events.reduce((total, event) => total + event.issues.length, 0);
  const selectedExclusions = selectedEvent?.excludedItems ?? [];
  const excludableMenuItems = selectedEvent ? excludableItemsFor(selectedEvent) : [];
  const busy = updatingExclusionFor !== null || recalculatingDate !== null || bulkProgress !== null;

  async function updateMenuItemExclusion(menuItemId: string, menuItemName: string, excluded: boolean) {
    if (!selectedEvent) return;
    setUpdatingExclusionFor(menuItemId);
    try {
      const updatedEvent = await setInventoryUsageItemExcluded(selectedEvent.sourceDate, menuItemId, excluded);
      setEvents((current) => current.map((event) => event.sourceDate === updatedEvent.sourceDate ? updatedEvent : event));
      notifyReorderTransition(updatedEvent);
      toast.success(excluded
        ? `${menuItemName} excluded from this day's material usage.`
        : `${menuItemName} included in this day's calculation.`);
    } catch (updateError) {
      console.error("Failed to update inventory usage exclusion", updateError);
      toast.error(updateError instanceof Error ? updateError.message : "Could not update this usage exclusion.");
    } finally {
      setUpdatingExclusionFor(null);
    }
  }

  // Excludes one item on every day in the range that needs it. The days are done one at a time, so a
  // failure stops the run and says how many days were already changed.
  async function excludeAcrossRange(menuItemId: string, menuItemName: string) {
    const dates = daysNeedingExclusion(events, menuItemId);
    if (dates.length === 0) return;
    const count = `${dates.length} ${dates.length === 1 ? "day" : "days"}`;
    const ok = await confirm({
      title: `Exclude ${menuItemName} on ${count}?`,
      body: dates.length === 1
        ? `${formatDisplay(dates[0])} will be recalculated without ${menuItemName}.`
        : `${formatDisplay(dates[0])} to ${formatDisplay(dates[dates.length - 1])} will be recalculated without ${menuItemName}.`,
      details: "Sold portions stay recorded. Material usage for this item will not be deducted on those days. Days that already exclude it are skipped.",
      confirmLabel: `Exclude on ${count}`,
    });
    if (!ok) return;

    const changed: InventoryUsageEvent[] = [];
    setBulkProgress({ menuItemId, done: 0, total: dates.length });
    try {
      for (const date of dates) {
        const updatedEvent = await setInventoryUsageItemExcluded(date, menuItemId, true);
        setEvents((current) => current.map((event) => event.sourceDate === updatedEvent.sourceDate ? updatedEvent : event));
        changed.push(updatedEvent);
        setBulkProgress({ menuItemId, done: changed.length, total: dates.length });
      }
      toast.success(`${menuItemName} excluded on ${changed.length} ${changed.length === 1 ? "day" : "days"}.`);
    } catch (bulkError) {
      console.error("Failed to exclude item across the range", bulkError);
      toast.error(`Stopped after ${changed.length} of ${dates.length} days. ${bulkError instanceof Error ? bulkError.message : "Could not update the remaining days."}`);
    } finally {
      setBulkProgress(null);
      changed.forEach(notifyReorderTransition);
    }
  }

  async function recalculateSelectedDay() {
    if (!selectedEvent || recalculatingDate) return;
    const sourceDate = selectedEvent.sourceDate;
    setRecalculatingDate(sourceDate);
    try {
      const log = await getDailyItemLog(sourceDate);
      if (!log) throw new Error(`No saved daily close was found for ${sourceDate}.`);
      const updatedEvent = await calculateAndPersistDailyInventoryUsage(log);
      if (!updatedEvent) throw new Error(`Inventory usage calculation is not enabled for ${sourceDate}.`);

      setEvents((current) => current.map((event) => event.sourceDate === sourceDate ? updatedEvent : event));
      notifyReorderTransition(updatedEvent);
      toast.success(updatedEvent.status === "needs-review"
        ? "Day recalculated. Recipe review is still needed."
        : "Day recalculated using the current menu and recipes.");
    } catch (recalculateError) {
      console.error("Failed to recalculate inventory usage", recalculateError);
      toast.error(recalculateError instanceof Error ? recalculateError.message : "Could not recalculate this day.");
    } finally {
      setRecalculatingDate(null);
    }
  }

  // The selected day's detail. It is rendered as an expanded row under that day, not as a separate card.
  const detail = selectedEvent && (
    <div className="max-w-[calc(100vw-7rem)] space-y-4 sm:max-w-none">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">Calculation detail · {formatDisplay(selectedEvent.sourceDate)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Source revision {selectedEvent.sourceRevision} · Calculated {new Date(selectedEvent.calculatedAt).toLocaleString("en-GB")}. Recalculate after changing menu items or recipes to refresh this saved result.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(selectedEvent)}
          <Button variant="outline" size="sm" onClick={() => void recalculateSelectedDay()} disabled={busy}>
            <RefreshCw className={recalculatingDate === selectedEvent.sourceDate ? "size-3.5 animate-spin" : "size-3.5"} />
            {recalculatingDate === selectedEvent.sourceDate ? "Recalculating…" : "Recalculate day"}
          </Button>
        </div>
      </div>
      {selectedEvent.issues.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="w-full space-y-3">
              <div>
                <p className="font-medium text-warning">Review before trusting this day&apos;s material usage</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {selectedEvent.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.recipeId ?? ""}-${index}`}>
                      {issue.message}
                      {issue.sourceRef && <span className="ml-1 font-mono text-xs">({issue.sourceRef})</span>}
                    </li>
                  ))}
                </ul>
              </div>
              {excludableMenuItems.length > 0 && (
                <div className="rounded-lg border border-warning/20 bg-background/70 p-3">
                  <p className="text-sm font-medium">Recipe not ready yet?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Exclude an item for this day to calculate the rest. Its sold portions stay recorded, but its material usage will not be deducted from stock.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {excludableMenuItems.map((item) => {
                      const acrossRange = daysNeedingExclusion(events, item.id).length;
                      const running = bulkProgress?.menuItemId === item.id;
                      return (
                        <li key={item.id} className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void updateMenuItemExclusion(item.id, item.name, true)}
                          >
                            {updatingExclusionFor === item.id ? "Updating…" : `Exclude ${item.name} for this day`}
                          </Button>
                          {acrossRange > 1 && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void excludeAcrossRange(item.id, item.name)}>
                              {running
                                ? `Excluding… ${bulkProgress?.done} of ${bulkProgress?.total}`
                                : `Exclude on all ${acrossRange} days in range`}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedExclusions.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning/5 p-4">
          <p className="font-medium">Excluded from this day&apos;s material usage</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sales remain recorded. No recipe-based stock usage was calculated or deducted for these items.
          </p>
          <ul className="mt-3 space-y-2">
            {selectedExclusions.map((item) => (
              <li key={item.menuItemId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{item.menuItemName} · {formatInventoryUsageQuantity(item.portionQuantity)} portions</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void updateMenuItemExclusion(item.menuItemId, item.menuItemName, false)}
                >
                  {updatingExclusionFor === item.menuItemId ? "Updating…" : "Include in calculation"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Menu item</TableHead><TableHead className="text-right">Portions</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Usage</TableHead><TableHead>Recipe path</TableHead></TableRow></TableHeader><TableBody>{selectedEvent.lines.map((line) => <TableRow key={line.id}><TableCell className="font-medium">{line.menuItemName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(line.portionQuantity)}</TableCell><TableCell>{line.materialName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(line.quantity)} {line.unit}</TableCell><TableCell className="max-w-72 whitespace-normal text-xs text-muted-foreground">{line.recipePath.join(" → ")}</TableCell></TableRow>)}{selectedEvent.lines.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground"><CircleCheck className="mx-auto mb-2 size-5 text-success" />{selectedExclusions.length > 0 ? "No material lines for included items; excluded sales have no stock deduction." : "No material lines were produced."}</TableCell></TableRow>}</TableBody></Table></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card className="border-info/20 bg-info/5">
        <CardContent className="flex gap-3 p-4">
          <Calculator className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <p className="font-medium">Usage calculation and ledger source</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily logs saved from {formatDisplay(INVENTORY_USAGE_GO_LIVE_DATE)} are expanded into material usage. Calculated days create recipe-consumption movements for known recipe lines; explicitly excluded items stay visible and are not deducted. Legacy item sales are never read or backfilled.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily usage recap</CardTitle>
          <CardDescription>Review calculated material quantities and open a day to see its recipe-level detail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="usage-from">From</Label><Input id="usage-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="usage-to">To</Label><Input id="usage-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading || recalculatingDate !== null}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{loading ? "Loading…" : "Refresh"}</Button>
          </div>

          {error && <div className="rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat variant="card" size="sm" label="Days calculated" value={events.length} />
            <Stat variant="card" size="sm" label="Recorded portions" value={formatInventoryUsageQuantity(totalPortions)} />
            <Stat variant="card" size="sm" label="Material totals" value={materialSummary.length} />
            <Stat variant="card" size="sm" label="Review issues" value={<>{issueCount}{(reviewEvents > 0 || exclusionEvents > 0) && <span className="ml-1 text-xs font-normal text-warning">({reviewEvents} review · {exclusionEvents} with exclusions)</span>}</>} />
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading usage events…</p>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="font-medium">No usage events in this range</p>
              <p className="mt-1 text-sm text-muted-foreground">Save a new daily log from the go-live date onward to create the first calculation.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader><TableRow><TableHead className="w-8"><span className="sr-only">Expand</span></TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Portions</TableHead><TableHead className="hidden text-right sm:table-cell">Ingredients</TableHead><TableHead className="hidden text-right sm:table-cell">Issues</TableHead></TableRow></TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const selected = event.sourceDate === selectedDate;
                    return (
                      <Fragment key={event.id}>
                        <TableRow className={selected ? "bg-muted/60" : undefined}>
                          <TableCell className="p-1"><Button size="icon-sm" variant="ghost" onClick={() => setSelectedDate(selected ? null : event.sourceDate)} aria-expanded={selected} aria-label={`${selected ? "Collapse" : "Expand"} usage for ${event.sourceDate}`}>{selected ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button></TableCell>
                          <TableCell className="whitespace-normal"><button type="button" className="text-left font-medium hover:text-primary" onClick={() => setSelectedDate(selected ? null : event.sourceDate)}>{formatDisplay(event.sourceDate)}</button><span className="block text-xs text-muted-foreground">{sourceStatusLabel(event.sourceStatus)}</span></TableCell>
                          <TableCell>{statusBadge(event)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(event.totalPortions)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{event.lines.length}</TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{event.issues.length}</TableCell>
                        </TableRow>
                        {selected && detail && (
                          <TableRow>
                            <TableCell colSpan={6} className="whitespace-normal bg-surface p-4">{detail}</TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Material totals</CardTitle><CardDescription>Aggregated from calculated usage events in the selected range. Days with exclusions include only known recipe usage; excluded items are not deducted. Open Stock to see the resulting ledger balance.</CardDescription></CardHeader>
        <CardContent>
          {materialSummary.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No calculated material lines yet.</p> : <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Calculated usage</TableHead></TableRow></TableHeader><TableBody>{materialSummary.map((material) => <TableRow key={`${material.materialId}:${material.unit}`}><TableCell className="font-medium">{material.materialName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(material.quantity)} {material.unit}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
