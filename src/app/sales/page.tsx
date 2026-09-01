"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listSalesEntries,
  upsertSalesEntry,
  deleteSalesEntry,
} from "@/lib/data";
import type { SalesEntry } from "@/lib/types";
import { idr, todayISO, weekKey, monthKey, formatDisplay, formatWeekDisplay, formatMonthDisplay } from "@/lib/dates";
import { downloadCSV } from "@/lib/csv";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Trash2, Download, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

type Period = "day" | "week" | "month";

type SortKey = "date" | "bca" | "cash" | "soundbox" | "other" | "total";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3.5 text-neutral-300" />;
  return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

export default function SalesPage() {
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");

  const [date, setDate] = useState(todayISO());
  const [bca, setBca] = useState("");
  const [cash, setCash] = useState("");
  const [soundbox, setSoundbox] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function refresh() {
    setLoading(true);
    listSalesEntries()
      .then(setEntries)
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const total =
    (parseFloat(bca) || 0) + (parseFloat(cash) || 0) + (parseFloat(soundbox) || 0) + (parseFloat(other) || 0);

  async function handleSave() {
    if (!date) {
      toast.error("Pick a date");
      return;
    }
    setSaving(true);
    try {
      await upsertSalesEntry({
        id: editingId ?? undefined,
        date,
        bca: parseFloat(bca) || 0,
        cash: parseFloat(cash) || 0,
        soundbox: parseFloat(soundbox) || 0,
        other: parseFloat(other) || 0,
        note: note || undefined,
      });
      toast.success(editingId ? "Entry updated" : "Entry saved");
      resetForm();
      refresh();
    } catch (err) {
      console.error("Failed to save entry:", err);
      toast.error(err instanceof Error ? `Failed to save entry: ${err.message}` : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setDate(todayISO());
    setBca("");
    setCash("");
    setSoundbox("");
    setOther("");
    setNote("");
    setEditingId(null);
  }

  function editEntry(e: SalesEntry) {
    setEditingId(e.id);
    setDate(e.date);
    setBca(e.bca ? String(e.bca) : "");
    setCash(e.cash ? String(e.cash) : "");
    setSoundbox(e.soundbox ? String(e.soundbox) : "");
    setOther(e.other ? String(e.other) : "");
    setNote(e.note ?? "");
  }

  async function removeEntry(id: string) {
    await deleteSalesEntry(id);
    toast.success("Entry deleted");
    if (editingId === id) resetForm();
    refresh();
  }

  // ---- Recap aggregation ----
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; label: string; total: number; count: number }>();
    for (const e of entries) {
      const key = period === "day" ? e.date : period === "week" ? weekKey(e.date) : monthKey(e.date);
      const label =
        period === "day" ? formatDisplay(e.date) : period === "week" ? formatWeekDisplay(key) : formatMonthDisplay(key);
      const cur = map.get(key) ?? { key, label, total: 0, count: 0 };
      cur.total += e.total;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [entries, period]);

  const chartData = grouped.slice(-20).map((g) => ({
    label: period === "day" ? g.label.slice(0, 6) : g.label.replace("Week of ", ""),
    total: g.total,
  }));

  const sortedEntries = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [entries, sortKey, sortDir]);

  function exportCSV() {
    downloadCSV(
      `porcafe-sales-${period}-${todayISO()}.csv`,
      grouped.map((g) => ({ period: g.label, total: g.total, entries: g.count }))
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Sales</h1>
        <p className="text-sm text-neutral-500">Log daily sales and view recap</p>
      </div>

      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit entry" : "New daily entry"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bca">BCA</Label>
              <Input id="bca" type="number" inputMode="decimal" placeholder="0" value={bca} onChange={(e) => setBca(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash">Cash</Label>
              <Input id="cash" type="number" inputMode="decimal" placeholder="0" value={cash} onChange={(e) => setCash(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="soundbox">Soundbox</Label>
              <Input id="soundbox" type="number" inputMode="decimal" placeholder="0" value={soundbox} onChange={(e) => setSoundbox(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label htmlFor="other">Other</Label>
              <Input id="other" type="number" inputMode="decimal" placeholder="0" value={other} onChange={(e) => setOther(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-3">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" placeholder="e.g. rain, event day" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[#e9e2d0] px-4 py-3">
            <span className="text-sm font-medium text-[#1f3a2f]">Total for this entry</span>
            <span className="text-lg font-semibold text-[#1f3a2f]">{idr(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="bg-[#1f3a2f] hover:bg-[#16291f]">
              {saving ? "Saving…" : editingId ? "Update entry" : "Save entry"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recap */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Recap</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="day">By day</TabsTrigger>
              <TabsTrigger value="week">By week</TabsTrigger>
              <TabsTrigger value="month">By month</TabsTrigger>
            </TabsList>
          </Tabs>

          {chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-neutral-400">
              {loading ? "Loading…" : "No entries yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={40}
                />
                <Tooltip formatter={(v) => idr(Number(v))} />
                <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: "#f97316" }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...grouped].reverse().map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="font-medium">{g.label}</TableCell>
                    <TableCell className="text-right">{idr(g.total)}</TableCell>
                    <TableCell className="text-right text-neutral-500">{g.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>All entries</CardTitle>
          <p className="text-xs text-neutral-400">Click a row to edit it. Click a column header to sort.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["date", "Date", ""],
                      ["bca", "BCA", "text-right"],
                      ["cash", "Cash", "text-right"],
                      ["soundbox", "Soundbox", "text-right"],
                      ["other", "Other", "text-right"],
                      ["total", "Total", "text-right"],
                    ] as [SortKey, string, string][]
                  ).map(([key, label, align]) => (
                    <TableHead key={key} className={align}>
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={`inline-flex items-center gap-1 hover:text-neutral-900 ${align === "text-right" ? "flex-row-reverse" : ""}`}
                      >
                        {label}
                        <SortIcon active={sortKey === key} dir={sortDir} />
                      </button>
                    </TableHead>
                  ))}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => editEntry(e)}>
                    <TableCell className="font-medium">{formatDisplay(e.date)}</TableCell>
                    <TableCell className="text-right text-neutral-500">{e.bca ? idr(e.bca) : "—"}</TableCell>
                    <TableCell className="text-right text-neutral-500">{e.cash ? idr(e.cash) : "—"}</TableCell>
                    <TableCell className="text-right text-neutral-500">{e.soundbox ? idr(e.soundbox) : "—"}</TableCell>
                    <TableCell className="text-right text-neutral-500">{e.other ? idr(e.other) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{idr(e.total)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          removeEntry(e.id);
                        }}
                      >
                        <Trash2 className="size-4 text-neutral-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {entries.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-neutral-400">No entries yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
