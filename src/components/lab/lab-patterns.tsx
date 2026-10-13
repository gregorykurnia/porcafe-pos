"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Banner, OfflineStrip } from "@/components/patterns/banner";
import { ChartFrame } from "@/components/patterns/chart-frame";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { ConfirmDialog, UnsavedGuardDialog } from "@/components/patterns/dialogs";
import { PageTabs } from "@/components/patterns/page-tabs";
import { EmptyState, ErrorBanner, LoadingSkeleton } from "@/components/patterns/states";
import { SaveState } from "@/components/patterns/save-state";
import { StatStrip } from "@/components/patterns/stat-strip";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { chartColors } from "@/lib/chart-colors";

const TONE_SAMPLES: { tone: StatusTone; word: string }[] = [
  { tone: "ok", word: "Complete" },
  { tone: "info", word: "Draft" },
  { tone: "warn", word: "Unsaved changes" },
  { tone: "danger", word: "Blocked" },
  { tone: "neutral", word: "Not started" },
  { tone: "solid", word: "Negative" },
];

type Item = { id: string; name: string; sold: number; total: number; status: string };
const ITEMS: Item[] = [
  { id: "1", name: "Chicken Nanban", sold: 18, total: 810000, status: "Sold" },
  { id: "2", name: "Nasi Goreng Charred", sold: 14, total: 588000, status: "Sold" },
  { id: "3", name: "Iga Bakar Madu", sold: 0, total: 0, status: "No sales" },
];
const COLUMNS: Column<Item>[] = [
  { key: "name", label: "Item", cell: (r) => r.name, phone: "title" },
  { key: "sold", label: "Portions", align: "right", cell: (r) => r.sold, phone: "meta" },
  { key: "total", label: "Total · Rp", align: "right", cell: (r) => r.total.toLocaleString("id-ID"), phone: "figure" },
  { key: "status", label: "Status", cell: (r) => <StatusChip tone={r.sold > 0 ? "ok" : "neutral"}>{r.status}</StatusChip>, phone: "hidden" },
];
const CHART = [
  { day: "Thu", value: 3420000 },
  { day: "Fri", value: 4185000 },
  { day: "Sat", value: 5260000 },
  { day: "Sun", value: 0 },
];

export function LabPatterns() {
  const [tab, setTab] = useState<"sales" | "history" | "edit">("sales");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [guardSaving, setGuardSaving] = useState(false);
  const [guardError, setGuardError] = useState<string | null>(null);
  const [showError, setShowError] = useState(true);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Status chips</h3>
        <div className="flex flex-wrap gap-2">
          {TONE_SAMPLES.map((sample) => (
            <StatusChip key={sample.tone} tone={sample.tone}>{sample.word}</StatusChip>
          ))}
          <StatusChip tone="ok" header>Complete · header</StatusChip>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Stat strip</h3>
        <StatStrip
          label="Month totals"
          cells={[
            { label: "Reported total", value: "Rp 537.000", note: "vs 1–13 Sep" },
            { label: "Portions sold", value: "14", note: "Main 13 · Add On 1" },
            { label: "Best day", value: "Rp 537.000", note: "Thursday, 1 Oct" },
            { label: "Negative stock", value: "−3", note: "Chicken thigh", tone: "danger" },
          ]}
        />
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Page tabs</h3>
        <PageTabs
          label="Daily close sections"
          value={tab}
          tabs={[
            { value: "sales", label: "Daily close" },
            { value: "history", label: "History" },
            { value: "edit", label: "Legacy editing" },
          ]}
          onChange={setTab}
        />
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Banners and offline</h3>
        <Banner tone="info" action={{ label: "Restore", onClick: () => undefined }}>Restored draft from this device.</Banner>
        <Banner tone="warn">Conflict: this day was changed on another device.</Banner>
        <Banner tone="danger">Negative stock: Chicken thigh is below zero.</Banner>
        <OfflineStrip />
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Data table (compact, with ⋯ menu)</h3>
        <DataTable
          caption="Items sold"
          columns={COLUMNS}
          rows={[{ band: "Main · 3 items" }, ...ITEMS]}
          getKey={(row) => row.id}
          rowActions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>⋯</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          empty={<EmptyState title="No sales yet">Items appear here once the sheet is closed.</EmptyState>}
        />
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Empty, loading and error</h3>
        <EmptyState title="No sales logged yet" action={<Button variant="secondary">Open Daily close</Button>}>
          Close tonight&rsquo;s sheet and this fills in.
        </EmptyState>
        <LoadingSkeleton rows={3} />
        {showError ? (
          <ErrorBanner onRetry={() => setShowError(false)}>Couldn&rsquo;t load this day. Your date is still selected.</ErrorBanner>
        ) : (
          <Button variant="secondary" onClick={() => setShowError(true)}>Show error again</Button>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Save states</h3>
        <div className="flex flex-wrap gap-4">
          <SaveState kind="unsaved" />
          <SaveState kind="saving" />
          <SaveState kind="saved" savedAt="21:42" />
          <SaveState kind="ready" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Dialogs</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Confirm (normal)</Button>
          <Button variant="secondary" onClick={() => setGuardOpen(true)}>Unsaved guard</Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Cancel PO-1013-02?"
          description="The order is marked cancelled. This cannot be undone."
          confirmLabel="Cancel order"
          destructive
          onConfirm={() => undefined}
        />
        <UnsavedGuardDialog
          open={guardOpen}
          saving={guardSaving}
          error={guardError}
          onStay={() => setGuardOpen(false)}
          onDiscard={() => {
            setGuardError(null);
            setGuardOpen(false);
          }}
          onSaveAndContinue={() => {
            setGuardSaving(true);
            setGuardError(null);
            window.setTimeout(() => {
              setGuardSaving(false);
              setGuardOpen(false);
            }, 800);
          }}
        />
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-title-3 text-ink">Chart frame (recharts)</h3>
        <ChartFrame
          label="Daily revenue, Thursday to Sunday. Saturday is the highest day at Rp 5.260.000. Sunday has no revenue."
          takeaway="Saturday is the best day this week, Rp 5.260.000."
          legend={[{ label: "Daily revenue", swatch: chartColors.series }, { label: "Best day", swatch: chartColors.highlight }]}
        >
          <ResponsiveContainer width="100%" height={200}>
          <BarChart data={CHART} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="0" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {CHART.map((row) => (
                <Cell
                  key={row.day}
                  fill={row.value === Math.max(...CHART.map((c) => c.value)) ? chartColors.highlight : chartColors.series}
                  fillOpacity={row.value === Math.max(...CHART.map((c) => c.value)) ? 1 : chartColors.seriesOpacity}
                />
              ))}
            </Bar>
          </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
    </div>
  );
}
