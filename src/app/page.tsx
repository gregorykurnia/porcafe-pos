"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";
import { listSalesEntries, listItemSales, listMonthlyAdjustments, listDailyItemLogs, listMenuItems } from "@/lib/data";
import type { SalesEntry, ItemSale, MonthlyAdjustment, DailyItemLog, MenuItem } from "@/lib/types";
import { calendarMonthTrend, distinctDaysLogged, getAttentionItems, getCanonicalItemRows, monthIsOver, monthReportedView, monthToDateComparison, monthTakeaway } from "@/lib/reporting";
import { formatDisplay, idr, todayISO, weekKey, monthKey } from "@/lib/dates";
import { chartColors } from "@/lib/chart-colors";
import { format, parseISO, subDays, subWeeks, addDays, getDaysInMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBanner } from "@/components/patterns/states";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import {
  AttentionCard,
  CompositionCard,
  Delta,
  GlanceCard,
  ShareList,
  TodayCard,
  TopItemsCard,
  TrendCard,
  type GlanceCell,
  type TrendPoint,
} from "@/components/home/home-cards";

// Payment-method categorical colors (dataviz skill: fixed hue order, never cycled)
const PAYMENT_COLORS = chartColors.payment;

// Fixed categorical order for item categories - first 4 slots, rest fold into "Other"
const CATEGORY_COLOR_SLOTS = chartColors.categorySlots;
const CATEGORY_OTHER_COLOR = chartColors.other;

// The clock is read after mount only, so the server render and the first client render agree.
const subscribeNever = () => () => {};
const readClock = () => `${todayISO()}|${new Date().getHours()}`;
const noClock = () => "";

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
  const clock = useSyncExternalStore(subscribeNever, readClock, noClock);

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
  const todayLog = dailyLogs.find((log) => log.date === today);
  const todayPortions = todayLog ? sumPortions(todayLog) : null;

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
  const weekRangeLabel = formatWeekRange(thisWeek);

  const hasMonthSales = sales.some((s) => monthKey(s.date) === thisMonth);

  const bestDay = useMemo(() => {
    const monthSales = sales.filter((s) => monthKey(s.date) === thisMonth);
    if (monthSales.length === 0) return null;
    return monthSales.reduce((best, s) => (s.total > best.total ? s : best), monthSales[0]);
  }, [sales, thisMonth]);

  const trendPoints: TrendPoint[] = calendarMonthTrend(sales, thisMonth).map((day) => ({
    date: day.date,
    day: String(Number(day.date.slice(-2))),
    total: day.total ?? 0,
    kind: day.date > today ? "future" : day.total === null ? "missing" : "sales",
    isToday: day.date === today,
    isBest: bestDay?.date === day.date,
  }));

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

  const clientReady = clock !== "";
  const clockHour = clientReady ? Number(clock.split("|")[1]) : 0;
  const greeting = clientReady ? greetingFor(clockHour) : "Selamat datang";
  const dateLabel = clientReady ? formatDisplay(today) : "";
  const shortToday = clientReady ? format(parseISO(today), "EEE, d MMM") : "";

  const close = closeViewFor(todayLog);
  const todayActionLabel = !todayLog ? "Start tonight's close" : todayLog.status === "draft" ? "Continue tonight's close" : "Open tonight's close";

  const monthLabel = formatMonthLabel(thisMonth);
  const glanceCells: GlanceCell[] = [
    {
      label: clientReady ? `This week · ${weekRangeLabel}` : "This week",
      value: idr(weekTotal),
      note: <Delta value={pctDelta(weekTotal, lastWeekTotal)} comparedTo="vs last week" />,
    },
    {
      label: "Reported month total",
      value: idr(monthTotalWithAdjustment),
      note: (
        <>
          <Delta value={monthComparison.deltaPct} comparedTo={`vs ${monthComparison.label}`} />
          <span className="block">{monthOver ? "Recorded sales + selisih" : "Selisih added at month end"}</span>
        </>
      ),
    },
    {
      label: "Average per day",
      value: idr(avgPerDay),
      note: monthDaysLogged > 0 ? `${monthDaysLogged} closed ${monthDaysLogged === 1 ? "day" : "days"}` : "No closed days yet",
    },
    {
      label: "Portions sold",
      value: monthQty.toLocaleString("id-ID"),
      note: monthMainQty > 0 ? `${idr(avgOrderValue)} per Main portion` : "No Main portions yet",
    },
    {
      label: "Best day",
      value: bestDay ? idr(bestDay.total) : "—",
      note: bestDay ? formatDayLabel(bestDay.date) : undefined,
    },
    {
      label: "Best seller",
      value: topItems[0]?.name ?? "—",
      note: topItems[0] ? `${topItems[0].qty} sold` : undefined,
    },
    {
      label: "Days logged",
      value: `${monthDaysLogged} / ${daysElapsed}`,
      note: thisMonth === monthKey(today) ? "of the days so far" : "of the days in the month",
    },
    {
      label: "All-time reported total",
      value: idr(allTimeTotalWithAdjustment),
      note: "Includes selisih",
    },
  ];

  const paymentRows = paymentMix.map((d) => ({
    label: d.label,
    color: PAYMENT_COLORS[d.label],
    amount: idr(d.value),
    share: `${Math.round(d.pct * 100)}%`,
    width: d.pct * 100,
  }));
  const paymentTotal = paymentMix.reduce((a, d) => a + d.value, 0);

  const categoryRows = categoryBreakdown.map((d) => ({
    label: d.label,
    color: d.color,
    amount: `${d.qty.toLocaleString("id-ID")} sold`,
    share: `${Math.round(d.pct * 100)}%`,
    width: d.pct * 100,
  }));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-small text-ink-muted">{dateLabel || " "}</p>
          <h1 className="mt-1 font-display text-title-1 text-brand tablet:text-display">{greeting}</h1>
        </div>
        <Select value={thisMonth} onValueChange={setReportMonth}>
          <SelectTrigger
            aria-label="Reporting month"
            className="sm:data-[size=default]:h-11 gap-2 rounded-full border-line-input bg-surface px-4 text-body font-medium text-ink"
          >
            <CalendarDays className="size-5 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reportMonths.map((month) => (
              <SelectItem key={month} value={month} className="min-h-11 desk:min-h-8">
                {formatMonthLabel(month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {loadError ? (
        <ErrorBanner
          onRetry={() => {
            setLoadError(false);
            setLoading(true);
            setRetryKey((key) => key + 1);
          }}
        >
          <span className="font-semibold text-ink">Dashboard data could not be loaded.</span> Your existing view is preserved. Try again when the connection is available.
        </ErrorBanner>
      ) : null}

      <div className="grid gap-3 tablet:gap-5 min-[1024px]:grid-cols-[minmax(0,1fr)_340px]">
        <AttentionCard
          loading={loading}
          items={attentionItems}
          showAll={showAllAttention}
          onToggle={() => setShowAllAttention((current) => !current)}
        />
        <TodayCard
          dateLabel={shortToday}
          loading={loading}
          close={loading ? null : close}
          total={todayTotal}
          delta={pctDelta(todayTotal, yesterdayTotal)}
          portions={todayPortions}
          actionLabel={todayActionLabel}
        />
      </div>

      <GlanceCard
        title={`${monthLabel} at a glance`}
        range={`1–${daysElapsed} ${format(parseISO(`${thisMonth}-01`), "MMM")}`}
        loading={loading}
        cells={glanceCells}
      />

      <div className="grid gap-3 tablet:gap-5 min-[1024px]:grid-cols-[minmax(0,1fr)_340px]">
        <TrendCard
          loading={loading}
          points={trendPoints}
          average={avgPerDay}
          takeaway={trendTakeaway}
          monthLabel={monthLabel}
          hasSales={hasMonthSales}
          recapHref="/reports?tab=revenue"
          bestDayLabel={bestDay ? formatDayLabel(bestDay.date) : null}
          bestTotal={bestDay?.total ?? 0}
        />
        <ShareList
          headingId="home-payment-heading"
          title="Payment mix this month"
          subtitle="Largest first"
          rows={paymentRows}
          emptyLabel="No sales logged yet"
          loading={loading}
          totalLabel="Total"
          totalValue={idr(paymentTotal)}
        />
      </div>

      <div className="grid gap-3 tablet:gap-5 min-[1024px]:grid-cols-[minmax(0,1fr)_340px]">
        <TopItemsCard
          loading={loading}
          rows={topItems.map((item) => ({ name: item.name, qty: item.qty, width: item.pct * 100 }))}
          monthLabel={monthLabel}
          soldLabel={`${monthQty.toLocaleString("id-ID")} portions sold`}
          recapHref="/items"
        />
        <div className="grid gap-3 tablet:gap-5">
          <ShareList
            headingId="home-category-heading"
            title="Category mix this month"
            rows={categoryRows}
            emptyLabel="No item sales logged yet"
            loading={loading}
          />
          <CompositionCard
            monthLabel={monthLabel}
            monthOver={monthOver}
            recorded={idr(monthTotal)}
            adjustment={
              monthView.selisih === null ? <StatusChip tone="info">Pending</StatusChip> : idr(monthView.selisih)
            }
            reported={idr(monthTotalWithAdjustment)}
          />
        </div>
      </div>
    </div>
  );
}

function sumPortions(log: DailyItemLog): number {
  return Object.values(log.quantities ?? {}).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
}

/** The Daily close status for today, using the design's set (DESIGN_SYSTEM §6). */
function closeViewFor(log: DailyItemLog | undefined): { tone: StatusTone; label: string } {
  if (!log) return { tone: "neutral", label: "Not started" };
  if (log.status === "draft") return { tone: "info", label: "Draft" };
  if (log.status === "complete") return { tone: "ok", label: "Complete" };
  return { tone: "neutral", label: "No sales" };
}

function greetingFor(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function formatMonthLabel(monthISO: string): string {
  return format(parseISO(`${monthISO}-01`), "MMMM yyyy");
}

function formatDayLabel(dateISO: string): string {
  return format(parseISO(dateISO), "EEEE, d MMM");
}

/** "Mon 12 – Sun 18 Oct" (DESIGN_SYSTEM §7 short forms). */
function formatWeekRange(dateISO: string): string {
  const end = addDays(parseISO(dateISO), 6);
  return `${format(parseISO(dateISO), "EEE d")} – ${format(end, "EEE d MMM")}`;
}

// No comparison when the earlier period is zero: a percentage of nothing is not shown.
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
