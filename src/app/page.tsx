"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSalesEntries, listItemSales } from "@/lib/data";
import type { SalesEntry, ItemSale } from "@/lib/types";
import { idr, todayISO, weekKey, monthKey } from "@/lib/dates";
import {
  format,
  parseISO,
  subDays,
  subWeeks,
  subMonths,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listSalesEntries(), listItemSales()])
      .then(([s, i]) => {
        setSales(s);
        setItems(i);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = todayISO();
  const yesterday = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
  const thisWeek = weekKey(today);
  const lastWeek = weekKey(format(subWeeks(parseISO(today), 1), "yyyy-MM-dd"));
  const thisMonth = monthKey(today);
  const lastMonth = monthKey(format(subMonths(parseISO(today), 1), "yyyy-MM-dd"));

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

  const trend = useMemo(() => {
    const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-30).map((s) => ({ date: s.date.slice(5), total: s.total }));
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

  const daysElapsed = Number(today.slice(-2));
  const avgOrderValue = monthQty > 0 ? monthTotal / monthQty : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500">Overview of Charred by Porcafe</p>
      </div>

      <Card className="border-[#1f3a2f]/15 bg-[#f6f4ec]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1f3a2f]">
            <Trophy className="size-4" />
            {formatMonthLabel(thisMonth)} at a glance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-16 items-center justify-center text-sm text-neutral-400">
              Loading…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <RecapStat label="Revenue" value={idr(monthTotal)} />
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Today"
          value={idr(todayTotal)}
          color="bg-[#1f3a2f]"
          delta={pctDelta(todayTotal, yesterdayTotal)}
          deltaLabel="vs yesterday"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="This week"
          value={idr(weekTotal)}
          color="bg-[#4a6b52]"
          delta={pctDelta(weekTotal, lastWeekTotal)}
          deltaLabel="vs last week"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="This month"
          value={idr(monthTotal)}
          color="bg-[#8a7a4f]"
          delta={pctDelta(monthTotal, lastMonthTotal)}
          deltaLabel="vs last month"
        />
        <StatCard
          icon={<CalendarDays className="size-4" />}
          label="Avg / day this month"
          value={idr(avgPerDay)}
          color="bg-[#5a6b8a]"
        />
        <StatCard
          icon={<Package className="size-4" />}
          label="Portions this month"
          value={monthQty.toLocaleString("id-ID")}
          color="bg-[#1f3a2f]"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sales trend (last 30 entries)</CardTitle>
            <Link
              href="/sales"
              className="flex items-center gap-1 text-sm font-medium text-[#1f3a2f] hover:underline"
            >
              View recap <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-56 items-center justify-center text-sm text-neutral-400">
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
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
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
                        <span className="text-neutral-700">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-neutral-500">
                        <span>{idr(d.value)}</span>
                        <span className="w-10 text-right text-xs text-neutral-400">
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
              <UtensilsCrossed className="size-4 text-[#1f3a2f]" />
              Top items this month ({monthQty} sold)
            </CardTitle>
            <Link
              href="/items"
              className="flex items-center gap-1 text-sm font-medium text-[#1f3a2f] hover:underline"
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
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e9e2d0] text-xs font-semibold text-[#1f3a2f]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-neutral-800">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-sm text-neutral-500">{item.qty} sold</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-[#1f3a2f]"
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
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
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
                        <span className="text-neutral-700">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-neutral-500">
                        <span>{d.qty} sold</span>
                        <span className="w-10 text-right text-xs text-neutral-400">
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
  return format(parseISO(dateISO), "d MMM");
}

function RecapStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-[#1f3a2f]/60">{label}</p>
      <p className="truncate text-base font-semibold text-[#1f3a2f]">{value}</p>
      {sub && <p className="text-xs text-[#1f3a2f]/50">{sub}</p>}
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
  value,
  color,
  delta,
  deltaLabel,
}: {
  icon: React.ReactNode;
  label: string;
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
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-lg font-semibold text-neutral-900 sm:text-xl">{value}</p>
        {delta !== undefined && delta !== null && (
          <div
            className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${
              delta >= 0 ? "text-[#006300]" : "text-[#d03b3b]"
            }`}
          >
            {delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            <span>{Math.abs(Math.round(delta * 100))}%</span>
            {deltaLabel && <span className="font-normal text-neutral-400">{deltaLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
      {label}
    </div>
  );
}
