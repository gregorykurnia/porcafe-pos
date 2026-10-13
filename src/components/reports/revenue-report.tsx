"use client";

import Link from "next/link";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Download, Ellipsis } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChartFrame, type LegendItem } from "@/components/patterns/chart-frame";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { ToneShape } from "@/components/patterns/status-chip";
import { chartColors } from "@/lib/chart-colors";
import { downloadCSV } from "@/lib/csv";
import { deleteSalesEntry, findDuplicateSalesDates } from "@/lib/data";
import { formatDayDisplay, formatDisplay, formatMonthDisplay, idr } from "@/lib/dates";
import { chartLabel } from "@/lib/item-report";
import { cn } from "@/lib/utils";
import {
  closedDayStats,
  dailyRevenueRows,
  dailyRevenueSeries,
  entriesInPeriod,
  formatPeriodRange,
  latestClosedDays,
  revenueByMonth,
  revenueTakeaway,
  selisihForPeriod,
  type ReportPeriod,
} from "@/lib/report-period";
import type { MonthlyAdjustment, SalesEntry } from "@/lib/types";
import { DuplicateDatesBanner } from "@/components/reports/duplicate-dates";
import { MonthlyReconciliation } from "./monthly-reconciliation";

/** Table cells hold digits only; the currency sits in the header (DESIGN_SYSTEM §7). */
const digits = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

/** Chart axes and chart labels only: "5,48 jt". */
function shortJt(value: number): string {
  if (value === 0) return "0";
  return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`;
}

/** A short day for the figures under the chart: "Mon, 5 Oct". */
function shortDay(date: string): string {
  return format(parseISO(date), "EEE, d MMM");
}

type DayPoint = {
  date: string;
  label: string;
  /** Zero for a day with no record. The kind decides how it is drawn, so a missing day never reads as a zero. */
  total: number;
  kind: "closed" | "best" | "missing" | "today";
};

/**
 * One bar per day (DESIGN_SYSTEM §10 "Charts"): closed days in chart-1 at 78%, the best closed day in brand with a
 * direct label, today as a dashed outline, and a day with no record as a dotted baseline.
 */
function DaySlot(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: DayPoint;
  };
  const baseline = y + height;
  if (!payload) return <g />;
  if (payload.kind === "missing") {
    return <line x1={x} x2={x + width} y1={baseline - 1} y2={baseline - 1} stroke={chartColors.today} strokeWidth={2} strokeDasharray="2 3" />;
  }
  if (payload.kind === "today") {
    const outline = Math.max(height, 6);
    return (
      <rect
        x={x + 1}
        y={baseline - outline}
        width={Math.max(width - 2, 1)}
        height={outline}
        rx={6}
        fill="none"
        stroke={chartColors.today}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    );
  }
  if (payload.kind === "best") {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={6} fill={chartColors.highlight} />
        <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={chartColors.highlight}>
          {shortJt(payload.total)}
        </text>
      </g>
    );
  }
  return <rect x={x} y={y} width={width} height={height} rx={6} fill={chartColors.series} fillOpacity={chartColors.seriesOpacity} />;
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-small text-ink-muted">{label}</p>
      <p className="mt-0.5 font-display text-fig-m tabular-nums text-ink">{value}</p>
      {note ? <p className="text-small text-ink-muted">{note}</p> : null}
    </div>
  );
}

function EquationCell({
  label,
  value,
  note,
  emphasized = false,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className={cn("min-w-0 p-5 tablet:p-6", emphasized && "bg-brand-soft")}>
      <p className={cn("text-small", emphasized ? "text-brand" : "text-ink-muted")}>{label}</p>
      <p className={cn("mt-1 font-display text-fig-l tabular-nums", emphasized ? "text-brand" : "text-ink")}>{value}</p>
      <div className="mt-1 text-small text-ink-muted">{note}</div>
    </div>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <p aria-hidden="true" className="flex items-center justify-center px-2 py-1 font-display text-title-2 text-ink-muted tablet:px-3 tablet:py-0">
      {symbol}
    </p>
  );
}

/**
 * The Revenue tab (inventory §3.5.1). Totals read as an equation: recorded sales plus selisih equals the reported total.
 * It is read-only: a day is edited in Daily close, which each row links to. Only Delete revenue entry changes data,
 * and it asks first.
 */
export function RevenueReport({
  period,
  today,
  entries,
  adjustments,
  onChanged,
}: {
  period: ReportPeriod;
  today: string;
  entries: SalesEntry[];
  adjustments: MonthlyAdjustment[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const rangeLabel = formatPeriodRange(period);
  const rows = useMemo(() => entriesInPeriod(entries, period), [entries, period]);
  const recorded = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);
  const paymentTotals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          bca: sum.bca + row.bca,
          cash: sum.cash + row.cash,
          soundbox: sum.soundbox + row.soundbox,
          other: sum.other + row.other,
        }),
        { bca: 0, cash: 0, soundbox: 0, other: 0 }
      ),
    [rows]
  );
  const selisih = useMemo(() => selisihForPeriod(adjustments, period, today), [adjustments, period, today]);
  const reported = recorded + selisih.amount;
  const series = useMemo(() => dailyRevenueSeries(entries, period), [entries, period]);
  const stats = useMemo(() => closedDayStats(entries, period, today), [entries, period, today]);
  const takeaway = useMemo(
    () => revenueTakeaway(latestClosedDays(entries, period, today), { money: idr, day: formatDayDisplay }),
    [entries, period, today]
  );
  const duplicates = useMemo(() => findDuplicateSalesDates(entries), [entries]);

  // The closed days (today excluded, as in closedDayStats) with the date of the lowest and highest, for the figures.
  const extremes = useMemo(() => {
    const closed = series.flatMap((point) => (point.total !== null && point.date < today ? [{ date: point.date, total: point.total }] : []));
    let lowest: { date: string; total: number } | null = null;
    let highest: { date: string; total: number } | null = null;
    for (const day of closed) {
      if (!lowest || day.total < lowest.total) lowest = day;
      if (!highest || day.total > highest.total) highest = day;
    }
    return { lowest, highest };
  }, [series, today]);

  const points = useMemo<DayPoint[]>(
    () =>
      series.map((point) => ({
        date: point.date,
        label: chartLabel(point.date, "day"),
        total: point.total ?? 0,
        kind:
          point.date === today
            ? "today"
            : point.total === null
              ? "missing"
              : point.date === extremes.highest?.date
                ? "best"
                : "closed",
      })),
    [series, today, extremes]
  );

  // Says which whole months the figure comes from, and names a whole month that has no selisih saved.
  const wholeMonths = useMemo(
    () => revenueByMonth(entries, adjustments, period, today).filter((row) => row.wholeMonth).map((row) => formatMonthDisplay(row.month)),
    [adjustments, entries, period, today]
  );
  const selisihNote = selisih.includedMonths.length > 0
    ? `Added for ${selisih.includedMonths.map((item) => formatMonthDisplay(item.month)).join(", ")}`
    : selisih.pendingMonths.length > 0
      ? `Counts after ${formatMonthDisplay(selisih.pendingMonths[0].month)} ends`
      : wholeMonths.length > 0
        ? `No selisih saved for ${wholeMonths.join(", ")}`
        : "No whole month in this period, so none is added";

  const missingDays = series.filter((point) => point.total === null && point.date !== today).length;
  const chartDescription = extremes.highest
    ? `Daily revenue for ${rangeLabel}. Highest ${formatDayDisplay(extremes.highest.date)}, ${idr(extremes.highest.total)}. ${missingDays} ${missingDays === 1 ? "day has" : "days have"} no revenue recorded.`
    : `Daily revenue for ${rangeLabel}. No closed day has revenue yet.`;

  const legend: LegendItem[] = [
    { label: "Closed day", swatch: chartColors.series },
    { label: "Best day", swatch: chartColors.highlight },
    { label: "Today, open", swatch: chartColors.today, dashed: true },
    { label: "No revenue recorded", swatch: chartColors.today, dotted: true },
    { label: "Average", swatch: chartColors.average, dashed: true },
  ];

  function exportDailyRows() {
    downloadCSV(
      `porcafe-daily-rows-${period.from}-to-${period.to}.csv`,
      dailyRevenueRows(entries, period).map((row) => ({
        date: row.date,
        bca: row.bca,
        cash: row.cash,
        soundbox: row.soundbox,
        other: row.other,
        total: row.total,
        note: row.note,
      }))
    );
  }

  function exportGroupedTotals() {
    downloadCSV(
      `porcafe-totals-by-month-${period.from}-to-${period.to}.csv`,
      revenueByMonth(entries, adjustments, period, today).map((row) => ({
        month: row.month,
        "days recorded": row.daysRecorded,
        recorded: row.recorded,
        selisih: row.selisih,
        reported: row.reported,
        "whole month": row.wholeMonth ? "yes" : "no",
      }))
    );
  }

  async function removeEntry(entry: SalesEntry) {
    const ok = await confirm({
      title: "Delete revenue entry?",
      body: `The revenue entry for ${formatDisplay(entry.date)} will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSalesEntry(entry.id);
      toast.success("Entry deleted");
      onChanged();
    } catch (err) {
      console.error("Failed to delete revenue entry:", err);
      toast.error(err instanceof Error ? err.message : "Could not delete entry");
    }
  }

  const columns: Column<SalesEntry>[] = [
    { key: "date", label: "Date", cell: (row) => formatDisplay(row.date), phone: "title" },
    { key: "bca", label: "BCA · Rp", align: "right", cell: (row) => digits(row.bca), headClassName: "whitespace-normal" },
    { key: "cash", label: "Cash · Rp", align: "right", cell: (row) => digits(row.cash), headClassName: "whitespace-normal" },
    { key: "soundbox", label: "Soundbox · Rp", align: "right", cell: (row) => digits(row.soundbox), headClassName: "whitespace-normal" },
    { key: "other", label: "Other · Rp", align: "right", cell: (row) => digits(row.other), headClassName: "whitespace-normal" },
    { key: "total", label: "Total · Rp", align: "right", cell: (row) => <span className="font-semibold">{digits(row.total)}</span>, phone: "figure" },
    { key: "note", label: "Note", cell: (row) => row.note ?? "", phone: "meta", cellClassName: "whitespace-normal text-ink-muted" },
  ];

  // Each row keeps its actions in one ⋯ menu: edit the day in Daily close, or delete the revenue entry.
  function rowActions(row: SalesEntry) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${formatDisplay(row.date)}`}>
            <Ellipsis strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/items?date=${row.date}`}>Edit in Daily close</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void removeEntry(row)}>
            Delete revenue entry
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const selisihValue = selisih.amount < 0 ? `− ${idr(-selisih.amount)}` : idr(selisih.amount);

  return (
    <div className="space-y-5">
      {duplicates.length > 0 ? <DuplicateDatesBanner count={duplicates.length} /> : null}

      <section aria-labelledby="revenue-equation-heading" className="space-y-3">
        <h2 id="revenue-equation-heading" className="font-display text-title-2 text-ink">
          Revenue for {rangeLabel}
        </h2>
        <Card className="gap-0 overflow-hidden py-0 shadow-card">
          <div className="grid tablet:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] tablet:items-stretch">
            <EquationCell
              label="Recorded sales"
              value={idr(recorded)}
              note={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
            />
            <Operator symbol="+" />
            <EquationCell
              label="Selisih"
              value={selisihValue}
              note={
                <span className="inline-flex items-start gap-1.5">
                  {selisih.pendingMonths.length > 0 ? <ToneShape tone="info" className="mt-1 text-info" /> : null}
                  <span>{selisihNote}</span>
                </span>
              }
            />
            <Operator symbol="=" />
            <EquationCell label="Reported total" value={idr(reported)} note="Recorded sales plus selisih" emphasized />
          </div>
        </Card>
        {selisih.partialMonths.length > 0 ? (
          <p className="text-small text-ink-muted">
            {selisih.partialMonths.map((item) => formatMonthDisplay(item.month)).join(", ")}{" "}
            {selisih.partialMonths.length === 1 ? "has" : "have"} a selisih, but this period covers only part of{" "}
            {selisih.partialMonths.length === 1 ? "that month" : "those months"}, so {selisih.partialMonths.length === 1 ? "it is" : "they are"} not added.
          </p>
        ) : null}
      </section>

      <div className="grid gap-5 desk:grid-cols-[minmax(0,1fr)_20rem] desk:items-start">
        <Card className="gap-0 py-0 shadow-card">
          <div className="p-5 tablet:p-6">
            <h2 className="font-display text-title-2 text-ink">Daily revenue</h2>
            <p className="mt-1 text-small text-ink-muted">Closed days only. Today is still in progress, so it is left out of the averages.</p>
            <div className="mt-4 grid gap-3 tablet:grid-cols-3 tablet:gap-4">
              <Figure label="Average" value={stats.average === null ? "—" : idr(stats.average)} />
              <Figure
                label="Lowest"
                value={stats.lowest === null ? "—" : idr(stats.lowest)}
                note={extremes.lowest ? shortDay(extremes.lowest.date) : undefined}
              />
              <Figure
                label="Highest"
                value={stats.highest === null ? "—" : idr(stats.highest)}
                note={extremes.highest ? shortDay(extremes.highest.date) : undefined}
              />
            </div>
            <div className="mt-5">
              {rows.length === 0 ? (
                <p className="flex h-48 items-center justify-center rounded-md border border-dashed border-line-input text-body text-ink-muted">
                  No revenue recorded in this period
                </p>
              ) : (
                <ChartFrame
                  label={chartDescription}
                  legend={legend}
                  takeaway={takeaway}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={points} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={chartColors.grid} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={12}
                        fontSize={11.5}
                        stroke={chartColors.other}
                        tick={{ fill: "var(--color-ink-muted)" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        fontSize={11.5}
                        stroke={chartColors.other}
                        tickFormatter={(value) => shortJt(Number(value))}
                        tick={{ fill: "var(--color-ink-muted)" }}
                      />
                      <Tooltip
                        formatter={(value, _name, item) =>
                          (item.payload as DayPoint | undefined)?.kind === "missing" ? "No revenue recorded" : idr(Number(value))
                        }
                      />
                      {stats.average !== null && stats.average > 0 ? (
                        <ReferenceLine
                          y={stats.average}
                          stroke={chartColors.average}
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{ value: `avg ${shortJt(stats.average)}`, position: "insideTopRight", fontSize: 11, fill: "var(--color-ink)" }}
                        />
                      ) : null}
                      <Bar dataKey="total" shape={DaySlot} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              )}
            </div>
          </div>
        </Card>

        <MonthlyReconciliation period={period} entries={entries} adjustments={adjustments} onSaved={onChanged} />
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-card">
        <div className="flex flex-col gap-4 p-5 tablet:flex-row tablet:items-start tablet:justify-between tablet:p-6">
          <div>
            <h2 className="font-display text-title-2 text-ink">Days in this period</h2>
            <p className="mt-1 text-small text-ink-muted">Read-only. To change a day, open it in Daily close.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={exportDailyRows} disabled={rows.length === 0}>
              <Download strokeWidth={1.5} aria-hidden="true" />
              Daily rows (with payment split)
            </Button>
            <Button variant="ghost" size="sm" onClick={exportGroupedTotals}>
              <Download strokeWidth={1.5} aria-hidden="true" />
              Grouped totals by month
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 pb-6 tablet:px-6">
            <EmptyState title="No revenue recorded in this period">Recorded sales come from Daily close. Pick another period to see other days.</EmptyState>
          </div>
        ) : (
          <div className="border-t border-line">
            <DataTable<SalesEntry>
              caption={`Revenue by day, ${rangeLabel}`}
              columns={columns}
              rows={rows}
              getKey={(row) => row.id}
              density="compact"
              listBelow="desk"
              rowActions={rowActions}
              phoneDetail={(row) =>
                `BCA ${idr(row.bca)} · Cash ${idr(row.cash)} · Soundbox ${idr(row.soundbox)} · Other ${idr(row.other)}`
              }
              footer={{
                label: "Recorded sales in this period",
                cells: {
                  bca: digits(paymentTotals.bca),
                  cash: digits(paymentTotals.cash),
                  soundbox: digits(paymentTotals.soundbox),
                  other: digits(paymentTotals.other),
                  total: idr(recorded),
                },
                phoneDetail: `BCA ${idr(paymentTotals.bca)} · Cash ${idr(paymentTotals.cash)} · Soundbox ${idr(paymentTotals.soundbox)} · Other ${idr(paymentTotals.other)}`,
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
