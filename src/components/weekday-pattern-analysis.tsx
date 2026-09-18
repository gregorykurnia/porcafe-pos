"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDisplay } from "@/lib/dates";
import type { WeekdayPatternRow, WeekdayPatternSummary } from "@/lib/weekday-analysis";

export type WeekdayMetricOption = {
  key: string;
  label: string;
  valueLabel: string;
  getValue: (row: WeekdayPatternRow) => number;
  formatValue: (value: number) => string;
};

type WeekdayPatternAnalysisProps = {
  id: string;
  title: string;
  description: string;
  rangeDescription: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  summary: WeekdayPatternSummary;
  metrics: WeekdayMetricOption[];
  activeMetric: string;
  onMetricChange: (value: string) => void;
  loading?: boolean;
  error?: boolean;
  emptyLabel: string;
  totalLabel: string;
  formatTotal: (value: number) => string;
  formatAverage: (value: number) => string;
  recordLabel: string;
  children?: ReactNode;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function rangeLabel(summary: WeekdayPatternSummary): string {
  if (summary.rangeDays === 0) return "Choose a valid date range.";
  return `${formatDisplay(summary.from)} – ${formatDisplay(summary.to)}`;
}

function patternTakeaway(
  summary: WeekdayPatternSummary,
  formatAverage: (value: number) => string
): string {
  if (summary.recordCount === 0 || !summary.best || !summary.weakest) {
    return "No recorded data is available for this range yet.";
  }

  if (summary.best.key === summary.weakest.key) {
    return `${summary.best.label} is the only weekday with recorded data, averaging ${formatAverage(summary.best.average)} per calendar occurrence.`;
  }

  return `${summary.best.label} leads at ${formatAverage(summary.best.average)} per calendar occurrence. ${summary.weakest.label} is lowest among weekdays with recorded data at ${formatAverage(summary.weakest.average)}.`;
}

export function WeekdayPatternAnalysis({
  id,
  title,
  description,
  rangeDescription,
  from,
  to,
  onFromChange,
  onToChange,
  summary,
  metrics,
  activeMetric,
  onMetricChange,
  loading = false,
  error = false,
  emptyLabel,
  totalLabel,
  formatTotal,
  formatAverage,
  recordLabel,
  children,
}: WeekdayPatternAnalysisProps) {
  const selectedMetric = metrics.find((metric) => metric.key === activeMetric) ?? metrics[0];
  if (!selectedMetric) return null;

  const chartData = summary.rows.map((row) => ({
    label: row.shortLabel,
    value: selectedMetric.getValue(row),
    weekday: row.label,
    occurrences: row.occurrences,
    observedDays: row.observedDays,
    records: row.recordCount,
  }));

  const isInvalidRange = Boolean(from && to && from > to);
  const showData = !loading && !error && !isInvalidRange && summary.recordCount > 0;

  return (
    <Card id={id}>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
              aria-label={`${title} start date`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
              aria-label={`${title} end date`}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {rangeDescription} <span className="font-medium text-foreground">{rangeLabel(summary)}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={selectedMetric.key} onValueChange={onMetricChange}>
          <TabsList aria-label={`${title} metric`}>
            {metrics.map((metric) => (
              <TabsTrigger key={metric.key} value={metric.key}>
                {metric.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3 rounded-xl border border-border p-4" aria-label={`Loading ${title}`}>
            {[1, 2, 3].map((row) => <div key={row} className="h-8 animate-pulse rounded bg-muted" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center text-sm text-muted-foreground">
            {title} is unavailable while the data connection is being restored.
          </div>
        ) : isInvalidRange ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center text-sm text-danger">
            The start date must be on or before the end date.
          </div>
        ) : !showData ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">{totalLabel}</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{formatTotal(summary.total)}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">Observed days</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{summary.observedDays.toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">of {summary.rangeDays.toLocaleString()} calendar days</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-muted-foreground">{recordLabel}</p>
                <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{summary.recordCount.toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Duplicate records remain visible</p>
              </div>
            </div>

            <div className="rounded-xl border border-warm-accent bg-warm-accent/45 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Pattern read:</span>{" "}
              {patternTakeaway(summary, formatAverage)}
            </div>

            <div className="h-[240px] w-full" aria-label={`${title} chart`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(value) => selectedMetric.formatValue(Number(value))}
                  />
                  <Tooltip
                    labelFormatter={(label) => chartData.find((item) => item.label === label)?.weekday ?? String(label)}
                    formatter={(value) => selectedMetric.formatValue(Number(value))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  />
                  <Bar dataKey="value" name={selectedMetric.valueLabel} fill="var(--primary-brand)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto rounded-xl border" role="region" tabIndex={0} aria-label={`${title} data table`}>
              <Table className="min-w-[46rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Weekday</TableHead>
                    <TableHead className="text-right">{selectedMetric.valueLabel}</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Observed days</TableHead>
                    <TableHead className="text-right">Occurrences</TableHead>
                    <TableHead className="text-right">{recordLabel}</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{selectedMetric.formatValue(selectedMetric.getValue(row))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTotal(row.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{row.observedDays}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{row.occurrences}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{row.recordCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{formatPercent(row.share)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">How to read this:</span> averages use all calendar occurrences in the selected range, including weekdays with no recorded row. Use observed days and records to judge data coverage.
            </p>
          </>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
