"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listSalesEntries, listItemSales, listMonthlyAdjustments, listDailyItemLogs } from "@/lib/data";
import type { SalesEntry, ItemSale, MonthlyAdjustment, DailyItemLog } from "@/lib/types";
import { idr, todayISO, weekKey, monthKey } from "@/lib/dates";
import {
  format,
  parseISO,
  subDays,
  subWeeks,
  subMonths,
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
  ArrowUp,
  ArrowDown,
  Trophy,
  Package,
} from "lucide-react";

// Payment-method categorical colors (dataviz skill: fixed hue order, never cycled)
const PAYMENT_COLORS: Record<string, string> = {
  BCA: "#2a78d6", // slot 1 blue
  Cash: "#eb6834", // slot 2 orange
  Soundbox: "#1baf7a", // slot 3 aqua
  Other: "#eda100", // slot 4 yellow
};

// Fixed categorical order for item categories - first 4 slots, rest fold into "Other"
const CATEGORY_COLOR_SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const CATEGORY_OTHER_COLOR = "#898781";

export default function Dashboard() {
  const [sales, setSales] = useState<SalesEntry[]>([]);
  const [items, setItems] = useState<ItemSale[]>([]);
  const [adjustments, setAdjustments] = useState<MonthlyAdjustment[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyItemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [reportMonth, setReportMonth] = useState(monthKey(todayISO()));

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSalesEntries(), listItemSales(), listMonthlyAdjustments(), listDailyItemLogs()])
      .then(([s, i, a, logs]) => {
        if (cancelled) return;
        setSales(s);
        setItems(i);
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

  const today = todayISO();
  const yesterday = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
  const thisWeek = weekKey(today);
  const lastWeek = weekKey(format(subWeeks(parseISO(today), 1), "yyyy-MM-dd"));
  const thisMonth = reportMonth;
  const lastMonth = monthKey(format(subMonths(parseISO(`${thisMonth}-01`), 1), "yyyy-MM-dd"));

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
  const lastMonthTotal = sales
    .filter((s) => monthKey(s.date) === lastMonth)
    .reduce((a, s) => a + s.total, 0);

  const monthDaysLogged = sales.filter((s) => monthKey(s.date) === thisMonth).length;
  const avgPerDay = monthDaysLogged > 0 ? monthTotal / monthDaysLogged : 0;

  const allTimeTotal = sales.reduce((a, s) => a + s.total, 0);

  // Bank-reconciliation selisih: folded only into this month's and the
  // all-time total, never into avgPerDay/delta/trend/paymentMix/bestDay.
  const monthAdjustment = adjustments.find((a) => a.month === thisMonth)?.amount ?? 0;
  const allAdjustments = adjustments.reduce((a, x) => a + x.amount, 0);
  const monthTotalWithAdjustment = monthTotal + monthAdjustment;
  const allTimeTotalWithAdjustment = allTimeTotal + allAdjustments;
  const weekRangeLabel = formatWeekLabel(thisWeek);

  const trend = useMemo(() => {
    const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-30).map((s) => ({ date: formatDayLabel(s.date), total: s.total }));
  }, [sales]);

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
  const avgOrderValue = monthQty > 0 ? monthTotal / monthQty : 0;

  const reportMonths = [...new Set([
    monthKey(today),
    ...sales.map((sale) => monthKey(sale.date)),
    ...adjustments.map((adjustment) => adjustment.month),
  ])].sort().reverse();

  const dailyLogsByDate = new Map(dailyLogs.map((log) => [log.date, log]));
  const todayLog = dailyLogsByDate.get(today);
  const draftDays = dailyLogs.filter((log) => monthKey(log.date) === thisMonth && log.status === "draft").length;
  const revenueDates = new Set(sales.filter((sale) => monthKey(sale.date) === thisMonth).map((sale) => sale.date));
  const itemCloseDates = new Set(dailyLogs.filter((log) => monthKey(log.date) === thisMonth).map((log) => log.date));
  const revenueWithoutItemClose = [...revenueDates].filter((date) => !itemCloseDates.has(date)).length;
  const todayNeedsAttention = !todayLog || todayLog.status === "draft";
  const todayDraftCount = todayLog?.status === "draft" && monthKey(today) === thisMonth ? 1 : 0;
  const attentionCount = (todayNeedsAttention ? 1 : 0) + Math.max(0, draftDays - todayDraftCount) + revenueWithoutItemClose;
  const todayCloseLabel = todayLog?.status === "complete"
    ? "Complete"
    : todayLog?.status === "no_sales"
      ? "No sales"
      : todayLog
        ? "Draft"
        : "Not started";
  const trendTakeaway = trend.length < 2
    ? "Add another day to see a trend comparison."
    : trend[trend.length - 1].total >= trend[trend.length - 2].total
      ? "The latest recorded day is at or above the previous entry."
      : "The latest recorded day is below the previous entry.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">What needs closing today, and what has been recorded.</p>
      </div>

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
            <CardTitle className="flex items-center gap-2 text-lg">Needs attention <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{attentionCount}</span></CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">A quick close-status check before reviewing performance.</p>
          </div>
          <Button asChild variant="outline" className="border-warning/20 bg-surface text-foreground hover:bg-surface-elevated">
            <Link href="/items">Open Daily close <ArrowRight className="size-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <AttentionItem label="Today" value={todayCloseLabel} detail={todayTotal > 0 ? `${idr(todayTotal)} revenue logged` : "No revenue logged yet"} />
          <AttentionItem label={`${formatMonthLabel(thisMonth)} drafts`} value={String(draftDays)} detail={draftDays === 1 ? "Day needs completion" : "Days need completion"} />
          <AttentionItem label="Revenue without item close" value={String(Math.max(0, revenueWithoutItemClose))} detail="Recorded days without a daily log" />
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
              <RecapStat label="All-time reported total" value={idr(allTimeTotalWithAdjustment)} sub="Includes selisih" />
              <RecapStat label="Reported month total" value={idr(monthTotalWithAdjustment)} sub="Recorded sales + selisih" />
              <RecapStat label="Portions sold" value={monthQty.toLocaleString("id-ID")} />
              <RecapStat label="Avg per portion" value={idr(avgOrderValue)} />
              <RecapStat
                label="Best day"
                value={bestDay ? idr(bestDay.total) : "—"}
                sub={bestDay ? formatDayLabel(bestDay.date) : undefined}
              />
              <RecapStat
                label="Best seller"
                value={topItems[0]?.name ?? "—"}
                sub={topItems[0] ? `${topItems[0].qty} sold` : undefined}
              />
              <RecapStat label="Days logged" value={`${monthDaysLogged} / ${daysElapsed}`} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-surface">
        <CardHeader>
          <CardTitle className="text-lg">Revenue composition · {formatMonthLabel(thisMonth)}</CardTitle>
          <p className="text-sm text-muted-foreground">Reported total is recorded sales plus the monthly reconciliation adjustment.</p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <RevenueBreakdownStat label="Recorded sales" value={idr(monthTotal)} />
          <RevenueBreakdownStat label="Reconciliation adjustment" value={idr(monthAdjustment)} detail="Selisih" />
          <RevenueBreakdownStat label="Reported total" value={idr(monthTotalWithAdjustment)} emphasized />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Today"
          value={idr(todayTotal)}
          color="bg-primary"
          delta={pctDelta(todayTotal, yesterdayTotal)}
          deltaLabel="vs yesterday"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="This week"
          range={weekRangeLabel}
          value={idr(weekTotal)}
          color="bg-primary-hover"
          delta={pctDelta(weekTotal, lastWeekTotal)}
          deltaLabel="vs last week"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="Reported month total"
          range={formatMonthLabel(thisMonth)}
          value={idr(monthTotalWithAdjustment)}
          color="bg-warning"
          delta={pctDelta(monthTotal, lastMonthTotal)}
          deltaLabel="vs last month"
        />
        <StatCard
          icon={<CalendarDays className="size-4" />}
          label="Avg / day selected month"
          value={idr(avgPerDay)}
          color="bg-info"
        />
        <StatCard
          icon={<Package className="size-4" />}
          label="Portions selected month"
          value={monthQty.toLocaleString("id-ID")}
          color="bg-primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sales trend (last 30 entries)</CardTitle>
            <Link
              href="/sales"
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
                      <stop offset="0%" stopColor="#1f3a2f" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#1f3a2f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    stroke="#898781"
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    stroke="#898781"
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    width={40}
                  />
                  <Tooltip formatter={(v) => idr(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#1f3a2f"
                    strokeWidth={2.5}
                    fill="url(#salesFill)"
                    dot={{ r: 3, fill: "#1f3a2f" }}
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

function AttentionItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-warning/15 bg-surface/70 px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function RevenueBreakdownStat({
  label,
  value,
  detail,
  emphasized = false,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasized?: boolean;
}) {
  return (
    <div className={emphasized ? "rounded-lg bg-accent px-3 py-3" : "rounded-lg border border-border px-3 py-3"}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg tabular-nums ${emphasized ? "font-bold text-primary" : "font-semibold text-foreground"}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function formatDayLabel(dateISO: string): string {
  return format(parseISO(dateISO), "EEEE, d MMM");
}

function formatWeekLabel(dateISO: string): string {
  return `${formatDayLabel(dateISO)} – ${format(addDays(parseISO(dateISO), 6), "EEEE, d MMM")}`;
}

function RecapStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-primary/60">{label}</p>
      <p className="truncate text-base font-semibold text-primary">{value}</p>
      {sub && <p className="text-xs text-primary/50">{sub}</p>}
    </div>
  );
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

function StatCard({
  icon,
  label,
  range,
  value,
  color,
  delta,
  deltaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  range?: string;
  value: string;
  color: string;
  delta?: number | null;
  deltaLabel?: string;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className={`mb-2 flex size-7 items-center justify-center rounded-full ${color} text-white`}>
          {icon}
        </div>
        <p className="text-xs text-muted-foreground">
          {label}
          {range && <span className="text-muted-foreground"> · {range}</span>}
        </p>
        <p className="text-lg font-semibold text-foreground sm:text-xl">{value}</p>
        {delta !== undefined && delta !== null && (
          <div
            className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${
              delta >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            <span>{Math.abs(Math.round(delta * 100))}%</span>
            {deltaLabel && <span className="font-normal text-muted-foreground">{deltaLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
