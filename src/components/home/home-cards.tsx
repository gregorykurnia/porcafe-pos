"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { ChartFrame, type LegendItem } from "@/components/patterns/chart-frame";
import { LoadingSkeleton } from "@/components/patterns/states";
import { chartColors } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { idr as formatRp } from "@/lib/dates";
import type { AttentionItem } from "@/lib/reporting";

/** Rupiah in chart labels only (DESIGN_SYSTEM §7): 5,48 jt. */
export function shortRupiah(value: number): string {
  if (value === 0) return "0";
  return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`;
}

function formatPercent(value: number): string {
  return `${(Math.abs(value) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

/**
 * A change against an earlier period: arrow and figure in tone, the comparison in words (DESIGN_SYSTEM §6).
 * Renders nothing when there is nothing to compare with.
 */
export function Delta({ value, comparedTo, onBrand = false }: { value: number | null; comparedTo: string; onBrand?: boolean }) {
  if (value === null) return null;
  const flat = value === 0;
  const up = value > 0;
  const figureTone = onBrand ? "text-brand-on" : flat ? "text-ink-muted" : up ? "text-ok" : "text-danger";
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-small">
      <span className={cn("font-semibold", figureTone)}>
        <span className="sr-only">{flat ? "No change, " : up ? "Up " : "Down "}</span>
        {flat ? "0%" : `${up ? "↑" : "↓"} ${formatPercent(value)}`}
      </span>
      <span className={onBrand ? "text-brand-on/80" : "text-ink-muted"}>{comparedTo}</span>
    </span>
  );
}

/** The one solid element on the page. The close is one tap away, and its action is the only primary button. */
export function TodayCard({
  dateLabel,
  loading,
  close,
  total,
  delta,
  portions,
  actionLabel,
}: {
  dateLabel: string;
  loading: boolean;
  close: { tone: StatusTone; label: string } | null;
  total: number;
  delta: number | null;
  portions: number | null;
  actionLabel: string;
}) {
  return (
    <section aria-labelledby="home-today-heading" className="flex flex-col gap-5 rounded-xl bg-brand p-5 text-brand-on tablet:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-today-heading" className="text-small text-brand-on/80">
          Today{dateLabel ? ` · ${dateLabel}` : ""}
        </h2>
        {close && !loading ? <StatusChip tone={close.tone}>{close.label}</StatusChip> : null}
      </div>
      <div>
        <p className="font-display text-fig-xl tabular-nums" aria-live="polite">
          {loading ? "Loading…" : formatRp(total)}
        </p>
        {!loading ? (
          <div className="mt-2 flex flex-col gap-0.5">
            <Delta value={delta} comparedTo="vs yesterday" onBrand />
            {portions !== null ? <p className="text-small text-brand-on/80">{portions.toLocaleString("id-ID")} portions</p> : null}
          </div>
        ) : null}
      </div>
      <Button asChild variant="inverse" size="lg" className="mt-auto w-full">
        <Link href="/items">
          {actionLabel}
          <ArrowRight aria-hidden="true" strokeWidth={1.5} />
        </Link>
      </Button>
    </section>
  );
}

const ATTENTION_LIMIT = 6;

const SEVERITY_TONE: Record<AttentionItem["severity"], StatusTone> = {
  info: "info",
  warning: "warn",
  danger: "danger",
};

/** Needs attention comes first. Each row opens the place to fix it. Shows six, with Show all. */
export function AttentionCard({
  loading,
  items,
  showAll,
  onToggle,
}: {
  loading: boolean;
  items: AttentionItem[];
  showAll: boolean;
  onToggle: () => void;
}) {
  const visible = showAll ? items : items.slice(0, ATTENTION_LIMIT);
  return (
    <Card className="gap-0 p-0" aria-labelledby="home-attention-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 tablet:p-6">
        <div className="min-w-0">
          <h2 id="home-attention-heading" className="flex flex-wrap items-center gap-2 font-display text-title-2 text-ink">
            Needs attention
            {!loading && items.length > 0 ? <StatusChip tone="warn" header>{items.length}</StatusChip> : null}
          </h2>
          <p className="mt-1 text-small text-ink-muted">Each one opens the place to fix it.</p>
        </div>
      </div>
      {loading ? (
        <LoadingSkeleton rows={3} label="Loading attention items" />
      ) : items.length === 0 ? (
        <p className="flex items-center gap-3 border-t border-line px-5 py-4 text-body text-ink tablet:px-6">
          <ToneShape tone="ok" className="text-ok" />
          Nothing needs attention. Today and recent days agree.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {visible.map((item) => {
              const tone = SEVERITY_TONE[item.severity];
              return (
                <li key={`${item.kind}-${item.date ?? item.label}`}>
                  <Link
                    href={item.href}
                    className="flex min-h-14 items-center gap-3 px-5 py-3 text-body font-medium text-ink transition-colors duration-fast hover:bg-canvas tablet:px-6"
                  >
                    <ToneShape tone={tone} className={cn("mt-px", tone === "info" ? "text-info" : tone === "warn" ? "text-warn-mark" : "text-danger")} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <ChevronRight className="size-5 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > ATTENTION_LIMIT ? (
            <div className="border-t border-line px-3 py-1 tablet:px-4">
              <Button type="button" variant="ghost" size="sm" onClick={onToggle} aria-expanded={showAll}>
                {showAll ? "Show fewer" : `Show all ${items.length}`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export type GlanceCell = { label: string; value: ReactNode; note?: ReactNode };

/**
 * The month in one card with hairline cell dividers. A list on phone, two columns on tablet, four on desk. Not the
 * R2 StatStrip, which cannot hold "Rp 612.840.000" in a half-width tablet cell.
 */
export function GlanceCard({ title, range, loading, cells }: { title: string; range: string; loading: boolean; cells: GlanceCell[] }) {
  return (
    <Card className="gap-0 p-0" aria-labelledby="home-glance-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-5 pb-4 tablet:p-6 tablet:pb-5">
        <h2 id="home-glance-heading" className="font-display text-title-2 text-ink">
          {title}
        </h2>
        <p className="text-small text-ink-muted">{range}</p>
      </div>
      <dl className="grid gap-px border-t border-line bg-line tablet:grid-cols-2 desk:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="flex items-start justify-between gap-3 bg-surface px-4 py-3 tablet:block tablet:px-5 tablet:py-4">
            <dt className="min-w-0 text-small text-ink-muted">{cell.label}</dt>
            <dd className="min-w-0 text-right tablet:mt-1 tablet:text-left">
              <span className={cn("block font-display text-fig-m tabular-nums text-ink tablet:text-fig-l", loading && "text-body font-normal text-ink-muted")}>
                {loading ? "Loading…" : cell.value}
              </span>
              {!loading && cell.note ? <span className="mt-0.5 block text-small text-ink-muted">{cell.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export type TrendPoint = {
  date: string;
  day: string;
  total: number;
  kind: "sales" | "missing" | "future";
  isToday: boolean;
  isBest: boolean;
};

/** Bars per day: sales in chart-1 at 78%, the best day in brand, today as a dashed outline, missing days as a dotted line. */
function DaySlot(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    payload?: TrendPoint;
  };
  const baseline = y + height;
  if (!payload || payload.kind === "future") return <g />;
  if (payload.isToday) {
    const outlineHeight = Math.max(height, 28);
    return (
      <rect
        x={x + 1}
        y={baseline - outlineHeight}
        width={Math.max(width - 2, 1)}
        height={outlineHeight}
        rx={6}
        fill="none"
        stroke={chartColors.today}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    );
  }
  if (payload.kind === "missing") {
    return <line x1={x} x2={x + width} y1={baseline - 1} y2={baseline - 1} stroke={chartColors.today} strokeWidth={2} strokeDasharray="2 3" />;
  }
  if (payload.isBest) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={6} fill={chartColors.highlight} />
        <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={chartColors.highlight}>
          {shortRupiah(payload.total)}
        </text>
      </g>
    );
  }
  return <rect x={x} y={y} width={width} height={height} rx={6} fill={chartColors.series} fillOpacity={chartColors.seriesOpacity} />;
}

export function TrendCard({
  loading,
  points,
  average,
  takeaway,
  monthLabel,
  hasSales,
  recapHref,
  bestDayLabel,
  bestTotal,
}: {
  loading: boolean;
  points: TrendPoint[];
  average: number;
  takeaway: string;
  monthLabel: string;
  hasSales: boolean;
  recapHref: string;
  bestDayLabel: string | null;
  bestTotal: number;
}) {
  const legend: LegendItem[] = [
    { label: "Sales per day", swatch: chartColors.series },
    { label: "Best day", swatch: chartColors.highlight },
    { label: "Average per day", swatch: chartColors.average, dashed: true },
    { label: "Today, not closed", swatch: chartColors.today, dashed: true },
  ];
  const label = hasSales
    ? `Sales per day for ${monthLabel}. ${bestDayLabel ? `Best day ${bestDayLabel}, ${formatRp(bestTotal)}.` : ""} Average ${formatRp(average)} a day.`
    : `No sales entries yet for ${monthLabel}.`;
  return (
    <Card className="gap-0 p-0" aria-labelledby="home-trend-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3 tablet:p-6 tablet:pb-4">
        <h2 id="home-trend-heading" className="font-display text-title-2 text-ink">
          Sales trend · {monthLabel}
        </h2>
        <Button asChild variant="ghost" size="sm" className="h-11 desk:h-9">
          <Link href={recapHref}>
            View recap <ArrowRight aria-hidden="true" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
      <div className="px-3 pb-5 tablet:px-6 tablet:pb-6">
        {loading ? (
          <div className="flex h-56 items-center justify-center text-body text-ink-muted">Loading…</div>
        ) : !hasSales ? (
          <p className="flex h-40 items-center justify-center text-body text-ink-muted">No sales entries yet</p>
        ) : (
          <ChartFrame label={label} legend={legend} takeaway={takeaway}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={points} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" fontSize={12} stroke={chartColors.other} tick={{ fill: "var(--color-ink-muted)" }} />
                <YAxis tickLine={false} axisLine={false} width={52} fontSize={12} stroke={chartColors.other} tickFormatter={(v: number) => shortRupiah(v)} tick={{ fill: "var(--color-ink-muted)" }} />
                <Tooltip formatter={(value) => formatRp(Number(value))} labelFormatter={(day) => `Day ${day}`} />
                {average > 0 ? <ReferenceLine y={average} stroke={chartColors.average} strokeDasharray="4 3" strokeWidth={1.5} /> : null}
                <Bar dataKey="total" shape={DaySlot} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
        {!loading && !hasSales ? <p className="mt-4 text-small text-ink-muted">{takeaway}</p> : null}
      </div>
    </Card>
  );
}

/** A list of shares with a bar under each row. Largest first, zero rows already left out by the caller. */
export function ShareList({
  headingId,
  title,
  rows,
  emptyLabel,
  loading,
  totalLabel,
  totalValue,
  subtitle,
}: {
  headingId: string;
  title: string;
  rows: { label: string; color: string; amount: string; share: string; width: number }[];
  emptyLabel: string;
  loading: boolean;
  totalLabel?: string;
  totalValue?: string;
  subtitle?: string;
}) {
  return (
    <Card className="gap-0 p-0" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3 tablet:p-6 tablet:pb-4">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-title-2 text-ink">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-small text-ink-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="px-5 pb-5 tablet:px-6 tablet:pb-6">
        {loading ? (
          <p className="py-6 text-body text-ink-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-body text-ink-muted">{emptyLabel}</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={row.label} className="py-3">
                  <div className="flex items-baseline justify-between gap-3 text-table">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate text-body text-ink">{row.label}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="text-ink-muted">{row.amount}</span>
                      <span className="ml-3 inline-block w-11 font-semibold text-ink">{row.share}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(row.width, 2)}%`, background: row.color }} />
                  </div>
                </li>
              ))}
            </ul>
            {totalLabel && totalValue ? (
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-table font-semibold text-ink">
                <span>{totalLabel}</span>
                <span className="tabular-nums">{totalValue}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

/** Top five items: rank, name, sold, and a bar relative to the leader. The leader is brand, the rest chart-2. */
export function TopItemsCard({
  loading,
  rows,
  monthLabel,
  soldLabel,
  recapHref,
}: {
  loading: boolean;
  rows: { name: string; qty: number; width: number }[];
  monthLabel: string;
  soldLabel: string;
  recapHref: string;
}) {
  return (
    <Card className="gap-0 p-0" aria-labelledby="home-top-items-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3 tablet:p-6 tablet:pb-4">
        <div className="min-w-0">
          <h2 id="home-top-items-heading" className="font-display text-title-2 text-ink">
            Top items this month
          </h2>
          <p className="mt-1 text-small text-ink-muted">{soldLabel} · {monthLabel}</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-11 desk:h-9">
          <Link href={recapHref}>
            View recap <ArrowRight aria-hidden="true" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
      <div className="px-5 pb-5 tablet:px-6 tablet:pb-6">
        {loading ? (
          <p className="py-6 text-body text-ink-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-body text-ink-muted">No item sales logged yet</p>
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((row, index) => (
              <li
                key={row.name}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 tablet:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,9rem)_auto] tablet:gap-x-4 tablet:py-2.5"
              >
                <span className="font-display text-title-3 text-ink-muted tabular-nums" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate text-body font-medium text-ink">
                  <span className="sr-only">Rank {index + 1}: </span>
                  {row.name}
                </span>
                <span className="text-right text-table tabular-nums">
                  <span className="font-semibold text-ink">{row.qty.toLocaleString("id-ID")}</span>{" "}
                  <span className="text-ink-muted">sold</span>
                </span>
                <span className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-sunken tablet:col-span-1 tablet:col-start-3 tablet:row-start-1" aria-hidden="true">
                  <span className={cn("block h-full rounded-full", index === 0 ? "bg-brand" : "bg-chart-2")} style={{ width: `${Math.max(row.width, 4)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** Revenue composition: recorded sales, the reconciliation adjustment, and the reported total. */
export function CompositionCard({
  monthLabel,
  monthOver,
  recorded,
  adjustment,
  reported,
}: {
  monthLabel: string;
  monthOver: boolean;
  recorded: string;
  adjustment: ReactNode;
  reported: string;
}) {
  return (
    <Card className="gap-0 p-0" aria-labelledby="home-composition-heading">
      <div className="p-5 pb-3 tablet:p-6 tablet:pb-4">
        <h2 id="home-composition-heading" className="font-display text-title-2 text-ink">
          Revenue composition · {monthLabel}
        </h2>
      </div>
      <dl className="space-y-2.5 px-5 pb-5 text-table tablet:px-6 tablet:pb-6">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-muted">Recorded sales</dt>
          <dd className="tabular-nums text-ink">{recorded}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-muted">Reconciliation adjustment</dt>
          <dd className="tabular-nums text-ink">{adjustment}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3 font-semibold text-ink">
          <dt>Reported total</dt>
          <dd className="font-display text-fig-m tabular-nums">{reported}</dd>
        </div>
        <p className="pt-1 text-small text-ink-muted">
          {monthOver ? "Reported total is recorded sales plus the monthly reconciliation adjustment." : "This month is still open. Its selisih is added when the month ends."}
        </p>
      </dl>
    </Card>
  );
}
