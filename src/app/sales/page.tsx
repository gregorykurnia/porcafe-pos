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
  findDuplicateSalesDates,
  resolveDuplicateSalesDate,
  type DuplicateSalesDate,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  function fieldValue(field: EditableField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "note") return entry.note ?? "";
    return field === "date" ? entry.date : entry[field] ? String(entry[field]) : "";
  }

  function setField(field: EditableField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    setSaveStatus("idle");
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
      setSaveStatus("saved");
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
        className={`h-8 border-transparent bg-transparent px-1.5 hover:border-border focus:border-ring ${
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
      <TableCell className="text-right font-semibold">
        <div className="flex flex-col items-end gap-0.5">
          <span>{idr(displayTotal)}</span>
          <span aria-live="polite" className="text-xs font-normal text-success">{saving ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}</span>
        </div>
      </TableCell>
      <TableCell className="p-1">{cellInput("note", "text")}</TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => onDelete(entry.id)}
          aria-label={`Delete revenue entry for ${entry.date}`}
        >
          <Trash2 className="size-4 text-muted-foreground" />
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
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted p-3">
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
      <Button size="sm" onClick={save} disabled={saving} className="bg-primary hover:bg-primary-hover">
        {saving ? "Saving…" : "Save selisih"}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Added only to this month&apos;s and the grand total below — never to daily entries, so it won&apos;t appear
        in the recap chart or affect per-day stats.
      </p>
    </div>
  );
}

function MoneyInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">Rp</span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 pl-10 text-right tabular-nums sm:h-10"
        />
      </div>
    </div>
  );
}

function RevenueSummary({
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
    <div className={emphasized ? "rounded-lg bg-accent px-3 py-2" : "px-3 py-2"}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 tabular-nums ${emphasized ? "text-lg font-bold text-primary" : "text-base font-semibold text-foreground"}`}>
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function DuplicateDateReviewDialog({
  group,
  onResolved,
}: {
  group: DuplicateSalesDate;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState(group.entries[0]?.id ?? "");
  const [resolving, setResolving] = useState(false);

  async function resolve() {
    if (!keepId) return;
    setResolving(true);
    try {
      const result = await resolveDuplicateSalesDate(group.date, keepId);
      toast.success(`Kept one record and removed ${result.deletedIds.length} duplicate${result.deletedIds.length === 1 ? "" : "s"}`);
      setOpen(false);
      onResolved();
    } catch (err) {
      console.error("Failed to resolve duplicate sales date:", err);
      toast.error(err instanceof Error ? err.message : "Could not resolve duplicate date");
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-warning/20 bg-surface hover:bg-surface-elevated">
          Review records
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {formatDisplay(group.date)}</DialogTitle>
          <DialogDescription>
            Choose the one record that represents this operating day. The other {group.entries.length - 1} record{group.entries.length - 1 === 1 ? "" : "s"} will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {group.entries.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${keepId === entry.id ? "border-primary bg-accent" : "border-border bg-surface hover:bg-muted"}`}
            >
              <input
                type="radio"
                name={`duplicate-${group.date}`}
                value={entry.id}
                checked={keepId === entry.id}
                onChange={() => setKeepId(entry.id)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{idr(entry.total)}</span>
                  <span className="text-xs text-muted-foreground">{entry.id.startsWith("sales-") ? "Canonical ID" : "Existing ID"}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  BCA {idr(entry.bca)} · Cash {idr(entry.cash)} · Soundbox {idr(entry.soundbox)} · Other {idr(entry.other)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Created {new Date(entry.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-muted-foreground">
          This action only keeps the selected record and removes the others. It does not combine payment amounts.
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={resolving}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={resolve} disabled={resolving || !keepId}>
            {resolving ? "Resolving…" : "Keep selected record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesPage() {
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [adjustments, setAdjustments] = useState<MonthlyAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
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

  function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    setLoadError(false);
    Promise.all([listSalesEntries(), listMonthlyAdjustments()])
      .then(([e, a]) => {
        setEntries(e);
        setAdjustments(a);
      })
      .catch((err) => {
        console.error("Failed to load revenue data:", err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void Promise.resolve().then(() => refresh(false));
    // refresh is intentionally called once on mount; later refreshes are event-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setSavedMessage("Saved just now");
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
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry || !window.confirm(`Delete the revenue entry for ${formatDisplay(entry.date)}? This cannot be undone.`)) return;
    try {
      await deleteSalesEntry(id);
      toast.success("Entry deleted");
      refresh();
    } catch (err) {
      console.error("Failed to delete revenue entry:", err);
      toast.error(err instanceof Error ? err.message : "Could not delete entry");
    }
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

  const chartTakeaway = chartData.length < 2
    ? chartData.length === 1
      ? `One period is available at ${idr(chartData[0].total)}.`
      : "No recorded revenue is available for this view."
    : chartData[chartData.length - 1].total >= chartData[chartData.length - 2].total
      ? `The latest period is at or above the previous period at ${idr(chartData[chartData.length - 1].total)}.`
      : `The latest period is below the previous period at ${idr(chartData[chartData.length - 1].total)}.`;

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

  const recordedTotal = useMemo(
    () => sortedEntries.reduce((sum, e) => sum + e.total, 0),
    [sortedEntries]
  );

  const duplicateSalesDates = useMemo(() => findDuplicateSalesDates(entries), [entries]);

  function exportCSV() {
    downloadCSV(
      `porcafe-sales-${period}-${todayISO()}.csv`,
      grouped.map((g) => ({ period: g.label, total: g.total, entries: g.count }))
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Revenue workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Log payment totals for one operating day and review the recap.</p>
      </div>

      {/* Entry form */}
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Revenue for one day</CardTitle>
            <p className="text-sm text-muted-foreground">Blank payment fields are treated as zero.</p>
          </div>
      {savedMessage && <p className="text-sm font-medium text-success">{savedMessage}</p>}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} className="h-11 bg-surface sm:h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Payment methods</p>
              <p className="text-xs text-muted-foreground">Enter the amount recorded for each method.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MoneyInput id="bca" label="BCA" value={bca} onChange={setBca} />
              <MoneyInput id="cash" label="Cash" value={cash} onChange={setCash} />
              <MoneyInput id="soundbox" label="Soundbox" value={soundbox} onChange={setSoundbox} />
              <MoneyInput id="other" label="Other" value={other} onChange={setOther} />
            </div>
          </div>
          <div className="space-y-1.5 sm:max-w-xl">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" className="h-11 sm:h-10" placeholder="e.g. rain, event day" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-warm-accent bg-warm-accent/60 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-primary">Recorded sales total</p>
              <p className="mt-0.5 text-xs text-primary/65">Before any monthly reconciliation adjustment</p>
            </div>
            <span className="text-xl font-bold text-primary tabular-nums">{idr(total)}</span>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="min-h-11 bg-primary px-5 hover:bg-primary-hover sm:min-h-10">
              {saving ? "Saving…" : "Save entry"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {duplicateSalesDates.length > 0 && (
        <Card className="border-warning/25 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Duplicate dates need review</CardTitle>
            <p className="text-sm text-muted-foreground">
              These records are preserved as-is. Review them in the history below before deciding whether any cleanup is needed.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y divide-warning/15 rounded-xl border border-warning/15 bg-surface/70">
              {duplicateSalesDates.map((group) => (
                <div key={group.date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{formatDisplay(group.date)}</p>
                    <p className="text-xs text-muted-foreground">{group.entries.length} records for this operating date</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground tabular-nums">{idr(group.entries.reduce((sum, entry) => sum + entry.total, 0))}</p>
                    <p className="text-xs text-muted-foreground">Combined view only</p>
                  </div>
                  <DuplicateDateReviewDialog group={group} onResolved={refresh} />
                </div>
              ))}
            </div>
            <Button asChild variant="outline" className="border-warning/20 bg-surface hover:bg-surface-elevated">
              <a href="#sales-history">Review history</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recap */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Revenue recap</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Recorded sales stay separate from monthly reconciliation.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 border-b border-border pb-4 sm:grid-cols-3">
            <RevenueSummary label="Recorded sales" value={idr(recordedTotal)} />
            <RevenueSummary label="Reconciliation adjustment" value={idr(currentAdjustment)} detail="Selisih" />
            <RevenueSummary label="Reported total" value={idr(grandTotal)} emphasized />
          </div>
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
                <div key={label as string} className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold text-foreground">{idr(value as number)}</p>
                </div>
              ))}
            </div>
          )}

          {chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              {loading ? "Loading recap…" : loadError ? "Recap unavailable" : "No entries yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={40}
                />
                <Tooltip formatter={(v) => idr(Number(v))} />
                <Line type="monotone" dataKey="total" stroke="var(--warm-accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--warm-accent)" }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {!loading && !loadError && (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Takeaway:</span> {chartTakeaway}
            </p>
          )}

          {loadError ? (
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center">
              <p className="font-medium text-foreground">Couldn&apos;t load revenue recap</p>
              <p className="mt-1 text-sm text-muted-foreground">Check the connection and try again.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => refresh()}>Retry</Button>
            </div>
          ) : loading ? (
            <div className="space-y-3 rounded-xl border border-border p-4" aria-label="Loading revenue recap">
              {[1, 2, 3].map((row) => <div key={row} className="h-8 animate-pulse rounded bg-muted" />)}
            </div>
          ) : (
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Revenue recap table">
              <Table className="min-w-[32rem]">
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
                      <TableCell className="text-right tabular-nums">{idr(g.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{g.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card id="sales-history">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>All entries</CardTitle>
            <p className="text-xs text-muted-foreground">Click a cell to edit it. Click a column header to sort.</p>
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
          {loading ? (
            <div className="space-y-3 rounded-xl border border-border p-4" aria-label="Loading sales entries">
              {[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded bg-muted" />)}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center">
              <p className="font-medium text-foreground">Couldn&apos;t load sales entries</p>
              <p className="mt-1 text-sm text-muted-foreground">Your filters are preserved. Try again when the connection is available.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => refresh()}>Retry</Button>
            </div>
          ) : <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Revenue history">
            <Table className="min-w-[58rem] table-fixed">
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
                    <TableHead
                      key={key}
                      className={`text-center ${width}`}
                      aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        aria-label={`${label}, ${sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "not sorted"}`}
                        className={`w-full text-center hover:text-foreground ${
                          sortKey === key ? "font-semibold text-foreground" : ""
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
                      Reported total{monthFilter !== "all" ? ` (${formatMonthDisplay(monthFilter)})` : ""}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{idr(grandTotal)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
            {sortedEntries.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {entries.length === 0 ? "No entries yet" : "No entries in this month"}
              </p>
            )}
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}
