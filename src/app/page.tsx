"use client";

import { PageHeader } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listSalesEntries, listItemSales, listMonthlyAdjustments, listDailyItemLogs, listMenuItems } from "@/lib/data";
import type { SalesEntry, ItemSale, MonthlyAdjustment, DailyItemLog, MenuItem } from "@/lib/types";
import { calendarMonthTrend, distinctDaysLogged, getAttentionItems, getCanonicalItemRows, monthIsOver, monthReportedView, monthToDateComparison, monthTakeaway } from "@/lib/reporting";
import { idr, todayISO, weekKey, monthKey } from "@/lib/dates";
import { chartColors } from "@/lib/chart-colors";
import { Stat } from "@/components/state/stat";
import {
  format,
  parseISO,
  subDays,
  subWeeks,
  addDays,
  getDaysInMonth,
} from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  CalendarDays,
  UtensilsCrossed,
  ArrowRight,
  Trophy,
  Package,
} from "lucide-react";

// Payment-method categorical colors (dataviz skill: fixed hue order, never cycled)
const PAYMENT_COLORS = chartColors.payment;

// Fixed categorical order for item categories - first 4 slots, rest fold into "Other"
const CATEGORY_COLOR_SLOTS = chartColors.categorySlots;
const CATEGORY_OTHER_COLOR = chartColors.other;

export default function Dashboard() {
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [legacyItems, setLegacyItems] = useState<ItemSale[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [adjustments, setAdjustments] = useState<MonthlyAdjustment[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyItemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [reportMonth, setReportMonth] = useState(monthKey(todayISO()));
  const [showAllAttention, setShowAllAttention] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSalesEntries(), listItemSales(), listMonthlyAdjustments(), listDailyItemLogs(), listMenuItems()])
      .then(([s, i, a, logs, menu]) => {
        if (cancelled) return;
        setSales(s);
        setLegacyItems(i);
        setMenuItems(menu);
        setAdjustments(a);
        setDailyLogs(logs);
        setLoadError(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load dashboard:", err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  // Item figures come from the same source as Items performance and exports (see reporting.ts).
  const items = useMemo(() => getCanonicalItemRows(dailyLogs, legacyItems, menuItems), [dailyLogs, legacyItems, menuItems]);

  const today = todayISO();
  const yesterday = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
  const thisWeek = weekKey(today);
  const lastWeek = weekKey(format(subWeeks(parseISO(today), 1), "yyyy-MM-dd"));
  const thisMonth = reportMonth;

  const todayTotal = sales.find((s) => s.date === today)?.total ?? 0;
  const yesterdayTotal = sales.find((s) => s.date === yesterday)?.total ?? 0;

  const weekTotal = sales
    .filter((s) => weekKey(s.date) === thisWeek)
    .reduce((a, s) => a + s.total, 0);
  const lastWeekTotal = sales
    .filter((s) => weekKey(s.date) === lastWeek)
    .reduce((a, s) => a + s.total, 0);

  const monthTotal = sales
    .filter((s) => monthKey(s.date) === thisMonth)
    .reduce((a, s) => a + s.total, 0);

  // Days, not entries: two entries on one day count once.
  const monthDaysLogged = distinctDaysLogged(sales, thisMonth);
  const avgPerDay = monthDaysLogged > 0 ? monthTotal / monthDaysLogged : 0;

  const allTimeTotal = sales.reduce((a, s) => a + s.total, 0);

  // Bank-reconciliation selisih is a whole-month figure, so it counts only once its month is over.
  // Until then the month shows recorded sales, and the selisih is pending. It never reaches the
  // averages, trend or payment mix.
  const monthOver = monthIsOver(thisMonth, today);
  const monthAdjustment = adjustments.find((a) => a.month === thisMonth)?.amount ?? 0;
  const monthView = monthReportedView({ recorded: monthTotal, adjustment: monthAdjustment, monthOver });
  const allAdjustments = adjustments
    .filter((a) => monthIsOver(a.month, today))
    .reduce((a, x) => a + x.amount, 0);
  const monthTotalWithAdjustment = monthView.reported;
  const allTimeTotalWithAdjustment = allTimeTotal + allAdjustments;
  const weekRangeLabel = formatWeekLabel(thisWeek);

  const trend = useMemo(
    () => calendarMonthTrend(sales, reportMonth).map((day) => ({ date: formatDayLabel(day.date), total: day.total })),
    [sales, reportMonth]
  );

  const paymentMix = useMemo(() => {
    const monthSales = sales.filter((s) => monthKey(s.date) === thisMonth);
    const totals = monthSales.reduce(
      (acc, s) => {
        acc.BCA += s.bca;
        acc.Cash += s.cash;
        acc.Soundbox += s.soundbox;
        acc.Other += s.other;
        return acc;
      },
      { BCA: 0, Cash: 0, Soundbox: 0, Other: 0 }
    );
    const sum = totals.BCA + totals.Cash + totals.Soundbox + totals.Other;
    return (Object.keys(totals) as (keyof typeof totals)[])
      .map((k) => ({ label: k, value: totals[k], pct: sum > 0 ? totals[k] / sum : 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [sales, thisMonth]);

  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items.filter((i) => monthKey(i.date) === thisMonth)) {
      map.set(i.itemName, (map.get(i.itemName) ?? 0) + i.qty);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = sorted[0]?.[1] ?? 0;
    return sorted.map(([name, qty]) => ({ name, qty, pct: max > 0 ? qty / max : 0 }));
  }, [items, thisMonth]);

  const monthQty = items
    .filter((i) => monthKey(i.date) === thisMonth)
    .reduce((a, i) => a + i.qty, 0);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items.filter((i) => monthKey(i.date) === thisMonth)) {
      map.set(i.category || "Uncategorized", (map.get(i.category || "Uncategorized") ?? 0) + i.qty);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((a, [, qty]) => a + qty, 0);
    const rows = top.map(([label, qty], idx) => ({
      label,
      qty,
      color: CATEGORY_COLOR_SLOTS[idx],
    }));
    if (rest > 0) rows.push({ label: "Other", qty: rest, color: CATEGORY_OTHER_COLOR });
    const sum = rows.reduce((a, r) => a + r.qty, 0);
    return rows.map((r) => ({ ...r, pct: sum > 0 ? r.qty / sum : 0 }));
  }, [items, thisMonth]);

  const bestDay = useMemo(() => {
    const monthSales = sales.filter((s) => monthKey(s.date) === thisMonth);
    if (monthSales.length === 0) return null;
    return monthSales.reduce((best, s) => (s.total > best.total ? s : best), monthSales[0]);
  }, [sales, thisMonth]);

  const daysElapsed = thisMonth === monthKey(today) ? Number(today.slice(-2)) : getDaysInMonth(parseISO(`${thisMonth}-01`));
  // Average per Main portion, the figure the owner compares across months.
  const monthMainQty = items
    .filter((i) => monthKey(i.date) === thisMonth && i.category === "Main")
    .reduce((a, i) => a + i.qty, 0);
  const avgOrderValue = monthMainQty > 0 ? monthTotal / monthMainQty : 0;
  // Same days of the previous month, so a mid-month figure is not compared with a whole month.
  const monthComparison = monthToDateComparison(sales, thisMonth, daysElapsed);

  const reportMonths = [...new Set([
    monthKey(today),
    ...sales.map((sale) => monthKey(sale.date)),
    ...adjustments.map((adjustment) => adjustment.month),
  ])].sort().reverse();

  // The attention list is computed from the same loaded data as the rest of the dashboard.
  const attentionItems = getAttentionItems({ today, dailyLogs, salesEntries: sales });
  const trendTakeaway = monthTakeaway({
    averagePerDay: avgPerDay,
    deltaPct: monthComparison.deltaPct,
    comparedLabel: monthComparison.label,
    formatMoney: idr,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description="What needs closing today, and what has been recorded." />

      {loadError && (
        <Card className="border-danger/20 bg-danger/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-foreground">Dashboard data could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">Your existing view is preserved. Try again when the connection is available.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoadError(false);
                setLoading(true);
                setRetryKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-warning/20 bg-warning/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">Needs attention <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{attentionItems.length}</span></CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">A quick close-status check before reviewing performance.</p>
          </div>
          <Button asChild variant="outline" className="border-warning/20 bg-surface text-foreground hover:bg-surface-elevated">
            <Link href="/items">Open Daily close <ArrowRight className="size-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {attentionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention. Today and recent days agree.</p>
          ) : (
            <ul className="space-y-2">
              {(showAllAttention ? attentionItems : attentionItems.slice(0, 6)).map((item) => (
                <li key={`${item.kind}-${item.date ?? item.label}`}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-warning/15 bg-surface/70 px-3 py-2 text-sm hover:bg-surface-elevated">
                    <span className="min-w-0 text-foreground">{item.label}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
              {attentionItems.length > 6 && (
                <li>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAllAttention((current) => !current)}>
                    {showAllAttention ? "Show fewer" : `Show all ${attentionItems.length}`}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-warm-accent/35">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Trophy className="size-4" />
            {formatMonthLabel(thisMonth)} at a glance
          </CardTitle>
          <label className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="sr-only">Reporting month</span>
            <select
              aria-label="Reporting month"
              value={thisMonth}
              onChange={(event) => setReportMonth(event.target.value)}
              className="h-10 rounded-lg border border-primary/15 bg-surface px-3 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
            >
              {reportMonths.map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
          </label>
        </CardHeader>
        <CardContent>
          {loading ? (
              <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
              <Stat variant="plain" tone="primary" label="All-time reported total" value={idr(allTimeTotalWithAdjustment)} sub="Includes selisih" />
              <Stat variant="plain" tone="primary" label="Reported month total" value={idr(monthTotalWithAdjustment)} sub={monthOver ? "Recorded sales + selisih" : "Selisih added at month end"} />
              <Stat variant="plain" tone="primary" label="Portions sold" value={monthQty.toLocaleString("id-ID")} />
              <Stat variant="plain" tone="primary" label="Avg revenue per Main portion" value={idr(avgOrderValue)} />
              <Stat
                variant="plain"
                tone="primary"
                label="Best day"
                value={bestDay ? idr(bestDay.total) : "—"}
                sub={bestDay ? formatDayLabel(bestDay.date) : undefined}
              />
              <Stat
                variant="plain"
                tone="primary"
                label="Best seller"
                value={topItems[0]?.name ?? "—"}
                sub={topItems[0] ? `${topItems[0].qty} sold` : undefined}
              />
              <Stat variant="plain" tone="primary" label="Days logged" value={`${monthDaysLogged} / ${daysElapsed}`} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-surface">
        <CardHeader>
          <CardTitle className="text-lg">Revenue composition · {formatMonthLabel(thisMonth)}</CardTitle>
          <p className="text-sm text-muted-foreground">{monthOver ? "Reported total is recorded sales plus the monthly reconciliation adjustment." : "This month is still open. Its selisih is added when the month ends."}</p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Stat label="Recorded sales" value={idr(monthTotal)} />
          <Stat label="Reconciliation adjustment" value={monthView.selisih === null ? "Pending" : idr(monthView.selisih)} sub={monthOver ? "Selisih" : "Added at month end"} />
          <Stat label="Reported total" value={idr(monthTotalWithAdjustment)} emphasized />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          variant="card"
          icon={<Wallet className="size-4" />}
          iconClassName="bg-primary"
          label="Today"
          value={idr(todayTotal)}
          delta={pctDelta(todayTotal, yesterdayTotal)}
          deltaLabel="vs yesterday"
        />
        <Stat
          variant="card"
          icon={<TrendingUp className="size-4" />}
          iconClassName="bg-primary-hover"
          label="This week"
          range={weekRangeLabel}
          value={idr(weekTotal)}
          delta={pctDelta(weekTotal, lastWeekTotal)}
          deltaLabel="vs last week"
        />
        <Stat
          variant="card"
          icon={<TrendingUp className="size-4" />}
          iconClassName="bg-warning"
          label="Reported month total"
          range={formatMonthLabel(thisMonth)}
          value={idr(monthTotalWithAdjustment)}
          delta={monthComparison.deltaPct}
          deltaLabel={`vs ${monthComparison.label}`}
        />
        <Stat
          variant="card"
          icon={<CalendarDays className="size-4" />}
          iconClassName="bg-info"
          label="Avg / day selected month"
          value={idr(avgPerDay)}
        />
        <Stat
          variant="card"
          icon={<Package className="size-4" />}
          iconClassName="bg-primary"
          label="Portions selected month"
          value={monthQty.toLocaleString("id-ID")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sales trend · {formatMonthLabel(thisMonth)}</CardTitle>
            <Link
              href="/reports?tab=revenue"
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View recap <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : trend.length === 0 ? (
              <EmptyChart label="No sales entries yet" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.primary} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    stroke={chartColors.other}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    stroke={chartColors.other}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    width={40}
                  />
                  <Tooltip formatter={(v) => idr(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={chartColors.primary}
                    strokeWidth={2.5}
                    fill="url(#salesFill)"
                    dot={{ r: 3, fill: chartColors.primary }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {!loading && <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Takeaway:</span> {trendTakeaway}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment mix this month</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentMix.length === 0 ? (
              <EmptyChart label="No sales logged yet" />
            ) : (
              <div className="space-y-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {paymentMix.map((d) => (
                    <div
                      key={d.label}
                      style={{
                        width: `${d.pct * 100}%`,
                        backgroundColor: PAYMENT_COLORS[d.label],
                      }}
                      className="h-full first:ml-0 [&:not(:first-child)]:ml-[2px]"
                    />
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {paymentMix.map((d) => (
                    <li key={d.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: PAYMENT_COLORS[d.label] }}
                        />
                        <span className="text-foreground">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{idr(d.value)}</span>
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {Math.round(d.pct * 100)}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="size-4 text-primary" />
              Top items this month ({monthQty} sold)
            </CardTitle>
            <Link
              href="/items"
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View recap <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <EmptyChart label="No item sales logged yet" />
            ) : (
              <ul className="space-y-3">
                {topItems.map((item, idx) => (
                  <li key={item.name} className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-warm-accent text-xs font-semibold text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground">{item.qty} sold</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(item.pct * 100, 4)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category mix this month</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <EmptyChart label="No item sales logged yet" />
            ) : (
              <div className="space-y-4">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {categoryBreakdown.map((d) => (
                    <div
                      key={d.label}
                      style={{ width: `${d.pct * 100}%`, backgroundColor: d.color }}
                      className="h-full first:ml-0 [&:not(:first-child)]:ml-[2px]"
                    />
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {categoryBreakdown.map((d) => (
                    <li key={d.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-foreground">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{d.qty} sold</span>
                        <span className="w-10 text-right text-xs text-muted-foreground">
                          {Math.round(d.pct * 100)}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatMonthLabel(monthISO: string): string {
  return format(parseISO(`${monthISO}-01`), "MMMM yyyy");
}

function formatDayLabel(dateISO: string): string {
  return format(parseISO(dateISO), "EEEE, d MMM");
}

function formatWeekLabel(dateISO: string): string {
  return `${formatDayLabel(dateISO)} – ${format(addDays(parseISO(dateISO), 6), "EEEE, d MMM")}`;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
