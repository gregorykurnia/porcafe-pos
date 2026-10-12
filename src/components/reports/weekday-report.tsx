import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    getValue: (row) => row.average,
    formatValue: idr,
  },
  {
    key: "total",
    label: "Total sales",
    valueLabel: "Total recorded",
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
 * The Weekday tab: revenue by weekday, Main portions by weekday, and the leading Main item for each
 * weekday, all for the shared period.
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

  return (
    <div className="space-y-6">
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
        averageBasis="observed"
        occurrenceLabel="Selling days"
      />

      <Card>
        <CardHeader>
          <CardTitle>Top Main item by weekday</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">The leading Main item for each weekday in {rangeLabel}.</p>
        </CardHeader>
        <CardContent>
          {mainRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              No Main portions are available for this period.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border" role="region" tabIndex={0} aria-label="Top item by weekday table">
              <Table className="min-w-[28rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Weekday</TableHead>
                    <TableHead>Top item</TableHead>
                    <TableHead className="text-right">Portions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topByWeekday.map(({ weekday, top }) => (
                    <TableRow key={weekday}>
                      <TableCell className="font-medium">{weekday}</TableCell>
                      <TableCell>{top?.name ?? <span className="text-muted-foreground">No Main sold</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{top ? formatQuantity(top.qty) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
