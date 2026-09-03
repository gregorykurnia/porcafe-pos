"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSalesEntries,
  upsertSalesEntry,
  deleteSalesEntry,
  listMonthlyAdjustments,
  upsertMonthlyAdjustment,
} from "@/lib/data";
import type { SalesEntry, MonthlyAdjustment } from "@/lib/types";
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
import { Trash2, Download } from "lucide-react";
import { toast } from "sonner";

type Period = "day" | "week" | "month";

type SortKey = "date" | "bca" | "cash" | "soundbox" | "other" | "total";
type SortDir = "asc" | "desc";

type EditableField = "date" | "bca" | "cash" | "soundbox" | "other" | "note";
type Draft = Partial<Record<EditableField, string>>;

function EditableRow({
  entry,
  onSaved,
  onDelete,
}: {
  entry: SalesEntry;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  function fieldValue(field: EditableField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "note") return entry.note ?? "";
    return field === "date" ? entry.date : entry[field] ? String(entry[field]) : "";
  }

  function setField(field: EditableField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function commit() {
    if (Object.keys(draft).length === 0) return;
    setSaving(true);
    try {
      await upsertSalesEntry({
        id: entry.id,
        date: draft.date ?? entry.date,
        bca: draft.bca !== undefined ? parseFloat(draft.bca) || 0 : entry.bca,
        cash: draft.cash !== undefined ? parseFloat(draft.cash) || 0 : entry.cash,
        soundbox: draft.soundbox !== undefined ? parseFloat(draft.soundbox) || 0 : entry.soundbox,
        other: draft.other !== undefined ? parseFloat(draft.other) || 0 : entry.other,
        note: (draft.note !== undefined ? draft.note : entry.note) || undefined,
      });
      setDraft({});
      onSaved();
    } catch (err) {
      console.error("Failed to save entry:", err);
      toast.error(err instanceof Error ? `Failed to save entry: ${err.message}` : "Failed to save entry");
    } finally {
      setSaving(false);
    }
  }

  const displayTotal =
    (draft.bca !== undefined || draft.cash !== undefined || draft.soundbox !== undefined || draft.other !== undefined)
      ? (parseFloat(fieldValue("bca")) || 0) +
        (parseFloat(fieldValue("cash")) || 0) +
        (parseFloat(fieldValue("soundbox")) || 0) +
        (parseFloat(fieldValue("other")) || 0)
      : entry.total;

  function cellInput(field: EditableField, type: "date" | "number" | "text") {
    return (
      <Input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={fieldValue(field)}
        disabled={saving}
        onChange={(e) => setField(field, e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`h-8 border-transparent bg-transparent px-1.5 hover:border-neutral-200 focus:border-neutral-300 ${
          type === "number" ? "text-right" : ""
        }`}
      />
    );
  }

  return (
    <TableRow className={saving ? "opacity-50" : undefined}>
      <TableCell className="p-1">{cellInput("date", "date")}</TableCell>
      <TableCell className="p-1 text-right">{cellInput("bca", "number")}</TableCell>
      <TableCell className="p-1 text-right">{cellInput("cash", "number")}</TableCell>
      <TableCell className="p-1 text-right">{cellInput("soundbox", "number")}</TableCell>
      <TableCell className="p-1 text-right">{cellInput("other", "number")}</TableCell>
      <TableCell className="text-right font-semibold">{idr(displayTotal)}</TableCell>
      <TableCell className="p-1">{cellInput("note", "text")}</TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={() => onDelete(entry.id)}>
          <Trash2 className="size-4 text-neutral-400" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SelisihEditor({
  month,
  existing,
  onSaved,
}: {
  month: string;
  existing: MonthlyAdjustment | undefined;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upsertMonthlyAdjustment(month, parseFloat(amount) || 0, note || undefined);
      toast.success("Selisih saved");
      onSaved();
    } catch (err) {
      console.error("Failed to save selisih:", err);
      toast.error(err instanceof Error ? `Failed to save selisih: ${err.message}` : "Failed to save selisih");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="selisih">Selisih ({formatMonthDisplay(month)})</Label>
        <Input
          id="selisih"
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          disabled={saving}
          onChange={(e) => setAmount(e.target.value)}
          className="w-36"
        />
      </div>
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="selisih-note">Note (optional)</Label>
        <Input
          id="selisih-note"
          placeholder="e.g. bank reconciliation gap"
          value={note}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={save} disabled={saving} className="bg-[#1f3a2f] hover:bg-[#16291f]">
        {saving ? "Saving…" : "Save selisih"}
      </Button>
      <p className="w-full text-xs text-neutral-400">
        Added only to this month&apos;s and the grand total below — never to daily entries, so it won&apos;t appear
        in the recap chart or affect per-day stats.
      </p>
    </div>
  );
}

export default function SalesPage() {
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [adjustments, setAdjustments] = useState<MonthlyAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");

  const [date, setDate] = useState(todayISO());
  const [bca, setBca] = useState("");
  const [cash, setCash] = useState("");
  const [soundbox, setSoundbox] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [monthFilter, setMonthFilter] = useState<string>("all");

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
    Promise.all([listSalesEntries(), listMonthlyAdjustments()])
      .then(([e, a]) => {
        setEntries(e);
        setAdjustments(a);
      })
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
        date,
        bca: parseFloat(bca) || 0,
        cash: parseFloat(cash) || 0,
        soundbox: parseFloat(soundbox) || 0,
        other: parseFloat(other) || 0,
        note: note || undefined,
      });
      toast.success("Entry saved");
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
  }

  async function removeEntry(id: string) {
    await deleteSalesEntry(id);
    toast.success("Entry deleted");
    refresh();
  }

  // ---- Recap aggregation ----
  // Selisih is folded in only when grouping "by month" (period === "month"),
  // since a month is the unit it was recorded for. It never touches the
  // "by day"/"by week" buckets, so it can't read as a single-day/week spike.
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
    if (period === "month") {
      for (const a of adjustments) {
        const cur = map.get(a.month);
        if (cur) cur.total += a.amount;
      }
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [entries, period, adjustments]);

  const stats = useMemo(() => {
    const totals = grouped.map((g) => g.total);
    const n = totals.length;
    if (n === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };
    const mean = totals.reduce((s, v) => s + v, 0) / n;
    const variance = totals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    return {
      mean,
      stdDev: Math.sqrt(variance),
      min: Math.min(...totals),
      max: Math.max(...totals),
    };
  }, [grouped]);

  const chartData = grouped.slice(-20).map((g) => ({
    label: period === "day" ? g.label.slice(0, 6) : g.label.replace("Week of ", ""),
    total: g.total,
  }));

  const monthOptions = useMemo(() => {
    const keys = new Set(entries.map((e) => monthKey(e.date)));
    return [...keys].sort().reverse();
  }, [entries]);

  const sortedEntries = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const filtered = monthFilter === "all" ? entries : entries.filter((e) => monthKey(e.date) === monthFilter);
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [entries, sortKey, sortDir, monthFilter]);

  const currentAdjustment =
    monthFilter === "all"
      ? adjustments.reduce((a, x) => a + x.amount, 0)
      : (adjustments.find((a) => a.month === monthFilter)?.amount ?? 0);

  // Bank-reconciliation selisih is added only here, on the grand total —
  // never into `grouped`/`chartData`/`stats`, so it can't spike a chart or
  // skew mean/stddev/min/max/best-day.
  const grandTotal = useMemo(
    () => sortedEntries.reduce((sum, e) => sum + e.total, 0) + currentAdjustment,
    [sortedEntries, currentAdjustment]
  );

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
          <CardTitle>New daily entry</CardTitle>
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
              {saving ? "Saving…" : "Save entry"}
            </Button>
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

          {grouped.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Mean", stats.mean],
                ["Std dev", stats.stdDev],
                ["Min", stats.min],
                ["Max", stats.max],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <p className="text-xs text-neutral-500">{label}</p>
                  <p className="text-sm font-semibold text-neutral-900">{idr(value as number)}</p>
                </div>
              ))}
            </div>
          )}

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
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>All entries</CardTitle>
            <p className="text-xs text-neutral-400">Click a cell to edit it. Click a column header to sort.</p>
          </div>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="All months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthDisplay(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        {monthFilter !== "all" && (
          <CardContent className="border-b pb-4">
            <SelisihEditor
              key={monthFilter}
              month={monthFilter}
              existing={adjustments.find((a) => a.month === monthFilter)}
              onSaved={refresh}
            />
          </CardContent>
        )}
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["date", "Date", "w-36"],
                      ["bca", "BCA", "w-28"],
                      ["cash", "Cash", "w-28"],
                      ["soundbox", "Soundbox", "w-28"],
                      ["other", "Other", "w-28"],
                      ["total", "Total", "w-32"],
                    ] as [SortKey, string, string][]
                  ).map(([key, label, width]) => (
                    <TableHead key={key} className={`text-center ${width}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={`w-full text-center hover:text-neutral-900 ${
                          sortKey === key ? "font-semibold text-neutral-900" : ""
                        }`}
                      >
                        {label}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead>Note</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map((e) => (
                  <EditableRow key={e.id} entry={e} onSaved={refresh} onDelete={removeEntry} />
                ))}
              </TableBody>
              {sortedEntries.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">
                      Grand total{monthFilter !== "all" ? ` (${formatMonthDisplay(monthFilter)})` : ""}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{idr(grandTotal)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
            {sortedEntries.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-neutral-400">
                {entries.length === 0 ? "No entries yet" : "No entries in this month"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
