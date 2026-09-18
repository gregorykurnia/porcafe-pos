"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, ChevronDown, ChevronRight, CircleCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDisplay, todayISO } from "@/lib/dates";
import {
  formatInventoryUsageQuantity,
  INVENTORY_USAGE_GO_LIVE_DATE,
  listInventoryUsageRecap,
  summarizeInventoryUsage,
} from "@/lib/inventory-usage";
import type { InventoryUsageEvent } from "@/lib/types";

function statusBadge(event: InventoryUsageEvent) {
  if (event.status === "needs-review") return <Badge variant="destructive">Needs review</Badge>;
  if (event.status === "no-sales") return <Badge variant="outline">No sales</Badge>;
  return <Badge variant="default">Calculated</Badge>;
}

function safeEndDate(): string {
  return todayISO() >= INVENTORY_USAGE_GO_LIVE_DATE ? todayISO() : INVENTORY_USAGE_GO_LIVE_DATE;
}

export function UsageRecap() {
  const [from, setFrom] = useState(INVENTORY_USAGE_GO_LIVE_DATE);
  const [to, setTo] = useState(safeEndDate());
  const [events, setEvents] = useState<InventoryUsageEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const issueCount = events.reduce((total, event) => total + event.issues.length, 0);

  return (
    <div className="space-y-5">
      <Card className="border-info/20 bg-info/5">
        <CardContent className="flex gap-3 p-4">
          <Calculator className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <p className="font-medium">Usage calculation and ledger source</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily logs saved from {formatDisplay(INVENTORY_USAGE_GO_LIVE_DATE)} are expanded into material usage. Approved calculations also create idempotent recipe-consumption movements; legacy item sales are never read or backfilled.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily usage recap</CardTitle>
          <CardDescription>Review calculated material quantities and open a day for its recipe-level drill-down.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="usage-from">From</Label><Input id="usage-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="usage-to">To</Label><Input id="usage-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />{loading ? "Loading…" : "Refresh"}</Button>
          </div>

          {error && <div className="rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-4">
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Usage events</p><p className="mt-1 text-xl font-semibold tabular-nums">{events.length}</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Recorded portions</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatInventoryUsageQuantity(totalPortions)}</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Material totals</p><p className="mt-1 text-xl font-semibold tabular-nums">{materialSummary.length}</p></CardContent></Card>
            <Card size="sm"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Review issues</p><p className="mt-1 text-xl font-semibold tabular-nums">{issueCount}{reviewEvents > 0 && <span className="ml-1 text-xs font-normal text-warning">({reviewEvents} days)</span>}</p></CardContent></Card>
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
                <TableHeader><TableRow><TableHead className="w-8" /><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Portions</TableHead><TableHead className="text-right">Usage lines</TableHead><TableHead className="text-right">Issues</TableHead></TableRow></TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const selected = event.sourceDate === selectedDate;
                    return (
                      <TableRow key={event.id} className={selected ? "bg-muted/60" : undefined}>
                        <TableCell className="p-1"><Button size="icon-sm" variant="ghost" onClick={() => setSelectedDate(selected ? null : event.sourceDate)} aria-label={`${selected ? "Collapse" : "Expand"} usage for ${event.sourceDate}`}>{selected ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button></TableCell>
                        <TableCell><button type="button" className="text-left font-medium hover:text-primary" onClick={() => setSelectedDate(selected ? null : event.sourceDate)}>{formatDisplay(event.sourceDate)}</button><span className="block text-xs text-muted-foreground">Saved as {event.sourceStatus}</span></TableCell>
                        <TableCell>{statusBadge(event)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(event.totalPortions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{event.lines.length}</TableCell>
                        <TableCell className="text-right tabular-nums">{event.issues.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Material totals</CardTitle><CardDescription>Aggregated from calculated usage events in the selected range. Open Stock to see the resulting ledger balance.</CardDescription></CardHeader>
        <CardContent>
          {materialSummary.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No calculated material lines yet.</p> : <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Calculated usage</TableHead></TableRow></TableHeader><TableBody>{materialSummary.map((material) => <TableRow key={`${material.materialId}:${material.unit}`}><TableCell className="font-medium">{material.materialName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(material.quantity)} {material.unit}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>

      {selectedEvent && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Calculation detail · {formatDisplay(selectedEvent.sourceDate)}</CardTitle><CardDescription>Source revision {selectedEvent.sourceRevision} · Calculated {new Date(selectedEvent.calculatedAt).toLocaleString("en-GB")}</CardDescription></div>{statusBadge(selectedEvent)}</div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedEvent.issues.length > 0 && <div className="rounded-xl border border-warning/25 bg-warning/10 p-4"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="font-medium text-warning">Review before trusting this day&apos;s material usage</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{selectedEvent.issues.map((issue, index) => <li key={`${issue.code}-${issue.recipeId ?? ""}-${index}`}>{issue.message}{issue.sourceRef && <span className="ml-1 font-mono text-xs">({issue.sourceRef})</span>}</li>)}</ul></div></div></div>}
            <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Menu item</TableHead><TableHead className="text-right">Portions</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Usage</TableHead><TableHead>Recipe path</TableHead></TableRow></TableHeader><TableBody>{selectedEvent.lines.map((line) => <TableRow key={line.id}><TableCell className="font-medium">{line.menuItemName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(line.portionQuantity)}</TableCell><TableCell>{line.materialName}</TableCell><TableCell className="text-right tabular-nums">{formatInventoryUsageQuantity(line.quantity)} {line.unit}</TableCell><TableCell className="max-w-72 whitespace-normal text-xs text-muted-foreground">{line.recipePath.join(" → ")}</TableCell></TableRow>)}{selectedEvent.lines.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground"><CircleCheck className="mx-auto mb-2 size-5 text-success" />No material lines were produced.</TableCell></TableRow>}</TableBody></Table></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
