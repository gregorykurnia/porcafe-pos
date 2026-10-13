"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ChartFrame, type LegendItem } from "@/components/patterns/chart-frame";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatStrip } from "@/components/patterns/stat-strip";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import { chartColors } from "@/lib/chart-colors";
import { downloadCSV } from "@/lib/csv";
import { formatDisplay } from "@/lib/dates";
import {
  chartLabel,
  formatQuantity,
  itemDetailRows,
  itemDetailSummary,
  mainQtyInBucket,
  periodKey,
  periodLabel,
  qtyByPeriod,
  shiftCursor,
  summarizeItemPeriod,
  topSellers,
  type Grain,
  type ItemDetailRow,
  type ItemDetailStatus,
} from "@/lib/item-report";
import { formatPeriodRange, type ReportPeriod } from "@/lib/report-period";
import { cn } from "@/lib/utils";
import type { DailyItemLog, ItemSale, MenuItem } from "@/lib/types";

const STEP_OPTIONS: { value: Grain; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const RECAP_OPTIONS: { value: Grain; label: string }[] = [
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
];

// DESIGN_SYSTEM §6, item day: Sold is ok, Not logged needs a person, and 0 sold and No sales are neutral.
const DETAIL_TONE: Record<ItemDetailStatus, StatusTone> = {
  Sold: "ok",
  "0 sold": "neutral",
  "No sales": "neutral",
  "Not logged": "warn",
};

/** A short date for a list of days: "5 Oct". */
function shortDate(date: string): string {
  return format(parseISO(date), "d MMM");
}

/** A drawn bar: the fraction of the largest value in the list. The figure beside it carries the number. */
function MeterBar({ fraction, highlight = false, className }: { fraction: number; highlight?: boolean; className?: string }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return (
    <span aria-hidden="true" className={cn("relative block h-2 rounded-full bg-sunken", className)}>
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={
          highlight
            ? { width, background: chartColors.highlight }
            : { width, background: chartColors.series, opacity: chartColors.seriesOpacity }
        }
      />
    </span>
  );
}

/** One day's bar. A day with no close is a dotted baseline, so it never reads as zero sold. */
type DayBar = { label: string; qty: number; status: ItemDetailStatus };

function DayBarShape(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: DayBar;
  };
  const baseline = y + height;
  if (!payload) return <g />;
  if (payload.status === "Not logged") {
    return <line x1={x} x2={x + width} y1={baseline - 1} y2={baseline - 1} stroke={chartColors.today} strokeWidth={2} strokeDasharray="2 3" />;
  }
  return <rect x={x} y={y} width={width} height={height} rx={6} fill={chartColors.series} fillOpacity={chartColors.seriesOpacity} />;
}

function DetailCell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 p-4 tablet:p-5">
      <p className="text-small text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-fig-m tabular-nums text-ink">{value}</p>
      {note ? <p className="mt-1 text-small text-ink-muted [overflow-wrap:anywhere]">{note}</p> : null}
    </div>
  );
}

/**
 * The Items tab (inventory §3.5.2). Every card reads the shared period, except Main portions, stepped, which has
 * its own cursor on purpose and says so. Nothing here writes data; the two CSV exports only download a file.
 */
export function ItemsReport({
  period,
  today,
  menuItems,
  itemRows,
  dailyLogs,
  loggedDates,
  isMain,
}: {
  period: ReportPeriod;
  today: string;
  menuItems: MenuItem[];
  itemRows: ItemSale[];
  dailyLogs: DailyItemLog[];
  loggedDates: string[];
  isMain: (row: ItemSale) => boolean;
}) {
  const rangeLabel = formatPeriodRange(period);
  const [detailItemId, setDetailItemId] = useState("all");
  const [recapGrain, setRecapGrain] = useState<Grain>("day");
  const [recapItemId, setRecapItemId] = useState("all");
  const [navGrain, setNavGrain] = useState<Grain>("day");
  const [navCursor, setNavCursor] = useState(today);

  const summary = useMemo(
    () => summarizeItemPeriod({ rows: itemRows, loggedDates, isMain, period }),
    [isMain, itemRows, loggedDates, period]
  );
  const detailRows = useMemo(
    () => (detailItemId === "all" ? [] : itemDetailRows({ rows: itemRows, dailyLogs, itemId: detailItemId, period })),
    [dailyLogs, detailItemId, itemRows, period]
  );
  const detailSummary = useMemo(() => itemDetailSummary(detailRows), [detailRows]);
  const recapBuckets = useMemo(
    () => qtyByPeriod(
      recapItemId === "all" ? itemRows : itemRows.filter((row) => row.itemId === recapItemId),
      recapGrain,
      period
    ),
    [itemRows, period, recapGrain, recapItemId]
  );
  const sellers = useMemo(() => topSellers(itemRows, period), [itemRows, period]);
  const navKey = periodKey(navCursor, navGrain);
  const navTotal = useMemo(() => mainQtyInBucket(itemRows, isMain, navGrain, navKey), [isMain, itemRows, navGrain, navKey]);

  function exportItemDetailCSV() {
    const item = menuItems.find((menuItem) => menuItem.id === detailItemId);
    if (!item || detailRows.length === 0) return;
    const slug = item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCSV(
      `porcafe-${slug || "item"}-${period.from}-to-${period.to}.csv`,
      detailRows.map((row) => ({ date: row.date, item: item.name, qty: row.qty, status: row.status }))
    );
  }

  function exportRecapCSV() {
    downloadCSV(
      `porcafe-items-${recapGrain}-${period.from}-to-${period.to}.csv`,
      recapBuckets.map((bucket) => ({ period: periodLabel(bucket.key, recapGrain), qty: bucket.qty }))
    );
  }

  const recapTakeaway = (() => {
    const latest = recapBuckets[recapBuckets.length - 1];
    const previous = recapBuckets[recapBuckets.length - 2];
    if (!latest) return "No item sales in this period.";
    if (!previous) return `One period has ${formatQuantity(latest.qty)} portions.`;
    return latest.qty >= previous.qty
      ? `The latest period is at or above the previous period at ${formatQuantity(latest.qty)} portions.`
      : `The latest period is below the previous period at ${formatQuantity(latest.qty)} portions.`;
  })();

  const sellersTakeaway = sellers.length > 0
    ? `${sellers[0].name} leads with ${formatQuantity(sellers[0].qty)} portions.`
    : "No item sales in this period.";

  const detailName = menuItems.find((menuItem) => menuItem.id === detailItemId)?.name;
  const topSellerQty = sellers[0]?.qty ?? 0;
  const maxRecapQty = Math.max(0, ...recapBuckets.map((bucket) => bucket.qty));
  const unloggedDays = detailRows.filter((row) => row.status === "Not logged").map((row) => shortDate(row.date));

  const dayBars: DayBar[] = detailRows.map((row) => ({ label: chartLabel(row.date, "day"), qty: row.qty, status: row.status }));
  const detailDescription = `${detailName ?? "Item"} portions per day for ${rangeLabel}: ${formatQuantity(detailSummary.totalQty)} portions across ${detailSummary.loggedDays} logged days, including ${detailSummary.noSalesDays} no-sales days. ${detailSummary.unloggedDays} ${detailSummary.unloggedDays === 1 ? "day is" : "days are"} not logged.`;
  const detailLegend: LegendItem[] = [
    { label: "Portions sold", swatch: chartColors.series },
    { label: "Not logged", swatch: chartColors.today, dotted: true },
  ];

  const detailColumns: Column<ItemDetailRow>[] = [
    { key: "date", label: "Date", cell: (row) => formatDisplay(row.date), phone: "title" },
    {
      key: "qty",
      label: "Qty",
      align: "right",
      cell: (row) => (row.status === "Not logged" ? "—" : formatQuantity(row.qty)),
      phone: "figure",
      cellClassName: "font-medium",
    },
    {
      key: "status",
      label: "Day status",
      cell: (row) => <StatusChip tone={DETAIL_TONE[row.status]}>{row.status}</StatusChip>,
      phone: "meta",
    },
  ];

  return (
    <div className="space-y-5">
      <StatStrip
        label="Items summary"
        cells={[
          { label: "Total portions", value: formatQuantity(summary.totalQty), note: rangeLabel },
          { label: "Logged days", value: summary.loggedDays.toLocaleString(), note: "Includes explicit no-sales days" },
          {
            label: "Main portions per selling day",
            value: summary.averageMainQty === null ? "—" : summary.averageMainQty.toFixed(1),
            note: [
              summary.sellingDays === 0
                ? "No Main portions in this period"
                : `${summary.sellingDays} selling ${summary.sellingDays === 1 ? "day" : "days"} with a Main sold`,
              summary.bestMainDay ? `Best: ${formatDisplay(summary.bestMainDay.date)}, ${formatQuantity(summary.bestMainDay.qty)}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          },
          {
            label: "Top item",
            value: summary.topItem?.name ?? "No data yet",
            note: summary.topItem ? `${formatQuantity(summary.topItem.qty)} portions` : "No item sales in this period",
          },
        ]}
      />

      <Card className="gap-0 overflow-hidden py-0 shadow-card">
        <div className="flex flex-col gap-4 p-5 tablet:flex-row tablet:items-end tablet:justify-between tablet:p-6">
          <div className="min-w-0">
            <h2 className="font-display text-title-2 text-ink">Item detail</h2>
            <p className="mt-1 text-small text-ink-muted">One item&apos;s quantity for every day in {rangeLabel}.</p>
          </div>
          <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-detail-item" className="text-small text-ink-muted">Item</label>
              <Select value={detailItemId} onValueChange={setDetailItemId}>
                <SelectTrigger id="item-detail-item" className="w-full tablet:w-72">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select an item</SelectItem>
                  {menuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.active === false ? " (Archived)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportItemDetailCSV}
              disabled={detailItemId === "all" || detailRows.length === 0}
            >
              <Download strokeWidth={1.5} aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        </div>

        {detailItemId === "all" ? (
          <div className="border-t border-line p-5 tablet:p-6">
            <p className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-input text-body text-ink-muted">
              Select an item to see its quantity breakdown.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 border-y border-line tablet:grid-cols-5">
              <DetailCell label="Total sold" value={formatQuantity(detailSummary.totalQty)} />
              <DetailCell
                label="Average / logged day"
                value={detailSummary.averageQty === null ? "—" : detailSummary.averageQty.toFixed(1)}
              />
              <DetailCell label="Sales days" value={String(detailSummary.salesDays)} />
              <DetailCell label="No-sales days" value={String(detailSummary.noSalesDays)} />
              <DetailCell
                label="Unlogged days"
                value={String(detailSummary.unloggedDays)}
                note={unloggedDays.length > 0 ? unloggedDays.join(", ") : undefined}
              />
            </div>

            <div className="grid gap-5 p-5 tablet:p-6 desk:grid-cols-[minmax(0,1fr)_20rem] desk:items-start">
              <div className="min-w-0">
                <ChartFrame label={detailDescription} legend={detailLegend} takeaway={`${formatQuantity(detailSummary.totalQty)} portions across ${detailSummary.loggedDays} logged days, including ${detailSummary.noSalesDays} no-sales days.`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dayBars} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
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
                        width={32}
                        allowDecimals={false}
                        fontSize={11.5}
                        stroke={chartColors.other}
                        tick={{ fill: "var(--color-ink-muted)" }}
                      />
                      <Tooltip
                        formatter={(value, _name, item) =>
                          (item.payload as DayBar | undefined)?.status === "Not logged" ? "Not logged" : `${formatQuantity(Number(value))} portions`
                        }
                      />
                      <Bar dataKey="qty" name={detailName ?? "Portions"} shape={DayBarShape} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>

              <div
                role="region"
                tabIndex={0}
                aria-label={`Item detail by day, ${rangeLabel}`}
                className="min-w-0 rounded-md border border-line desk:max-h-[26rem] desk:overflow-y-auto"
              >
                <DataTable<ItemDetailRow>
                  caption={`${detailName ?? "Item"} by day, ${rangeLabel}`}
                  columns={detailColumns}
                  rows={detailRows}
                  getKey={(row) => row.date}
                  listBelow="desk"
                />
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-5 tablet:grid-cols-2 desk:grid-cols-3 desk:items-start">
        <Card className="gap-0 py-0 shadow-card">
          <div className="space-y-4 p-5 tablet:p-6">
            <div>
              <h2 className="font-display text-title-2 text-ink">Top sellers</h2>
              <p className="mt-1 text-small text-ink-muted">{rangeLabel}</p>
            </div>
            {sellers.length === 0 ? (
              <p className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-input text-body text-ink-muted">
                No item sales in this period
              </p>
            ) : (
              <div role="region" tabIndex={0} aria-label={`Top sellers, ${rangeLabel}`} className="max-h-96 overflow-y-auto">
                <ol className="divide-y divide-line">
                  {sellers.map((seller, index) => (
                    <li key={seller.name} className="flex items-start gap-3 py-2.5 text-table">
                      <span className="w-5 shrink-0 pt-px font-display text-ink-muted tabular-nums">{index + 1}</span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 [overflow-wrap:anywhere]">{seller.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{formatQuantity(seller.qty)}</span>
                        </div>
                        <MeterBar className="w-full" fraction={topSellerQty > 0 ? seller.qty / topSellerQty : 0} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="border-t border-line pt-3 text-small text-ink-muted">{sellersTakeaway}</p>
          </div>
        </Card>

        <Card className="gap-0 py-0 shadow-card">
          <div className="space-y-4 p-5 tablet:p-6">
            <div>
              <h2 className="font-display text-title-2 text-ink">Main portions, stepped</h2>
              <p className="mt-1 text-small text-ink-muted">Uses its own steps, not the report period.</p>
            </div>
            <SegmentedControl
              label="Main portions step size"
              value={navGrain}
              options={STEP_OPTIONS}
              onChange={(value) => {
                setNavGrain(value);
                setNavCursor(today);
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Previous Main portions period"
                onClick={() => setNavCursor((cursor) => shiftCursor(cursor, navGrain, -1))}
              >
                <ChevronLeft strokeWidth={1.5} aria-hidden="true" />
              </Button>
              <p className="min-w-0 flex-1 text-center text-table font-medium text-ink">{periodLabel(navKey, navGrain)}</p>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Next Main portions period"
                onClick={() => setNavCursor((cursor) => shiftCursor(cursor, navGrain, 1))}
              >
                <ChevronRight strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <div className="text-center">
              <p className="font-display text-fig-xl tabular-nums text-ink">{formatQuantity(navTotal)}</p>
              <p className="text-small text-ink-muted">Main portions</p>
            </div>
            <div className="flex min-h-11 justify-center">
              {navCursor !== today ? (
                <Button variant="ghost" size="sm" onClick={() => setNavCursor(today)}>
                  Back to today
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="gap-0 py-0 shadow-card tablet:col-span-2 desk:col-span-1">
          <div className="space-y-4 p-5 tablet:p-6">
            <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-title-2 text-ink">Recap</h2>
                <p className="mt-1 text-small text-ink-muted">{rangeLabel}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={exportRecapCSV} disabled={recapBuckets.length === 0}>
                <Download strokeWidth={1.5} aria-hidden="true" />
                Export CSV
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl className="shrink-0" label="Recap grouping" value={recapGrain} options={RECAP_OPTIONS} onChange={setRecapGrain} />
              <Select value={recapItemId} onValueChange={setRecapItemId}>
                <SelectTrigger aria-label="Recap item filter" className="w-full min-w-44 flex-1">
                  <SelectValue placeholder="All items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  {menuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recapBuckets.length === 0 ? (
              <p className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-input text-body text-ink-muted">
                No item sales in this period
              </p>
            ) : (
              <div role="region" tabIndex={0} aria-label={`Recap portions, ${rangeLabel}`} className="max-h-96 overflow-y-auto">
                <ul className="divide-y divide-line">
                  {recapBuckets.map((bucket) => (
                    <li key={bucket.key} className="flex items-center gap-3 py-2.5 text-table">
                      <span className="w-28 shrink-0 text-ink">{chartLabel(bucket.key, recapGrain)}</span>
                      <MeterBar className="min-w-0 flex-1" fraction={maxRecapQty > 0 ? bucket.qty / maxRecapQty : 0} />
                      <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{formatQuantity(bucket.qty)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="border-t border-line pt-3 text-small text-ink-muted">{recapTakeaway}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
