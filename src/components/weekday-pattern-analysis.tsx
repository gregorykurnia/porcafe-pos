"use client";

import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { chartColors } from "@/lib/chart-colors";
import { formatPeriodRange } from "@/lib/report-period";
import { cn } from "@/lib/utils";
import type { WeekdayPatternRow, WeekdayPatternSummary } from "@/lib/weekday-analysis";

export type WeekdayMetricOption = {
  key: string;
  label: string;
  /** The metric column heading, for example "Average / occurrence". */
  valueLabel: string;
  /** "Rp" for money. Table cells then hold digits only, and the unit moves into the heading (DESIGN_SYSTEM §7). */
  unit?: "Rp";
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
  summary: WeekdayPatternSummary;
  metrics: WeekdayMetricOption[];
  activeMetric: string;
  onMetricChange: (value: string) => void;
  emptyLabel: string;
  totalLabel: string;
  /** Full text, used in the totals and the takeaway. */
  formatTotal: (value: number) => string;
  formatAverage: (value: number) => string;
  recordLabel: string;
  /** Money columns hold digits; the Rp is in the heading. */
  money: boolean;
  averageBasis?: "calendar" | "observed";
  occurrenceLabel?: string;
};

const digits = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function patternTakeaway(
  summary: WeekdayPatternSummary,
  formatAverage: (value: number) => string,
  averageBasis: "calendar" | "observed"
): string {
  const unit = averageBasis === "observed" ? "observed selling day" : "calendar occurrence";
  if (summary.recordCount === 0 || !summary.best || !summary.weakest) {
    return "No recorded data is available for this range yet.";
  }

  if (summary.best.key === summary.weakest.key) {
    return `${summary.best.label} is the only weekday with recorded data, averaging ${formatAverage(summary.best.average)} per ${unit}.`;
  }

  return `${summary.best.label} leads at ${formatAverage(summary.best.average)} per ${unit}. ${summary.weakest.label} is lowest among weekdays with recorded data at ${formatAverage(summary.weakest.average)}.`;
}

/** A drawn bar in the metric column (the mockup's inline bar). The figure beside it carries the number. */
function MetricBar({ fraction, highlight }: { fraction: number; highlight: boolean }) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return (
    <span aria-hidden="true" className="relative hidden h-2 w-24 shrink-0 rounded-full bg-sunken tablet:block">
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

/**
 * One weekday pattern (inventory §3.5.3): a metric choice, three totals, a Mon–Sun table with an inline bar in the
 * metric column, a takeaway, an "Early signal only" chip under three observed days, and a "How to read this" note.
 * Built from drawn bars and the compact table only (HTML §7), not a chart.
 */
export function WeekdayPatternAnalysis({
  id,
  title,
  description,
  rangeDescription,
  from,
  to,
  summary,
  metrics,
  activeMetric,
  onMetricChange,
  emptyLabel,
  totalLabel,
  formatTotal,
  formatAverage,
  recordLabel,
  money,
  averageBasis = "calendar",
  occurrenceLabel = "Occurrences",
}: WeekdayPatternAnalysisProps) {
  const selectedMetric = metrics.find((metric) => metric.key === activeMetric) ?? metrics[0];
  if (!selectedMetric) return null;

  const showData = summary.recordCount > 0;
  const rangeText = summary.rangeDays === 0 ? "Choose a valid date range." : formatPeriodRange({ from, to });
  const maxValue = Math.max(0, ...summary.rows.map((row) => selectedMetric.getValue(row)));
  const cellText = (value: number) => (selectedMetric.unit ? digits(value) : selectedMetric.formatValue(value));
  const metricHeading = selectedMetric.unit ? `${selectedMetric.valueLabel} · ${selectedMetric.unit}` : selectedMetric.valueLabel;

  const columns: Column<WeekdayPatternRow>[] = [
    { key: "weekday", label: "Weekday", cell: (row) => row.label, phone: "title", cellClassName: "font-medium" },
    {
      key: "metric",
      label: metricHeading,
      align: "right",
      phone: "figure",
      headClassName: "whitespace-normal",
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-3">
          <MetricBar
            fraction={maxValue > 0 ? selectedMetric.getValue(row) / maxValue : 0}
            highlight={summary.best?.key === row.key}
          />
          <span className={cn("min-w-[5.5rem] text-right font-semibold tabular-nums", summary.best?.key === row.key && "text-ink")}>
            {cellText(selectedMetric.getValue(row))}
          </span>
        </span>
      ),
    },
    {
      key: "total",
      label: money ? "Total · Rp" : "Total",
      align: "right",
      phone: "hidden",
      cell: (row) => (money ? digits(row.total) : formatTotal(row.total)),
    },
    { key: "observed", label: "Observed days", align: "right", phone: "hidden", cell: (row) => row.observedDays },
    { key: "occurrences", label: occurrenceLabel, align: "right", phone: "hidden", cell: (row) => row.occurrences },
    { key: "records", label: recordLabel, align: "right", phone: "hidden", cell: (row) => row.recordCount },
    { key: "share", label: "Share", align: "right", phone: "hidden", cell: (row) => formatPercent(row.share) },
  ];

  return (
    <Card id={id} className="gap-0 py-0 shadow-card">
      <div className="space-y-5 p-5 tablet:p-6">
        <div>
          <h2 className="font-display text-title-2 text-ink">{title}</h2>
          <p className="mt-1 text-small text-ink-muted">{description}</p>
          <p className="mt-2 text-small text-ink-muted">
            {rangeDescription} <span className="font-medium text-ink">{rangeText}</span>
          </p>
        </div>

        <SegmentedControl
          label={`${title} metric`}
          value={selectedMetric.key}
          options={metrics.map((metric) => ({ value: metric.key, label: metric.label }))}
          onChange={onMetricChange}
        />

        {!showData ? (
          <p className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-input px-4 text-center text-body text-ink-muted">
            {emptyLabel}
          </p>
        ) : (
          <>
            <div className="grid divide-y divide-line overflow-hidden rounded-md border border-line tablet:grid-cols-3 tablet:divide-x tablet:divide-y-0">
              <div className="min-w-0 p-4">
                <p className="text-small text-ink-muted">{totalLabel}</p>
                <p className="mt-1 font-display text-fig-m tabular-nums text-ink">{formatTotal(summary.total)}</p>
              </div>
              <div className="min-w-0 p-4">
                <p className="text-small text-ink-muted">Observed days</p>
                <p className="mt-1 font-display text-fig-m tabular-nums text-ink">{summary.observedDays.toLocaleString()}</p>
                <p className="mt-1 text-small text-ink-muted">of {summary.rangeDays.toLocaleString()} calendar days</p>
              </div>
              <div className="min-w-0 p-4">
                <p className="text-small text-ink-muted">{recordLabel}</p>
                <p className="mt-1 font-display text-fig-m tabular-nums text-ink">{summary.recordCount.toLocaleString()}</p>
                <p className="mt-1 text-small text-ink-muted">Duplicate records remain visible</p>
              </div>
            </div>

            <div className="space-y-3">
              {summary.observedDays < 3 ? (
                <div>
                  <StatusChip tone="info">
                    Early signal only: this range contains {summary.observedDays} observed day{summary.observedDays === 1 ? "" : "s"}.
                  </StatusChip>
                </div>
              ) : null}
              <p className="text-body text-ink">{patternTakeaway(summary, formatAverage, averageBasis)}</p>
            </div>

            <div className="overflow-hidden rounded-md border border-line">
              <DataTable<WeekdayPatternRow>
                caption={`${title}, by weekday`}
                columns={columns}
                rows={summary.rows}
                getKey={(row) => row.key}
                density="compact"
                phoneDetail={(row) =>
                  `Total ${money ? digits(row.total) : formatTotal(row.total)} · ${row.observedDays} observed · ${row.occurrences} ${occurrenceLabel.toLowerCase()} · ${row.recordCount} ${recordLabel.toLowerCase()} · ${formatPercent(row.share)} share`
                }
              />
            </div>

            <details className="group rounded-md border border-line p-4 text-small text-ink-muted">
              <summary className="flex min-h-11 cursor-pointer list-none items-center font-medium text-accent underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                How to read this
              </summary>
              <p className="mt-2">
                {averageBasis === "observed"
                  ? "Averages use observed selling days only; weekdays with no recorded row are excluded."
                  : "Averages use all calendar occurrences in the selected range, including weekdays with no recorded row."}{" "}
                Use observed days and records to judge data coverage.
              </p>
            </details>
          </>
        )}
      </div>
    </Card>
  );
}
