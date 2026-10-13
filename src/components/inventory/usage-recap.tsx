"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatStrip, type StatCell } from "@/components/patterns/stat-strip";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { Banner } from "@/components/patterns/banner";
import { EmptyState, ErrorBanner, LoadingSkeleton } from "@/components/patterns/states";
import { FieldRow } from "@/components/fields/field-row";
import { usageStatusView } from "@/lib/status";
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
import type { InventoryUsageEvent, InventoryUsageLine, InventoryUsageStatus } from "@/lib/types";

// Stock → Usage recap (inventory §3.6.4). Completed days are turned into material usage through recipes. A day
// opens in place as an inner panel (one level only), with its exclusions, issues and material lines.

// Usage day status to a Canopy tone (DESIGN_SYSTEM §6). Each status keeps its word, its shape and its tone.
const USAGE_TONE: Record<InventoryUsageStatus, StatusTone> = {
  calculated: "ok",
  "calculated-with-exclusions": "info",
  "pending-draft": "info",
  "needs-review": "warn",
  "no-sales": "neutral",
};

function UsageStatusChip({ status }: { status: InventoryUsageStatus }) {
  return <StatusChip tone={USAGE_TONE[status]}>{usageStatusView(status).label}</StatusChip>;
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

  const rangeInvalid = !from || !to || from > to;
  const selectedEvent = events.find((event) => event.sourceDate === selectedDate) ?? null;
  const materialSummary = useMemo(() => summarizeInventoryUsage(events), [events]);
  const totalPortions = events.reduce((total, event) => total + event.totalPortions, 0);
  const reviewEvents = events.filter((event) => event.status === "needs-review").length;
  const exclusionEvents = events.filter((event) => event.status === "calculated-with-exclusions").length;
  const issueCount = events.reduce((total, event) => total + event.issues.length, 0);
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

  const cells: StatCell[] = [
    { label: "Days calculated", value: events.length },
    { label: "Recorded portions", value: formatInventoryUsageQuantity(totalPortions) },
    { label: "Material totals", value: materialSummary.length },
    {
      label: "Review issues",
      value: (
        <span className="inline-flex items-center gap-2">
          {issueCount > 0 ? <ToneShape tone="warn" className="text-warn-mark" /> : null}
          {issueCount}
        </span>
      ),
      note: reviewEvents > 0 || exclusionEvents > 0 ? `${reviewEvents} review · ${exclusionEvents} with exclusions` : undefined,
    },
  ];

  const columns: Column<InventoryUsageEvent>[] = [
    {
      key: "date",
      label: "Date",
      cell: (event) => <span className="font-medium">{formatDisplay(event.sourceDate)}</span>,
      phone: "title",
      cellClassName: "whitespace-normal",
    },
    {
      key: "close",
      label: "Close",
      cell: (event) => <span className="text-ink-muted">{sourceStatusLabel(event.sourceStatus)}</span>,
      phone: "meta",
      cellClassName: "whitespace-normal",
    },
    {
      key: "usage",
      label: "Usage",
      cell: (event) => <UsageStatusChip status={event.status} />,
      phone: "detail",
    },
    {
      key: "portions",
      label: "Portions",
      align: "right",
      cell: (event) => (
        <>
          <span className="desk:hidden">Portions </span>
          {formatInventoryUsageQuantity(event.totalPortions)}
        </>
      ),
      phone: "figure",
    },
    {
      key: "lines",
      label: "Lines",
      align: "right",
      cell: (event) => (
        <>
          <span className="desk:hidden">Lines </span>
          {event.lines.length}
        </>
      ),
      phone: "meta",
    },
    {
      key: "issues",
      label: "Issues",
      align: "right",
      cell: (event) => (
        <span className={event.issues.length > 0 ? "font-semibold text-warn" : "text-ink-muted"}>
          <span className="desk:hidden">Issues </span>
          {event.issues.length}
        </span>
      ),
      phone: "meta",
    },
  ];

  const lineColumns: Column<InventoryUsageLine>[] = [
    {
      key: "item",
      label: "Menu item",
      cell: (line) => <span className="font-medium">{line.menuItemName}</span>,
      phone: "title",
      cellClassName: "whitespace-normal",
    },
    {
      key: "portions",
      label: "Portions",
      align: "right",
      cell: (line) => (
        <>
          <span className="desk:hidden">Portions </span>
          {formatInventoryUsageQuantity(line.portionQuantity)}
        </>
      ),
      phone: "meta",
    },
    {
      key: "material",
      label: "Material",
      cell: (line) => <span>{line.materialName}</span>,
      phone: "detail",
      cellClassName: "whitespace-normal",
    },
    {
      key: "usage",
      label: "Usage",
      align: "right",
      cell: (line) => <span className="font-semibold">{formatInventoryUsageQuantity(line.quantity)} {line.unit}</span>,
      phone: "figure",
    },
    {
      key: "path",
      label: "Recipe path",
      cell: (line) => <span className="text-small text-ink-muted">{line.recipePath.join(" → ")}</span>,
      phone: "detail",
      cellClassName: "max-w-72 whitespace-normal",
    },
  ];

  // The open day's inner panel. It opens under its row, and it is the only level below the card.
  function renderDetail(event: InventoryUsageEvent) {
    const selectedExclusions = event.excludedItems ?? [];
    const excludableMenuItems = excludableItemsFor(event);
    const recalculatingThisDay = recalculatingDate === event.sourceDate;
    return (
      <div className="space-y-5 rounded-xl border border-line bg-canvas p-4 tablet:p-6">
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
          <div className="min-w-0">
            <h3 className="text-title-3 text-ink">Calculation detail · {formatDisplay(event.sourceDate)}</h3>
            <p className="mt-1 text-small text-ink-muted">
              Calculated {new Date(event.calculatedAt).toLocaleString("en-GB")} · {event.lines.length} material {event.lines.length === 1 ? "line" : "lines"}. Recalculate after changing menu items or recipes to refresh this saved result.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UsageStatusChip status={event.status} />
            <Button variant="secondary" size="sm" onClick={() => void recalculateSelectedDay()} disabled={busy} loading={recalculatingThisDay}>
              {recalculatingThisDay ? "Recalculating…" : (<><RefreshCw strokeWidth={1.5} aria-hidden="true" />Recalculate day</>)}
            </Button>
          </div>
        </div>

        {event.issues.length > 0 && (
          <Banner tone="warn">
            <p className="font-medium">Review before trusting this day&apos;s material usage</p>
            <ul className="mt-2 space-y-1 text-small text-ink-muted">
              {event.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.recipeId ?? ""}-${index}`}>
                  {issue.message}
                  {issue.sourceRef && <span className="ml-1 font-mono text-xs">({issue.sourceRef})</span>}
                </li>
              ))}
            </ul>
            {excludableMenuItems.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="font-medium">Recipe not ready yet?</p>
                <p className="mt-1 text-small text-ink-muted">
                  Exclude an item for this day to calculate the rest. Its sold portions stay recorded, but its material usage will not be deducted from stock.
                </p>
                <ul className="mt-3 space-y-2">
                  {excludableMenuItems.map((item) => {
                    const acrossRange = daysNeedingExclusion(events, item.id).length;
                    const running = bulkProgress?.menuItemId === item.id;
                    const updating = updatingExclusionFor === item.id;
                    return (
                      <li key={item.id} className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          loading={updating}
                          onClick={() => void updateMenuItemExclusion(item.id, item.name, true)}
                        >
                          {updating ? "Updating…" : `Exclude ${item.name} for this day`}
                        </Button>
                        {acrossRange > 1 && (
                          <Button size="sm" variant="secondary" disabled={busy} loading={running} onClick={() => void excludeAcrossRange(item.id, item.name)}>
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
          </Banner>
        )}

        {selectedExclusions.length > 0 && (
          <div>
            <h4 className="text-title-3 text-ink">Excluded from this day&apos;s material usage</h4>
            <p className="mt-1 text-small text-ink-muted">
              Sales remain recorded. No recipe-based stock usage was calculated or deducted for these items.
            </p>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {selectedExclusions.map((item) => {
                const updating = updatingExclusionFor === item.menuItemId;
                return (
                  <li key={item.menuItemId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-body">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip tone="neutral">Excluded</StatusChip>
                      <span>{item.menuItemName} · {formatInventoryUsageQuantity(item.portionQuantity)} portions · not deducted</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      loading={updating}
                      onClick={() => void updateMenuItemExclusion(item.menuItemId, item.menuItemName, false)}
                    >
                      {updating ? "Updating…" : "Include in calculation"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DataTable
          caption={`Material lines for ${formatDisplay(event.sourceDate)}`}
          columns={lineColumns}
          rows={event.lines}
          getKey={(line) => line.id}
          density="compact"
          listBelow="desk"
          empty={
            <p className="py-6 text-center text-small text-ink-muted">
              {selectedExclusions.length > 0 ? "No material lines for included items; excluded sales have no stock deduction." : "No material lines were produced."}
            </p>
          }
        />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <p className="max-w-[80ch] text-small text-ink-muted">
        <span className="font-medium text-ink">How usage is calculated. </span>
        Daily logs saved from {formatDisplay(INVENTORY_USAGE_GO_LIVE_DATE)} are expanded into material usage. Days you calculate record recipe usage for known recipe lines. Excluded items stay visible and are not deducted.
      </p>

      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
        <div className="grid grid-cols-2 gap-3 tablet:w-[22rem]">
          <FieldRow label="From">
            {(id) => <Input id={id} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />}
          </FieldRow>
          <FieldRow label="To">
            {(id) => <Input id={id} type="date" value={to} onChange={(event) => setTo(event.target.value)} />}
          </FieldRow>
        </div>
        <Button variant="ghost" onClick={() => void refresh()} disabled={loading || recalculatingDate !== null} loading={loading} className="self-start tablet:self-end">
          {loading ? "Loading…" : (<><RefreshCw strokeWidth={1.5} aria-hidden="true" />Refresh</>)}
        </Button>
      </div>

      {rangeInvalid ? (
        <Banner tone="danger">Choose a valid date range.</Banner>
      ) : error ? (
        <ErrorBanner onRetry={() => void refresh()}>{error}</ErrorBanner>
      ) : null}

      <StatStrip label="Usage recap summary" cells={cells} />

      <Card className="gap-0 py-0 shadow-card">
        <div className="px-4 pt-4 tablet:px-6 tablet:pt-6">
          <h2 className="font-display text-title-2 text-ink">Daily usage recap</h2>
          <p className="mt-1 text-small text-ink-muted">Review calculated material quantities and open a day to see its recipe-level detail.</p>
        </div>
        {loading ? (
          <div className="mt-4 border-t border-line">
            <LoadingSkeleton rows={4} label="Loading usage events…" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState title="No usage events in this range">Save a new daily log from the go-live date onward to create the first calculation.</EmptyState>
        ) : (
          <div className="mt-4 border-t border-line">
            <DataTable
              caption="Usage by day"
              columns={columns}
              rows={events}
              getKey={(event) => event.sourceDate}
              density="compact"
              listBelow="desk"
              selectedKey={selectedDate ?? undefined}
              openKey={selectedDate ?? undefined}
              renderOpen={renderDetail}
              actionsBelow
              rowActions={(event) => {
                const open = event.sourceDate === selectedDate;
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-label={`${open ? "Close" : "Open"} day ${formatDisplay(event.sourceDate)}`}
                    onClick={() => setSelectedDate(open ? null : event.sourceDate)}
                  >
                    {open ? "Close day" : "Open day"}
                  </Button>
                );
              }}
            />
          </div>
        )}
      </Card>

      <Card className="gap-0 py-0 shadow-card">
        <div className="px-4 pt-4 tablet:px-6 tablet:pt-6">
          <h2 className="font-display text-title-2 text-ink">Material totals</h2>
          <p className="mt-1 text-small text-ink-muted">
            Aggregated from calculated usage events in the selected range. Days with exclusions include only known recipe usage; excluded items are not deducted. Open Stock to see the resulting ledger balance.
          </p>
        </div>
        {materialSummary.length === 0 ? (
          <EmptyState title="No calculated material lines yet.">Material totals fill in once a day is calculated.</EmptyState>
        ) : (
          <ul className="grid px-4 pb-4 tablet:grid-cols-2 tablet:gap-x-10 tablet:px-6 tablet:pb-6">
            {materialSummary.map((material) => (
              <li key={`${material.materialId}:${material.unit}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-body text-ink">
                <span className="min-w-0">{material.materialName}</span>
                <span className="shrink-0 tabular-nums">{formatInventoryUsageQuantity(material.quantity)} {material.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
