"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { WeekdayPatternAnalysis, type WeekdayMetricOption } from "@/components/weekday-pattern-analysis";
import { idr } from "@/lib/dates";
import { formatQuantity, topMainItemByWeekday } from "@/lib/item-report";
import { formatPeriodRange, type ReportPeriod } from "@/lib/report-period";
import { analyzeWeekdayPattern } from "@/lib/weekday-analysis";
import type { ItemSale, SalesEntry } from "@/lib/types";

const SALES_METRICS: WeekdayMetricOption[] = [
  {
    key: "average",
    label: "Average sales",
    valueLabel: "Average / occurrence",
    unit: "Rp",
    getValue: (row) => row.average,
    formatValue: idr,
  },
  {
    key: "total",
    label: "Total sales",
    valueLabel: "Total recorded",
    unit: "Rp",
    getValue: (row) => row.total,
    formatValue: idr,
  },
  {
    key: "records",
    label: "Sales entries",
    valueLabel: "Entries",
    getValue: (row) => row.recordCount,
    formatValue: (value) => value.toLocaleString(),
  },
];

const PORTION_METRICS: WeekdayMetricOption[] = [
  {
    key: "average",
    label: "Average Main portions",
    valueLabel: "Average / selling day",
    getValue: (row) => row.average,
    formatValue: formatQuantity,
  },
  {
    key: "total",
    label: "Total Main portions",
    valueLabel: "Total recorded",
    getValue: (row) => row.total,
    formatValue: formatQuantity,
  },
  {
    key: "records",
    label: "Item rows",
    valueLabel: "Rows",
    getValue: (row) => row.recordCount,
    formatValue: (value) => value.toLocaleString(),
  },
];

/**
 * The Weekday tab (inventory §3.5.3): revenue by weekday, Main portions by weekday, and the leading Main item for
 * each weekday, all for the shared period. Each pattern is a table with drawn bars, not a chart.
 */
export function WeekdayReport({
  period,
  entries,
  itemRows,
  isMain,
}: {
  period: ReportPeriod;
  entries: SalesEntry[];
  itemRows: ItemSale[];
  isMain: (row: ItemSale) => boolean;
}) {
  const [salesMetric, setSalesMetric] = useState("average");
  const [portionMetric, setPortionMetric] = useState("average");
  const rangeLabel = formatPeriodRange(period);

  const salesSummary = useMemo(
    () => analyzeWeekdayPattern(entries, {
      from: period.from,
      to: period.to,
      getDate: (entry) => entry.date,
      getValue: (entry) => entry.total,
    }),
    [entries, period]
  );

  const mainRows = useMemo(() => itemRows.filter(isMain), [isMain, itemRows]);
  const portionSummary = useMemo(
    () => analyzeWeekdayPattern(mainRows, {
      from: period.from,
      to: period.to,
      getDate: (row) => row.date,
      getValue: (row) => row.qty,
      occurrenceMode: "observed",
    }),
    [mainRows, period]
  );

  const topByWeekday = useMemo(() => topMainItemByWeekday(itemRows, isMain, period), [isMain, itemRows, period]);

  const topColumns: Column<{ weekday: string; top: { name: string; qty: number } | null }>[] = [
    { key: "weekday", label: "Weekday", cell: (row) => row.weekday, phone: "title", cellClassName: "font-medium" },
    {
      key: "item",
      label: "Top item",
      cell: (row) => row.top?.name ?? <span className="text-ink-muted">No Main sold</span>,
      phone: "meta",
    },
    {
      key: "portions",
      label: "Portions",
      align: "right",
      cell: (row) => (row.top ? formatQuantity(row.top.qty) : "—"),
      phone: "figure",
    },
  ];

  return (
    <div className="space-y-5">
      <WeekdayPatternAnalysis
        id="reports-sales-weekday"
        title="Sales pattern by weekday"
        description="Compare recorded revenue across weekdays in this period to spot recurring patterns."
        rangeDescription="Recorded sales only; selisih is excluded."
        from={period.from}
        to={period.to}
        summary={salesSummary}
        metrics={SALES_METRICS}
        activeMetric={salesMetric}
        onMetricChange={setSalesMetric}
        emptyLabel="No recorded revenue falls in this period. Try another period, or check Daily close."
        totalLabel="Recorded sales in period"
        formatTotal={idr}
        formatAverage={idr}
        recordLabel="Sales entries"
        money
      />

      <WeekdayPatternAnalysis
        id="reports-portions-weekday"
        title="Main portions sold by weekday"
        description="Compare recorded Main portions across weekdays to spot recurring patterns."
        rangeDescription="Main items only; Add Ons and no-sales days are excluded. The data has item rows, not customer transaction IDs."
        from={period.from}
        to={period.to}
        summary={portionSummary}
        metrics={PORTION_METRICS}
        activeMetric={portionMetric}
        onMetricChange={setPortionMetric}
        emptyLabel="No Main portions fall in this period. Try another period, or log a daily close."
        totalLabel="Main portions in period"
        formatTotal={formatQuantity}
        formatAverage={formatQuantity}
        recordLabel="Main item rows"
        money={false}
        averageBasis="observed"
        occurrenceLabel="Selling days"
      />

      <Card className="gap-0 py-0 shadow-card">
        <div className="space-y-4 p-5 tablet:p-6">
          <div>
            <h2 className="font-display text-title-2 text-ink">Top Main item by weekday</h2>
            <p className="mt-1 text-small text-ink-muted">The leading Main item for each weekday in {rangeLabel}.</p>
          </div>
          {mainRows.length === 0 ? (
            <p className="flex h-32 items-center justify-center rounded-md border border-dashed border-line-input px-4 text-center text-body text-ink-muted">
              No Main portions are available for this period.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-line">
              <DataTable
                caption={`Top Main item by weekday, ${rangeLabel}`}
                columns={topColumns}
                rows={topByWeekday}
                getKey={(row) => row.weekday}
                density="compact"
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
