import { useMemo } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCSV } from "@/lib/csv";
import { Stat } from "@/components/state/stat";
import { deleteSalesEntry, findDuplicateSalesDates } from "@/lib/data";
import { formatDayDisplay, formatDisplay, formatMonthDisplay, idr } from "@/lib/dates";
import { chartLabel } from "@/lib/item-report";
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
import { DuplicateDatesCard } from "./duplicate-dates";
import { MonthlyReconciliation } from "./monthly-reconciliation";

/**
 * The Revenue tab. It is read-only: a day is edited in Daily close, which is linked from each row.
 * Only the trash button changes data, for removing a stray entry, and it asks first.
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
  const selisih = useMemo(() => selisihForPeriod(adjustments, period), [adjustments, period]);
  const reported = recorded + selisih.amount;
  const series = useMemo(() => dailyRevenueSeries(entries, period), [entries, period]);
  const stats = useMemo(() => closedDayStats(entries, period, today), [entries, period, today]);
  const takeaway = useMemo(
    () => revenueTakeaway(latestClosedDays(entries, period, today), { money: idr, day: formatDayDisplay }),
    [entries, period, today]
  );
  const duplicates = useMemo(() => findDuplicateSalesDates(entries), [entries]);

  // Says which whole months the figure comes from, and names a whole month that has no selisih saved.
  const wholeMonths = useMemo(
    () => revenueByMonth(entries, adjustments, period).filter((row) => row.wholeMonth).map((row) => formatMonthDisplay(row.month)),
    [adjustments, entries, period]
  );
  const selisihNote = selisih.includedMonths.length > 0
    ? `Added for ${selisih.includedMonths.map((item) => formatMonthDisplay(item.month)).join(", ")}`
    : wholeMonths.length > 0
      ? `No selisih saved for ${wholeMonths.join(", ")}`
      : "No whole month in this period, so none is added";

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
      revenueByMonth(entries, adjustments, period).map((row) => ({
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

  const chartData = series.map((point) => ({ label: chartLabel(point.date, "day"), total: point.total }));

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && <DuplicateDatesCard groups={duplicates} onResolved={onChanged} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Revenue for {rangeLabel}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Recorded sales come from Daily close. Selisih is added for whole months only.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="outline" size="sm" onClick={exportDailyRows} disabled={rows.length === 0} className="h-auto min-h-8 justify-start whitespace-normal py-1.5 text-left">
              <Download className="size-3.5" /> Daily rows (with payment split) · {rangeLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={exportGroupedTotals} className="h-auto min-h-8 justify-start whitespace-normal py-1.5 text-left">
              <Download className="size-3.5" /> Grouped totals by month · {rangeLabel}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Recorded sales" value={idr(recorded)} sub={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`} />
            <Stat label="Selisih" value={idr(selisih.amount)} sub={selisihNote} />
            <Stat label="Reported total" value={idr(reported)} sub="Recorded sales plus selisih" emphasized />
          </div>
          {selisih.partialMonths.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selisih.partialMonths.map((item) => formatMonthDisplay(item.month)).join(", ")}{" "}
              {selisih.partialMonths.length === 1 ? "has" : "have"} a selisih, but this period covers only part of{" "}
              {selisih.partialMonths.length === 1 ? "that month" : "those months"}, so {selisih.partialMonths.length === 1 ? "it is" : "they are"} not added.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily revenue</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            One point per day. A gap means no revenue was recorded that day. Today is still in progress, so it is left out of the averages.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Average" value={stats.average === null ? "—" : idr(stats.average)} />
            <Stat label="Lowest" value={stats.lowest === null ? "—" : idr(stats.lowest)} />
            <Stat label="Highest" value={stats.highest === null ? "—" : idr(stats.highest)} />
          </div>
          {rows.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              No revenue recorded in this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  width={40}
                />
                <Tooltip formatter={(value) => idr(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--primary-brand)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--primary-brand)" }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Takeaway:</span> {takeaway}
          </p>
        </CardContent>
      </Card>

      <MonthlyReconciliation period={period} entries={entries} adjustments={adjustments} onSaved={onChanged} />

      <Card>
        <CardHeader>
          <CardTitle>Days in this period</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Read-only. To change a day, open it in Daily close.</p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              No revenue recorded in this period
            </p>
          ) : (
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Revenue by day">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">BCA</TableHead>
                    <TableHead className="text-right">Cash</TableHead>
                    <TableHead className="text-right">Soundbox</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-44 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{formatDisplay(row.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{idr(row.bca)}</TableCell>
                      <TableCell className="text-right tabular-nums">{idr(row.cash)}</TableCell>
                      <TableCell className="text-right tabular-nums">{idr(row.soundbox)}</TableCell>
                      <TableCell className="text-right tabular-nums">{idr(row.other)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{idr(row.total)}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">{row.note ?? ""}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/items?date=${row.date}`}>
                              Edit<span className="sr-only"> {formatDisplay(row.date)} in Daily close</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removeEntry(row)}
                            aria-label={`Delete revenue entry for ${formatDisplay(row.date)}`}
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Recorded sales in this period</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{idr(recorded)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
