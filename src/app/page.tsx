"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSalesEntries, listItemSales } from "@/lib/data";
import type { SalesEntry, ItemSale } from "@/lib/types";
import { idr, todayISO, weekKey, monthKey } from "@/lib/dates";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Wallet, TrendingUp, UtensilsCrossed, ArrowRight } from "lucide-react";

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
  const thisWeek = weekKey(today);
  const thisMonth = monthKey(today);

  const todayTotal = sales.find((s) => s.date === today)?.total ?? 0;
  const weekTotal = sales
    .filter((s) => weekKey(s.date) === thisWeek)
    .reduce((a, s) => a + s.total, 0);
  const monthTotal = sales
    .filter((s) => monthKey(s.date) === thisMonth)
    .reduce((a, s) => a + s.total, 0);
  const monthQty = items
    .filter((i) => monthKey(i.date) === thisMonth)
    .reduce((a, i) => a + i.qty, 0);

  const trend = useMemo(() => {
    const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-14).map((s) => ({ date: s.date.slice(5), total: s.total }));
  }, [sales]);

  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items.filter((i) => monthKey(i.date) === thisMonth)) {
      map.set(i.itemName, (map.get(i.itemName) ?? 0) + i.qty);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [items, thisMonth]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500">Overview of Charred by Porcafe</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Today"
          value={idr(todayTotal)}
          color="bg-orange-500"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="This week"
          value={idr(weekTotal)}
          color="bg-amber-500"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="This month"
          value={idr(monthTotal)}
          color="bg-emerald-500"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Sales trend (last 14 entries)</CardTitle>
          <Link
            href="/sales"
            className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline"
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
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={40}
                />
                <Tooltip formatter={(v) => idr(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f97316" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="size-4 text-orange-500" />
            Top items this month ({monthQty} sold)
          </CardTitle>
          <Link
            href="/items"
            className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:underline"
          >
            View recap <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {topItems.length === 0 ? (
            <EmptyChart label="No item sales logged yet" />
          ) : (
            <ul className="divide-y">
              {topItems.map(([name, qty], idx) => (
                <li key={name} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-600">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-neutral-800">{name}</span>
                  </div>
                  <span className="text-sm text-neutral-500">{qty} sold</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className={`mb-2 flex size-7 items-center justify-center rounded-full ${color} text-white`}>
          {icon}
        </div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-lg font-semibold text-neutral-900 sm:text-xl">{value}</p>
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
