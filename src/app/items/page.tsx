"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listMenuItems,
  upsertMenuItem,
  getDailyItemLog,
  listDailyItemLogs,
  upsertDailyItemLog,
  listItemSales,
  listItemSalesByDate,
  upsertItemSale,
  deleteItemSale,
  migrateLegacyItemSalesToDailyLogs,
  getSalesEntryByDate,
  upsertSalesEntryByDate,
} from "@/lib/data";
import type { DailyItemLog, MenuItem, ItemSale, SalesEntry } from "@/lib/types";
import {
  todayISO,
  idr,
  toISODate,
  weekKey,
  monthKey,
  formatDisplay,
  formatDayDisplay,
  formatWeekDisplay,
  formatMonthDisplay,
  formatDateTime,
} from "@/lib/dates";
import { isValid as isValidDate } from "date-fns";

// OCR-returned dates aren't guaranteed to be strict zero-padded YYYY-MM-DD (e.g. the
// model may emit "2026-8-2"). date-fns parses/displays that fine, but every filter in
// this app does exact string equality on `date`, so a non-canonical string silently
// breaks day filters and same-date lookups. Always normalize before storing.
function normalizeISODate(raw: string | null | undefined): string {
  if (!raw) return todayISO();
  const d = parseISO(raw);
  return isValidDate(d) ? toISODate(d) : todayISO();
}
import { downloadCSV } from "@/lib/csv";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, eachDayOfInterval, parseISO } from "date-fns";
import { Trash2, Download, Plus, ChevronLeft, ChevronRight, ScanLine, X, Soup, Trophy, ArrowUp, ArrowDown, ArrowUpDown, Banknote, CreditCard, QrCode, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { WeekdayPatternAnalysis, type WeekdayMetricOption } from "@/components/weekday-pattern-analysis";
import { analyzeWeekdayPattern, weekdayIndex } from "@/lib/weekday-analysis";
import { calculateAndPersistDailyInventoryUsage } from "@/lib/inventory-usage";

type Period = "day" | "week" | "month";
type ItemsView = "daily" | "performance" | "catalog" | "history";
type CatalogStatus = "active" | "archived" | "all";

type MigrationPreview = {
  datesFound: number;
  datesMigrated: number;
  datesSkipped: number;
  rowsMigrated: number;
  dryRun: boolean;
};

const ITEM_CATEGORIES = ["Main", "Add On"] as const;

async function calculateSavedDailyUsage(log: DailyItemLog) {
  try {
    const event = await calculateAndPersistDailyInventoryUsage(log);
    if (event) {
      void fetch("/api/push/reorder-transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: log.date }),
        keepalive: true,
      }).then((response) => {
        if (!response.ok) console.warn("Reorder push processing was not accepted", response.status);
      }).catch((error) => {
        console.warn("Reorder push processing could not be reached", error);
      });
    }
    if (event?.status === "needs-review") {
      toast.warning("Day saved, but inventory usage needs recipe or mapping review.");
    }
    return event;
  } catch (error) {
    console.error("Failed to calculate daily inventory usage:", error);
    toast.warning("Day saved, but the inventory usage recap could not be refreshed.");
    return null;
  }
}

function formatQuantity(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

const ITEM_WEEKDAY_METRICS: WeekdayMetricOption[] = [
  {
    key: "average",
    label: "Average Main portions",
    valueLabel: "Average / selling day",
    getValue: (row) => row.average,
    formatValue: formatQuantity,
  },
  {
    key: "total",
    label: "Total Main portions",
    valueLabel: "Total recorded",
    getValue: (row) => row.total,
    formatValue: formatQuantity,
  },
  {
    key: "records",
    label: "Item rows",
    valueLabel: "Rows",
    getValue: (row) => row.recordCount,
    formatValue: formatQuantity,
  },
];

const DAILY_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "bca", label: "BCA", icon: CreditCard },
  { key: "soundbox", label: "Soundbox", icon: QrCode },
  { key: "other", label: "Other", icon: Banknote },
] as const;

type SortDir = "asc" | "desc";
type Sort<K extends string> = { key: K; dir: SortDir } | null;

function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: Sort<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}, ${active ? (sort!.dir === "asc" ? "ascending" : "descending") : "not sorted"}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          className?.includes("text-right") ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className={`size-3 ${active ? "" : "text-muted-foreground"}`} />
      </button>
    </TableHead>
  );
}

function SourceAuditStat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${warning ? "border-warning/20 bg-warning/10" : "border-border bg-surface/70"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${warning ? "text-warning" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function toggleSort<K extends string>(
  current: Sort<K>,
  key: K,
  setSort: (s: Sort<K>) => void
) {
  if (current?.key === key) {
    setSort(current.dir === "asc" ? { key, dir: "desc" } : null);
  } else {
    setSort({ key, dir: "asc" });
  }
}

function cmp(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

type EditableMenuItemField = "name" | "category" | "price";
type MenuItemDraft = Partial<Record<EditableMenuItemField, string>>;

function EditableMenuItemRow({
  item,
  onSaved,
  onToggleActive,
}: {
  item: MenuItem;
  onSaved: () => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const [draft, setDraft] = useState<MenuItemDraft>({});
  const [saving, setSaving] = useState(false);

  function fieldValue(field: EditableMenuItemField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "price") return item.price !== null ? String(item.price) : "";
    return item[field] ?? "";
  }

  function setField(field: EditableMenuItemField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function commit(overrides?: MenuItemDraft) {
    const merged = { ...draft, ...overrides };
    if (Object.keys(merged).length === 0) return;
    const name = (merged.name ?? item.name).trim();
    if (!name) {
      toast.error("Name can't be empty");
      setDraft({});
      return;
    }
    setSaving(true);
    try {
      await upsertMenuItem({
        id: item.id,
        name,
        category: (merged.category ?? item.category).trim() || "Uncategorized",
        price: merged.price !== undefined ? (merged.price ? parseFloat(merged.price) : null) : item.price,
        active: item.active,
      });
      setDraft({});
      onSaved();
    } catch (err) {
      console.error("Failed to save item:", err);
      toast.error(err instanceof Error ? `Failed to save item: ${err.message}` : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  function cellInput(field: EditableMenuItemField, type: "text" | "number") {
    return (
      <Input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        aria-label={`${field === "name" ? "Menu item name" : field === "category" ? "Category" : "Price"} for ${item.name}`}
        value={fieldValue(field)}
        disabled={saving}
        onChange={(e) => setField(field, e.target.value)}
        onBlur={() => commit()}
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
    <TableRow className={`${saving ? "opacity-50" : ""} ${item.active ? "" : "bg-surface-elevated"}`}>
      <TableCell className="p-1 font-medium">{cellInput("name", "text")}</TableCell>
      <TableCell className="p-1">
        <Select
          value={fieldValue("category")}
          disabled={saving}
          onValueChange={(v) => {
            setField("category", v);
            commit({ category: v });
          }}
        >
          <SelectTrigger
            size="sm"
          className="h-8 w-full border-transparent bg-transparent hover:border-border"
            aria-label={`Category for ${item.name}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="p-1 text-right">
        {cellInput("price", "number")}
        {item.price === null && <p className="px-1.5 text-left text-xs font-medium text-warning">Missing price</p>}
      </TableCell>
      <TableCell>
        <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Active" : "Archived"}</Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleActive(item.id, !item.active)}
          disabled={saving}
          aria-label={`${item.active ? "Archive" : "Restore"} ${item.name}`}
        >
          {item.active ? "Archive" : "Restore"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type EditableSaleField = "date" | "itemId" | "qty";
type SaleDraft = Partial<Record<EditableSaleField, string>>;

function EditableItemSaleRow({
  sale,
  category,
  menuItems,
  onSaved,
  onDelete,
  readOnly = false,
}: {
  sale: ItemSale;
  category: string;
  menuItems: MenuItem[];
  onSaved: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<SaleDraft>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  function fieldValue(field: EditableSaleField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "qty") return String(sale.qty);
    if (field === "itemId") return sale.itemId;
    return sale.date;
  }

  function setField(field: EditableSaleField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    setSaveStatus("idle");
  }

  if (readOnly) {
    return (
      <TableRow>
        <TableCell className="font-medium">{formatDisplay(sale.date)}</TableCell>
        <TableCell>{sale.itemName}</TableCell>
        <TableCell className="text-muted-foreground">{category}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{sale.qty}</TableCell>
        <TableCell className="text-right"><Badge variant="secondary">Daily close</Badge></TableCell>
      </TableRow>
    );
  }

  async function commit(overrides?: SaleDraft) {
    const merged = { ...draft, ...overrides };
    if (Object.keys(merged).length === 0) return;
    const itemId = merged.itemId ?? sale.itemId;
    const item = menuItems.find((m) => m.id === itemId);
    if (!item) {
      toast.error("Item not found");
      setDraft({});
      return;
    }
    setSaving(true);
    try {
      await upsertItemSale({
        id: sale.id,
        date: merged.date ?? sale.date,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        qty: merged.qty !== undefined ? parseFloat(merged.qty) || 0 : sale.qty,
      });
      setDraft({});
      setSaveStatus("saved");
      onSaved();
    } catch (err) {
      console.error("Failed to save sale:", err);
      toast.error(err instanceof Error ? `Failed to save sale: ${err.message}` : "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow className={saving ? "opacity-50" : undefined}>
      <TableCell className="p-1">
        <Input
          type="date"
          value={fieldValue("date")}
          disabled={saving}
          onChange={(e) => {
            setField("date", e.target.value);
            commit({ date: e.target.value });
          }}
          className="h-8 border-transparent bg-transparent px-1.5 hover:border-border focus:border-ring"
        />
        <span className="block px-1.5 text-[11px] leading-4 text-muted-foreground">
          {fieldValue("date") ? formatDisplay(fieldValue("date")) : "No date selected"}
        </span>
      </TableCell>
      <TableCell className="p-1">
        <Select
          value={fieldValue("itemId")}
          disabled={saving}
          onValueChange={(v) => {
            setField("itemId", v);
            commit({ itemId: v });
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-full border-transparent bg-transparent hover:border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {menuItems.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="p-1 text-muted-foreground">{category}</TableCell>
      <TableCell className="p-1 text-right">
        <Input
          type="number"
          inputMode="numeric"
          value={fieldValue("qty")}
          disabled={saving}
          onChange={(e) => setField("qty", e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 border-transparent bg-transparent px-1.5 text-right hover:border-border focus:border-ring"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <span aria-live="polite" className="text-xs text-success">{saving ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}</span>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => onDelete(sale.id)}
            aria-label={`Delete ${sale.itemName} sale`}
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type ScanDraftItem = {
  menuItemId: string;
  rawName: string;
  qty: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:image/jpeg;base64," prefix
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function TicketScanDialog({
  menuItems,
  onDone,
}: {
  menuItems: MenuItem[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanDate, setScanDate] = useState(todayISO());
  const [draftItems, setDraftItems] = useState<ScanDraftItem[]>([]);
  const [cash, setCash] = useState("");
  const [bca, setBca] = useState("");
  const [nobu, setNobu] = useState("");
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [existingOther, setExistingOther] = useState(0);
  const [existingItemSaleCount, setExistingItemSaleCount] = useState(0);
  const [step, setStep] = useState<"items" | "revenue">("items");
  const [itemsSaved, setItemsSaved] = useState(false);

  function reset() {
    setScanning(false);
    setSaving(false);
    setPreviewUrl(null);
    setScanDate(todayISO());
    setDraftItems([]);
    setCash("");
    setBca("");
    setNobu("");
    setExistingEntryId(null);
    setExistingOther(0);
    setExistingItemSaleCount(0);
    setStep("items");
    setItemsSaved(false);
  }

  async function handleFile(file: File) {
    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mediaType: file.type || "image/jpeg",
          menuItems: menuItems.map((m) => ({ id: m.id, name: m.name, category: m.category, price: m.price })),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || `Scan failed (${res.status})`);
      const normDate = normalizeISODate(result.date);
      setScanDate(normDate);
      setDraftItems(
        (result.items ?? []).map((it: { menuItemId: string | null; rawName: string; qty: number }) => ({
          menuItemId: it.menuItemId ?? "",
          rawName: it.rawName,
          qty: String(it.qty ?? ""),
        }))
      );
      setCash(String(result.cash ?? ""));
      setBca(String(result.bca ?? ""));
      setNobu(String(result.nobu ?? ""));

      const existing = await getSalesEntryByDate(normDate);
      if (existing) {
        setExistingEntryId(existing.id);
        setExistingOther(existing.other);
      }
      const existingItemSales = await listItemSalesByDate(normDate);
      setExistingItemSaleCount(existingItemSales.length);
      toast.success("Ticket scanned — review before saving");
    } catch (err) {
      console.error("Scan failed:", err);
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<ScanDraftItem>) {
    setDraftItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeDraft(idx: number) {
    setDraftItems((rows) => rows.filter((_, i) => i !== idx));
  }

  async function confirmItems() {
    const rowsWithQty = draftItems.filter((r) => parseFloat(r.qty) > 0);
    const unmatched = rowsWithQty.filter((r) => !r.menuItemId);
    if (unmatched.length > 0) {
      toast.error(
        `Match every row before saving — no menu item selected for: ${unmatched
          .map((r) => `"${r.rawName}"`)
          .join(", ")}`
      );
      return;
    }
    if (rowsWithQty.length === 0) {
      toast.error("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const quantities: Record<string, number> = {};
      for (const row of rowsWithQty) {
        const item = menuItems.find((m) => m.id === row.menuItemId);
        if (item) quantities[item.id] = (quantities[item.id] ?? 0) + parseFloat(row.qty);
      }

      const existingForDate = await listItemSalesByDate(scanDate);
      const existingByItemId = new Map<string, ItemSale>();
      const staleLegacyRows = existingForDate.filter((sale) => {
        if (!quantities[sale.itemId] || existingByItemId.has(sale.itemId)) return true;
        existingByItemId.set(sale.itemId, sale);
        return false;
      });

      if (staleLegacyRows.length > 0 && !window.confirm(
        `This rescan will replace ${staleLegacyRows.length} legacy item row${staleLegacyRows.length === 1 ? "" : "s"} that no longer matches the reviewed sheet. Continue?`
      )) {
        return;
      }

      // The daily log is the canonical scanner output. Saving by date makes a
      // rescan idempotent and replaces the complete quantity map for that sheet.
      const existingDailyLog = await getDailyItemLog(scanDate);
      const savedDailyLog: DailyItemLog = {
        id: scanDate,
        date: scanDate,
        quantities,
        totalQty: Object.values(quantities).reduce((total, value) => total + value, 0),
        status: "complete",
        source: "scan",
        createdAt: existingDailyLog?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await upsertDailyItemLog(savedDailyLog);
      await calculateSavedDailyUsage(savedDailyLog);

      // Keep the legacy collection mirrored for older consumers. A confirmed
      // rescan is replacement semantics: stale rows and duplicate item rows
      // are removed, while reviewed quantities are written once per item.
      await Promise.all(staleLegacyRows.map((sale) => deleteItemSale(sale.id)));
      await Promise.all(Object.entries(quantities).map(([itemId, qty]) => {
        const item = menuItems.find((m) => m.id === itemId);
        if (!item) return Promise.resolve();
        return upsertItemSale({
          id: existingByItemId.get(item.id)?.id,
          date: scanDate,
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          qty,
        });
      }));
      toast.success(
        staleLegacyRows.length > 0
          ? `Daily quantities saved — removed ${staleLegacyRows.length} stale row${staleLegacyRows.length === 1 ? "" : "s"}`
          : "Daily quantities saved — now review the revenue split"
      );
      setItemsSaved(true);
      onDone();
      // scanDate may have been edited since the initial OCR-date lookup — refresh
      // which SalesEntry (if any) this revenue confirm should merge into.
      const existing = await getSalesEntryByDate(scanDate);
      setExistingEntryId(existing?.id ?? null);
      setExistingOther(existing?.other ?? 0);
      setStep("revenue");
    } catch (err) {
      console.error("Failed to save item sales:", err);
      toast.error(err instanceof Error ? `Failed to save: ${err.message}` : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRevenue() {
    setSaving(true);
    try {
      await upsertSalesEntryByDate({
        date: scanDate,
        cash: parseFloat(cash) || 0,
        bca: parseFloat(bca) || 0,
        soundbox: parseFloat(nobu) || 0,
        other: existingOther,
      });
      toast.success("Revenue logged to Sales recap");
      setOpen(false);
      reset();
      onDone();
    } catch (err) {
      console.error("Failed to save sales entry:", err);
      toast.error(err instanceof Error ? `Failed to save: ${err.message}` : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ScanLine className="size-4" /> Scan sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {previewUrl && step === "revenue"
              ? "Step 2: Review revenue split"
              : previewUrl
                ? "Step 1: Review items sold"
                : "Scan daily ticker sheet"}
          </DialogTitle>
        </DialogHeader>

        {!previewUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload or photograph the handwritten ticker sheet. Claude will read the item quantities and
              Cash/BCA/Nobu totals for you to review before saving.
            </p>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Ticket preview" className="h-24 w-24 rounded-md object-cover border" />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="scan-date">Date <span className="font-normal text-muted-foreground">({formatDisplay(scanDate)})</span></Label>
                <Input
                  id="scan-date"
                  type="date"
                  value={scanDate}
                  disabled={itemsSaved}
                  onChange={(e) => setScanDate(e.target.value)}
                />
                {existingEntryId && (
                  <p className="text-xs text-warning">
                    A Sales entry already exists for this date — saving will update it.
                  </p>
                )}
              </div>
            </div>

            {scanning ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Reading ticket… this can take 30-60s while it carefully counts tally marks.
              </p>
            ) : step === "items" ? (
              <div className="space-y-2">
                <Label>Items sold</Label>
                <p className="text-xs text-muted-foreground">
                  Confirm each row matches the correct menu item, then save. You&apos;ll review the Cash/BCA/Nobu
                  revenue split next.
                </p>
                {existingItemSaleCount > 0 && (
                  <div className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                    Existing item rows for this date were found. Confirming this scan uses replacement semantics and may remove rows no longer present.
                  </div>
                )}
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Menu item</TableHead>
                        <TableHead className="text-right w-24">Qty</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftItems.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="p-1">
                            <Select
                              value={row.menuItemId}
                              onValueChange={(v) => updateDraft(idx, { menuItemId: v })}
                            >
                              <SelectTrigger size="sm" className="h-8 w-full">
                                <SelectValue placeholder={`"${row.rawName}" — no match`} />
                              </SelectTrigger>
                              <SelectContent>
                                {menuItems.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={row.qty}
                              onChange={(e) => updateDraft(idx, { qty: e.target.value })}
                              className="h-8 text-right"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDraft(idx)}
                              aria-label={`Remove ${row.rawName} from scan`}
                            >
                              <X className="size-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {draftItems.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">No items detected</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
                  Daily quantities for {formatDisplay(scanDate)} saved. Now review the payment-method split before it&apos;s logged
                  to Sales recap.
                </div>
                <Label>Revenue (this sheet)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="scan-cash" className="text-xs text-muted-foreground">Cash</Label>
                    <Input id="scan-cash" type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="scan-bca" className="text-xs text-muted-foreground">BCA</Label>
                    <Input id="scan-bca" type="number" inputMode="decimal" value={bca} onChange={(e) => setBca(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="scan-nobu" className="text-xs text-muted-foreground">Nobu (→ Soundbox)</Label>
                    <Input id="scan-nobu" type="number" inputMode="decimal" value={nobu} onChange={(e) => setNobu(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: {(parseFloat(cash) || 0) + (parseFloat(bca) || 0) + (parseFloat(nobu) || 0)}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {previewUrl && !scanning && step === "items" && (
            <Button onClick={confirmItems} disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? "Saving…" : "Save item sales & continue"}
            </Button>
          )}
          {previewUrl && !scanning && step === "revenue" && (
            <Button onClick={confirmRevenue} disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? "Saving…" : "Confirm & log to Sales recap"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ItemsPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sales, setSales] = useState<ItemSale[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyItemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeView, setActiveView] = useState<ItemsView>("daily");
  const [dailyLog, setDailyLog] = useState<DailyItemLog | null>(null);
  const [dailySalesEntry, setDailySalesEntry] = useState<SalesEntry | null>(null);
  const [dailyQuantities, setDailyQuantities] = useState<Record<string, string>>({});
  const [dailyLoadedDate, setDailyLoadedDate] = useState("");
  const [dailyLoadError, setDailyLoadError] = useState(false);
  const [dailyRetryKey, setDailyRetryKey] = useState(0);
  const [dailySaving, setDailySaving] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [itemFilter, setItemFilter] = useState<string>("all");
  const [weekdayFrom, setWeekdayFrom] = useState("");
  const [weekdayTo, setWeekdayTo] = useState("");
  const [weekdayMetric, setWeekdayMetric] = useState("average");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("active");
  const [menuSort, setMenuSort] = useState<Sort<"name" | "category" | "price">>(null);
  const [saleSort, setSaleSort] = useState<Sort<"date" | "item" | "category" | "qty">>(null);

  // Main-portions navigator
  const [mainPeriod, setMainPeriod] = useState<Period>("day");
  const [mainCursor, setMainCursor] = useState(todayISO());
  const [itemDetailItemId, setItemDetailItemId] = useState("all");
  const [itemDetailFrom, setItemDetailFrom] = useState(`${monthKey(todayISO())}-01`);
  const [itemDetailTo, setItemDetailTo] = useState(todayISO());

  // Recent item sales filter
  const [recentFilter, setRecentFilter] = useState<"all" | Period>("all");
  const [recentCursor, setRecentCursor] = useState(todayISO());
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // quantity entry form
  const [date, setDate] = useState(todayISO());

  // manage item dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(ITEM_CATEGORIES[0]);
  const [newPrice, setNewPrice] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreview | null>(null);
  const [migrationPreviewLoading, setMigrationPreviewLoading] = useState(false);
  const [migrationApplying, setMigrationApplying] = useState(false);

  function refresh() {
    setLoading(true);
    setLoadError(false);
    Promise.all([listMenuItems(), listItemSales(), listDailyItemLogs()])
      .then(([m, s, logs]) => {
        setMenuItems(m);
        setSales(s);
        setDailyLogs(logs);
      })
      .catch((err) => {
        console.error("Failed to refresh item data:", err);
        setLoadError(true);
        toast.error("Could not refresh item data");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMenuItems(), listItemSales(), listDailyItemLogs()])
      .then(([m, s, logs]) => {
        if (cancelled) return;
        setMenuItems(m);
        setSales(s);
        setDailyLogs(logs);
        setLoadError(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load menu items:", err);
          setLoadError(true);
          toast.error("Could not load menu items");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutMarker = "daily-log-timeout" as const;
    const timeout = new Promise<typeof timeoutMarker>((resolve) => {
      setTimeout(() => resolve(timeoutMarker), 10000);
    });

    Promise.race([Promise.all([getDailyItemLog(date), getSalesEntryByDate(date)]), timeout])
      .then((result) => {
        if (cancelled) return;
        if (result === timeoutMarker) {
          setDailyLog(null);
          setDailySalesEntry(null);
          setDailyQuantities({});
          setDailyLoadedDate(date);
          setDailyLoadError(true);
          toast.error("Loading this day timed out");
          return;
        }
        const [log, salesEntry] = result;
        setDailyLog(log);
        setDailySalesEntry(salesEntry);
        setDailyLoadError(false);
        setDailyQuantities(
          Object.fromEntries(
            Object.entries(log?.quantities ?? {}).map(([itemId, value]) => [itemId, String(value)])
          )
        );
        setDailyLoadedDate(date);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load daily item log:", err);
          setDailyLog(null);
          setDailySalesEntry(null);
          setDailyQuantities({});
          toast.error("Could not load this day");
          setDailyLoadedDate(date);
          setDailyLoadError(true);
        }
      })

    return () => {
      cancelled = true;
    };
  }, [date, dailyRetryKey]);

  async function addMenuItem() {
    if (!newName.trim()) {
      toast.error("Item name required");
      return;
    }
    await upsertMenuItem({
      name: newName.trim(),
      category: newCategory || "Uncategorized",
      price: newPrice ? parseFloat(newPrice) : null,
      active: true,
    });
    toast.success("Item added");
    setNewName("");
    setNewCategory(ITEM_CATEGORIES[0]);
    setNewPrice("");
    setDialogOpen(false);
    refresh();
  }

  async function toggleMenuItemActive(id: string, active: boolean) {
    const item = menuItems.find((menuItem) => menuItem.id === id);
    if (!item) return;
    try {
      await upsertMenuItem({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        active,
      });
      toast.success(active ? `${item.name} restored` : `${item.name} archived`);
      refresh();
    } catch (err) {
      console.error("Failed to update item status:", err);
      toast.error(err instanceof Error ? `Could not update item: ${err.message}` : "Could not update item");
    }
  }

  const activeMenuItems = useMemo(
    () => menuItems.filter((item) => item.active !== false),
    [menuItems]
  );

  const dailyTotal = useMemo(
    () => Object.values(dailyQuantities).reduce((total, value) => total + (parseFloat(value) || 0), 0),
    [dailyQuantities]
  );

  const dailyCategoryTotals = useMemo(() => {
    const totals = { main: 0, addOn: 0, other: 0 };
    for (const [itemId, value] of Object.entries(dailyQuantities)) {
      const quantity = parseFloat(value) || 0;
      if (quantity <= 0) continue;

      const category = menuItems.find((item) => item.id === itemId)?.category;
      if (category === "Main") totals.main += quantity;
      else if (category === "Add On") totals.addOn += quantity;
      else totals.other += quantity;
    }
    return totals;
  }, [dailyQuantities, menuItems]);

  const dailySections = useMemo(() => {
    const knownCategories = new Set<string>(ITEM_CATEGORIES);
    const sections: { category: string; items: MenuItem[] }[] = ITEM_CATEGORIES.map((category) => ({
      category,
      items: activeMenuItems.filter((item) => item.category === category),
    }));
    const otherItems = activeMenuItems.filter((item) => !knownCategories.has(item.category));
    if (otherItems.length) sections.push({ category: "Other", items: otherItems });
    return sections.filter((section) => section.items.length > 0);
  }, [activeMenuItems]);

  const dailyLoading = dailyLoadedDate !== date;

  const dailyHasChanges = useMemo(() => {
    return activeMenuItems.some(
      (item) => (parseFloat(dailyQuantities[item.id] ?? "") || 0) !== (dailyLog?.quantities[item.id] ?? 0)
    );
  }, [activeMenuItems, dailyLog, dailyQuantities]);

  const dailyStatus = dailyHasChanges
    ? "Unsaved changes"
    : dailyLog?.status === "no_sales"
      ? "No sales"
      : dailyLog?.status === "complete"
        ? "Complete"
        : dailyLog
          ? "Draft"
          : "Not started";

  const dailyStatusClass = dailyHasChanges
    ? "border-warning/25 bg-warning/10 text-warning"
    : dailyLog?.status === "complete"
      ? "border-success/25 bg-success/10 text-success"
      : dailyLog?.status === "no_sales"
        ? "border-border bg-muted text-muted-foreground"
        : "border-border bg-surface text-muted-foreground";

  function shiftDailyDate(amount: number) {
    setDate((current) => {
      const next = amount > 0 ? addDays(parseISO(current), amount) : subDays(parseISO(current), Math.abs(amount));
      return toISODate(next);
    });
  }

  async function saveDailyLog(
    status: "draft" | "complete" | "no_sales",
    quantities = dailyQuantities
  ) {
    if (activeMenuItems.length === 0) {
      toast.error("Add a menu item first");
      return;
    }

    if (status === "no_sales" && dailyTotal > 0 && !window.confirm("Mark this day as no sales? Entered quantities will be cleared.")) {
      return;
    }

    const nextQuantities = { ...(dailyLog?.quantities ?? {}) };
    for (const item of activeMenuItems) {
      const value = parseFloat(quantities[item.id] ?? "");
      if (status === "no_sales" || !Number.isFinite(value) || value <= 0) {
        delete nextQuantities[item.id];
      } else {
        nextQuantities[item.id] = value;
      }
    }

    const savedQuantities = status === "no_sales" ? {} : nextQuantities;
    const totalQty = Object.values(savedQuantities).reduce((total, value) => total + value, 0);
    const now = Date.now();
    const savedLog: DailyItemLog = {
      id: date,
      date,
      quantities: savedQuantities,
      totalQty,
      status,
      source: "manual",
      createdAt: dailyLog?.createdAt ?? now,
      updatedAt: now,
    };

    setDailySaving(true);
    try {
      await upsertDailyItemLog(savedLog);
      await calculateSavedDailyUsage(savedLog);
      setDailyLog(savedLog);
      setDailyLogs((current) => [savedLog, ...current.filter((log) => log.date !== date)].sort((a, b) => b.date.localeCompare(a.date)));
      setDailyQuantities(
        Object.fromEntries(Object.entries(savedQuantities).map(([itemId, value]) => [itemId, String(value)]))
      );
      toast.success(status === "no_sales" ? "No sales saved" : `Day ${status === "complete" ? "completed" : "saved"}`);
    } catch (err) {
      console.error("Failed to save daily item log:", err);
      toast.error(err instanceof Error ? `Could not save day: ${err.message}` : "Could not save this day");
    } finally {
      setDailySaving(false);
    }
  }

  const categoryByItemId = useMemo(
    () => new Map(menuItems.map((item) => [item.id, item.category])),
    [menuItems]
  );

  const performanceSales = useMemo(() => {
    const dailyDates = new Set(dailyLogs.map((log) => log.date));
    const dailyRows: ItemSale[] = [];

    for (const log of dailyLogs) {
      for (const [itemId, qty] of Object.entries(log.quantities)) {
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const item = menuItems.find((menuItem) => menuItem.id === itemId);
        if (!item) continue;
        dailyRows.push({
          id: `daily-${log.date}-${itemId}`,
          date: log.date,
          itemId,
          itemName: item.name,
          category: item.category,
          qty,
          createdAt: log.updatedAt,
        });
      }
    }

    return [...dailyRows, ...sales.filter((sale) => !dailyDates.has(sale.date))].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
    );
  }, [dailyLogs, menuItems, sales]);

  const dailyLogDates = new Set(dailyLogs.map((log) => log.date));
  const legacyItemSaleDates = new Set(sales.map((sale) => sale.date));
  const legacyOnlyDates = [...legacyItemSaleDates].filter((date) => !dailyLogDates.has(date));
  const dailyOnlyDates = [...dailyLogDates].filter((date) => !legacyItemSaleDates.has(date));
  const sourceMismatch = legacyOnlyDates.length > 0;

  async function previewLegacyMigration() {
    setMigrationPreviewLoading(true);
    try {
      const preview = await migrateLegacyItemSalesToDailyLogs({ dryRun: true });
      setMigrationPreview(preview);
      toast.success("Migration preview ready — no records changed");
    } catch (err) {
      console.error("Failed to preview item migration:", err);
      toast.error(err instanceof Error ? err.message : "Could not preview item migration");
    } finally {
      setMigrationPreviewLoading(false);
    }
  }

  async function applyLegacyMigration() {
    if (!migrationPreview) return;
    const datesToMigrate = migrationPreview.datesFound - migrationPreview.datesSkipped;
    if (datesToMigrate <= 0) {
      toast.success("Nothing to migrate — all legacy dates already have daily logs");
      return;
    }
    if (!window.confirm(`Copy ${datesToMigrate} legacy date${datesToMigrate === 1 ? "" : "s"} into Daily close? Existing legacy rows will be kept.`)) {
      return;
    }

    setMigrationApplying(true);
    try {
      const result = await migrateLegacyItemSalesToDailyLogs({ dryRun: false });
      toast.success(`Migrated ${result.datesMigrated} date${result.datesMigrated === 1 ? "" : "s"} into Daily close`);
      setMigrationPreview(null);
      refresh();
    } catch (err) {
      console.error("Failed to migrate legacy item sales:", err);
      toast.error(err instanceof Error ? err.message : "Could not migrate legacy item sales");
    } finally {
      setMigrationApplying(false);
    }
  }

  const performanceSummary = useMemo(() => {
    const itemTotals = new Map<string, { name: string; qty: number }>();
    const mainDayTotals = new Map<string, number>();
    let mainTotalQty = 0;
    for (const sale of performanceSales) {
      const item = itemTotals.get(sale.itemId) ?? { name: sale.itemName, qty: 0 };
      item.qty += sale.qty;
      itemTotals.set(sale.itemId, item);
      if ((categoryByItemId.get(sale.itemId) ?? sale.category) === "Main") {
        mainTotalQty += sale.qty;
        mainDayTotals.set(sale.date, (mainDayTotals.get(sale.date) ?? 0) + sale.qty);
      }
    }

    const totalQty = performanceSales.reduce((total, sale) => total + sale.qty, 0);
    const loggedDays = new Set([
      ...dailyLogs.map((log) => log.date),
      ...sales.map((sale) => sale.date),
    ]).size;
    const topItem = [...itemTotals.values()].sort((a, b) => b.qty - a.qty)[0] ?? null;
    const bestMainDay = [...mainDayTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      totalQty,
      mainTotalQty,
      loggedDays,
      averageMainQty: loggedDays ? mainTotalQty / loggedDays : 0,
      topItem,
      bestMainDay,
    };
  }, [categoryByItemId, dailyLogs, performanceSales, sales]);

  const itemDetailRows = useMemo(() => {
    if (itemDetailItemId === "all" || !itemDetailFrom || !itemDetailTo || itemDetailFrom > itemDetailTo) return [];

    const start = parseISO(itemDetailFrom);
    const end = parseISO(itemDetailTo);
    if (!isValidDate(start) || !isValidDate(end)) return [];

    const salesByDate = new Map<string, number>();
    for (const sale of performanceSales) {
      if (sale.itemId !== itemDetailItemId) continue;
      salesByDate.set(sale.date, (salesByDate.get(sale.date) ?? 0) + sale.qty);
    }
    const logsByDate = new Map(dailyLogs.map((log) => [log.date, log]));

    return eachDayOfInterval({ start, end }).map((day) => {
      const date = toISODate(day);
      const log = logsByDate.get(date);
      const qty = salesByDate.get(date) ?? 0;
      const status = !log ? (qty > 0 ? "Sold" : "Not logged") : log.status === "no_sales" ? "No sales" : qty > 0 ? "Sold" : "0 sold";
      return { date, label: formatDisplay(date), qty, status };
    });
  }, [dailyLogs, itemDetailFrom, itemDetailItemId, itemDetailTo, performanceSales]);

  const itemDetailSummary = useMemo(() => {
    const totalQty = itemDetailRows.reduce((total, row) => total + row.qty, 0);
    const loggedDays = itemDetailRows.filter((row) => row.status !== "Not logged").length;
    return {
      totalQty,
      loggedDays,
      averageQty: loggedDays ? totalQty / loggedDays : 0,
      salesDays: itemDetailRows.filter((row) => row.qty > 0).length,
      noSalesDays: itemDetailRows.filter((row) => row.status === "No sales").length,
      unloggedDays: itemDetailRows.filter((row) => row.status === "Not logged").length,
    };
  }, [itemDetailRows]);

  async function removeSale(id: string) {
    const sale = sales.find((candidate) => candidate.id === id);
    if (!sale || !window.confirm(`Delete ${sale.itemName} (${sale.qty}) from ${formatDisplay(sale.date)}? This cannot be undone.`)) return;
    try {
      await deleteItemSale(id);
      toast.success("Item sale deleted");
      refresh();
    } catch (err) {
      console.error("Failed to delete item sale:", err);
      toast.error(err instanceof Error ? err.message : "Could not delete item sale");
    }
  }

  // ---- Recap ----
  const filteredSales = useMemo(
    () => (itemFilter === "all" ? performanceSales : performanceSales.filter((s) => s.itemId === itemFilter)),
    [itemFilter, performanceSales]
  );

  const weekdaySales = useMemo(
    () => filteredSales.filter((sale) => (categoryByItemId.get(sale.itemId) ?? sale.category) === "Main"),
    [categoryByItemId, filteredSales]
  );

  const defaultWeekdayFrom = useMemo(() => {
    const dates = weekdaySales.map((sale) => sale.date).filter(Boolean).sort();
    return dates[0] ?? todayISO();
  }, [weekdaySales]);
  const defaultWeekdayTo = useMemo(() => {
    const dates = weekdaySales.map((sale) => sale.date).filter(Boolean).sort();
    return dates[dates.length - 1] ?? todayISO();
  }, [weekdaySales]);
  const selectedWeekdayFrom = weekdayFrom || defaultWeekdayFrom;
  const selectedWeekdayTo = weekdayTo || defaultWeekdayTo;
  const weekdaySummary = useMemo(
    () => analyzeWeekdayPattern(weekdaySales, {
      from: selectedWeekdayFrom,
      to: selectedWeekdayTo,
      getDate: (sale) => sale.date,
      getValue: (sale) => sale.qty,
      occurrenceMode: "observed",
    }),
    [selectedWeekdayFrom, selectedWeekdayTo, weekdaySales]
  );

  const weekdayTopItems = useMemo(() => {
    const totalsByWeekday = new Map<number, Map<string, { name: string; qty: number }>>();
    for (const sale of weekdaySales) {
      if (sale.date < selectedWeekdayFrom || sale.date > selectedWeekdayTo) continue;
      const index = weekdayIndex(sale.date);
      if (index === null) continue;
      const itemTotals = totalsByWeekday.get(index) ?? new Map<string, { name: string; qty: number }>();
      const current = itemTotals.get(sale.itemId) ?? { name: sale.itemName, qty: 0 };
      current.qty += sale.qty;
      itemTotals.set(sale.itemId, current);
      totalsByWeekday.set(index, itemTotals);
    }

    return weekdaySummary.rows.map((row) => {
      const top = [...(totalsByWeekday.get(row.index)?.values() ?? [])]
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))[0] ?? null;
      return { weekday: row.label, top };
    });
  }, [selectedWeekdayFrom, selectedWeekdayTo, weekdaySales, weekdaySummary.rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; label: string; qty: number }>();
    for (const s of filteredSales) {
      const key = period === "day" ? s.date : period === "week" ? weekKey(s.date) : monthKey(s.date);
      const label =
        period === "day" ? formatDisplay(s.date) : period === "week" ? formatWeekDisplay(key) : formatMonthDisplay(key);
      const cur = map.get(key) ?? { key, label, qty: 0 };
      cur.qty += s.qty;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredSales, period]);

  const chartData = grouped.slice(-20).map((g) => ({
    label: period === "day" ? formatDayDisplay(g.key) : period === "week" ? formatWeekDisplay(g.key).replace("Week of ", "") : g.label,
    qty: g.qty,
  }));

  const performanceTakeaway = chartData.length < 2
    ? chartData.length === 1
      ? `One period is available at ${chartData[0].qty.toLocaleString()} portions.`
      : "No item sales are available for this view."
    : chartData[chartData.length - 1].qty >= chartData[chartData.length - 2].qty
      ? `The latest period is at or above the previous period at ${chartData[chartData.length - 1].qty.toLocaleString()} portions.`
      : `The latest period is below the previous period at ${chartData[chartData.length - 1].qty.toLocaleString()} portions.`;

  const topSellers = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of performanceSales) map.set(s.itemName, (map.get(s.itemName) ?? 0) + s.qty);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [performanceSales]);

  const topSellersTakeaway = topSellers.length > 0
    ? `${topSellers[0][0]} leads with ${topSellers[0][1].toLocaleString()} portions.`
    : "No item sales are available yet.";

  const mainSales = useMemo(
    () => performanceSales.filter((s) => (categoryByItemId.get(s.itemId) ?? s.category) === "Main"),
    [categoryByItemId, performanceSales]
  );

  const mainPeriodSummary = useMemo(() => {
    const key =
      mainPeriod === "day" ? mainCursor : mainPeriod === "week" ? weekKey(mainCursor) : monthKey(mainCursor);
    const label =
      mainPeriod === "day"
        ? formatDisplay(mainCursor)
        : mainPeriod === "week"
          ? formatWeekDisplay(key)
          : formatMonthDisplay(key);
    const total = mainSales
      .filter(
        (s) =>
          (mainPeriod === "day" ? s.date : mainPeriod === "week" ? weekKey(s.date) : monthKey(s.date)) === key
      )
      .reduce((a, s) => a + s.qty, 0);
    return { label, total };
  }, [mainSales, mainPeriod, mainCursor]);

  function navigateMainPeriod(dir: 1 | -1) {
    setMainCursor((c) => {
      const d = parseISO(c);
      if (mainPeriod === "day") return toISODate(dir === 1 ? addDays(d, 1) : subDays(d, 1));
      if (mainPeriod === "week") return toISODate(dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
      return toISODate(dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
    });
  }

  function navigateRecent(dir: 1 | -1) {
    setRecentCursor((c) => {
      const d = parseISO(c);
      if (recentFilter === "week") return toISODate(dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
      if (recentFilter === "month") return toISODate(dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
      return toISODate(dir === 1 ? addDays(d, 1) : subDays(d, 1));
    });
  }

  const recentFilteredSales = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
    const filtered = performanceSales.filter((sale) => {
      const category = categoryByItemId.get(sale.itemId) ?? sale.category;
      const matchesQuery =
        !normalizedQuery ||
        sale.itemName.toLocaleLowerCase().includes(normalizedQuery) ||
        category.toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = historyCategory === "all" || category === historyCategory;
      const matchesFrom = !historyFrom || sale.date >= historyFrom;
      const matchesTo = !historyTo || sale.date <= historyTo;
      return matchesQuery && matchesCategory && matchesFrom && matchesTo;
    });

    if (recentFilter === "all") return filtered;
    const key =
      recentFilter === "day" ? recentCursor : recentFilter === "week" ? weekKey(recentCursor) : monthKey(recentCursor);
    return filtered.filter(
      (s) => (recentFilter === "day" ? s.date : recentFilter === "week" ? weekKey(s.date) : monthKey(s.date)) === key
    );
  }, [categoryByItemId, historyCategory, historyFrom, historyQuery, historyTo, performanceSales, recentCursor, recentFilter]);

  const historyCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const sale of performanceSales) categories.add(categoryByItemId.get(sale.itemId) ?? sale.category);
    return [...categories].sort();
  }, [categoryByItemId, performanceSales]);

  const historyHasFilters = Boolean(historyQuery || historyCategory !== "all" || historyFrom || historyTo);

  const recentFilterLabel = useMemo(() => {
    if (recentFilter === "all") return null;
    const key =
      recentFilter === "day" ? recentCursor : recentFilter === "week" ? weekKey(recentCursor) : monthKey(recentCursor);
    return recentFilter === "day"
      ? formatDisplay(recentCursor)
      : recentFilter === "week"
        ? formatWeekDisplay(key)
        : formatMonthDisplay(key);
  }, [recentFilter, recentCursor]);

  const catalogCategories = useMemo(() => {
    const categories = new Set(menuItems.map((item) => item.category).filter(Boolean));
    const standard = ITEM_CATEGORIES.filter((category) => categories.has(category));
    const other = [...categories].filter((category) => !ITEM_CATEGORIES.includes(category as (typeof ITEM_CATEGORIES)[number])).sort();
    return [...standard, ...other];
  }, [menuItems]);

  const catalogMissingPriceCount = useMemo(
    () => menuItems.filter((item) => item.active !== false && item.price === null).length,
    [menuItems]
  );

  const sortedMenuItems = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLocaleLowerCase();
    const filtered = menuItems.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLocaleLowerCase().includes(normalizedQuery) ||
        item.category.toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = catalogCategory === "all" || item.category === catalogCategory;
      const matchesStatus =
        catalogStatus === "all" ||
        (catalogStatus === "active" ? item.active !== false : item.active === false);
      return matchesQuery && matchesCategory && matchesStatus;
    });

    if (!menuSort) return filtered;
    const { key, dir } = menuSort;
    const sorted = [...filtered].sort((a, b) => {
      const va = key === "price" ? (a.price ?? -Infinity) : a[key];
      const vb = key === "price" ? (b.price ?? -Infinity) : b[key];
      return cmp(va, vb);
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [catalogCategory, catalogQuery, catalogStatus, menuItems, menuSort]);

  const sortedRecentSales = useMemo(() => {
    if (!saleSort) return recentFilteredSales;
    const { key, dir } = saleSort;
    const sorted = [...recentFilteredSales].sort((a, b) => {
      const va =
        key === "item" ? a.itemName : key === "category" ? (categoryByItemId.get(a.itemId) ?? a.category) : a[key];
      const vb =
        key === "item" ? b.itemName : key === "category" ? (categoryByItemId.get(b.itemId) ?? b.category) : b[key];
      return cmp(va, vb);
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [recentFilteredSales, saleSort, categoryByItemId]);

  function exportCSV() {
    downloadCSV(
      `porcafe-items-${period}-${todayISO()}.csv`,
      grouped.map((g) => ({ period: g.label, qty: g.qty }))
    );
  }

  function exportHistoryCSV() {
    downloadCSV(
      `porcafe-item-history-${todayISO()}.csv`,
      sortedRecentSales.map((sale) => ({
        date: sale.date,
        item: sale.itemName,
        category: categoryByItemId.get(sale.itemId) ?? sale.category,
        qty: sale.qty,
      }))
    );
  }

  function exportItemDetailCSV() {
    const item = menuItems.find((menuItem) => menuItem.id === itemDetailItemId);
    if (!item || itemDetailRows.length === 0) return;
    const filename = item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCSV(
      `porcafe-${filename || "item"}-${itemDetailFrom}-to-${itemDetailTo}.csv`,
      itemDetailRows.map((row) => ({ date: row.date, item: item.name, qty: row.qty, status: row.status }))
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            {activeView === "daily" ? "Daily close" : "Menu items"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
          {activeView === "daily"
              ? "Record portions and confirm revenue for one operating day."
              : "Manage the menu and review item performance."}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <TicketScanDialog menuItems={menuItems} onDone={refresh} />
        {activeView === "daily" && (
          <Button asChild className="flex-1 bg-primary hover:bg-primary-hover sm:flex-none">
            <Link href="/sales">
              <ExternalLink className="size-4" /> Open revenue
            </Link>
          </Button>
        )}
        {activeView !== "daily" && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-primary shadow-sm shadow-primary/20 hover:bg-primary-hover">
              <Plus className="size-4" /> New item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add menu item</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-item-name">Name</Label>
                <Input id="new-item-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Iced Latte" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-item-category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger id="new-item-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-item-price">Price (optional)</Label>
                <Input id="new-item-price" type="number" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addMenuItem} className="bg-primary hover:bg-primary-hover">
                Add item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
        </div>
      </div>

      {loadError && (
        <Card className="border-danger/20 bg-danger/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-foreground">Item data could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">Your current view and filters are preserved. Try again when the connection is available.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => refresh()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as ItemsView)}
        className="w-full"
      >
        <TabsList className="grid h-10 w-full grid-cols-4 rounded-xl bg-muted/80 p-1 sm:w-fit sm:min-w-[32rem]">
          <TabsTrigger id="items-tab-daily" aria-controls="items-panel-daily" value="daily" className="rounded-lg px-3">Daily close</TabsTrigger>
          <TabsTrigger id="items-tab-performance" aria-controls="items-panel-performance" value="performance" className="rounded-lg px-3">Performance</TabsTrigger>
          <TabsTrigger id="items-tab-catalog" aria-controls="items-panel-catalog" value="catalog" className="rounded-lg px-3">Catalog</TabsTrigger>
          <TabsTrigger id="items-tab-history" aria-controls="items-panel-history" value="history" className="rounded-lg px-3">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeView === "history" && sourceMismatch && (
        <Card className="border-warning/25 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Item history source check</CardTitle>
            <p className="text-sm text-muted-foreground">
              Daily close and History now use the canonical daily log when one exists. These legacy-only dates still need the migration preview below.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <SourceAuditStat label="Daily-log dates" value={String(dailyLogDates.size)} />
              <SourceAuditStat label="Legacy-only dates" value={String(legacyOnlyDates.length)} warning={legacyOnlyDates.length > 0} />
              <SourceAuditStat label="Daily-only dates" value={String(dailyOnlyDates.length)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={previewLegacyMigration} disabled={migrationPreviewLoading}>
                {migrationPreviewLoading ? "Preparing preview…" : "Preview migration"}
              </Button>
              <p className="text-xs text-muted-foreground">Preview only — it will not write or delete data.</p>
            </div>
            {migrationPreview && (
              <div className="rounded-xl border border-info/20 bg-info/5 p-4 text-sm text-foreground">
                <p className="font-medium">Migration preview</p>
                <p className="mt-1 text-muted-foreground">
                  Would copy {migrationPreview.datesFound - migrationPreview.datesSkipped} date{migrationPreview.datesFound - migrationPreview.datesSkipped === 1 ? "" : "s"} from {migrationPreview.rowsMigrated} legacy item row{migrationPreview.rowsMigrated === 1 ? "" : "s"}. Existing daily logs would be skipped and legacy rows would remain untouched.
                </p>
                {migrationPreview.datesFound - migrationPreview.datesSkipped > 0 && (
                  <Button type="button" className="mt-3 bg-primary hover:bg-primary-hover" onClick={applyLegacyMigration} disabled={migrationApplying}>
                    {migrationApplying ? "Applying migration…" : "Apply non-destructive migration"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeView === "daily" && (
      <div id="items-panel-daily" role="tabpanel" aria-labelledby="items-tab-daily" tabIndex={0} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface px-1 py-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => shiftDailyDate(-1)}
              aria-label="Previous day"
            >
              <ChevronLeft />
            </Button>
            <div className="min-w-36 px-2 text-center">
              <p className="text-sm font-semibold text-foreground">{formatDisplay(date)}</p>
              {date === todayISO() && <p className="text-xs text-muted-foreground">Today</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => shiftDailyDate(1)}
              aria-label="Next day"
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setDate(todayISO())} disabled={date === todayISO()}>
              Today
            </Button>
            <Input
              id="daily-log-date"
              aria-label={`Choose close date: ${formatDisplay(date)}`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || todayISO())}
              className="h-10 w-[9.5rem] bg-surface"
            />
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70">
              <div>
                <CardTitle className="text-lg">Items sold</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Enter every item sold for this operating day.</p>
              </div>
              <Badge className={dailyStatusClass}>{dailyStatus}</Badge>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              {dailyLoading ? (
                <div className="space-y-4" aria-label="Loading daily close">
                  {[1, 2, 3, 4, 5].map((row) => (
                    <div key={row} className="flex animate-pulse items-center justify-between gap-4 border-b border-border/60 pb-4">
                      <div className="h-4 w-2/5 rounded bg-muted" />
                      <div className="h-11 w-28 rounded-lg bg-muted" />
                    </div>
                  ))}
                </div>
              ) : dailyLoadError ? (
                <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center">
                  <p className="font-medium text-foreground">Couldn&apos;t load this day</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your date is still selected. Try loading it again.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setDailyLoadError(false);
                      setDailyLoadedDate("");
                      setDailyRetryKey((key) => key + 1);
                    }}
                  >
                    <RotateCcw className="size-4" /> Retry
                  </Button>
                </div>
              ) : activeMenuItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="font-medium text-foreground">No active menu items</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add an active menu item in Catalog to start logging sales.</p>
                  <Button type="button" variant="outline" className="mt-4" onClick={() => setActiveView("catalog")}>
                    Open Catalog
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {dailySections.map((section) => (
                    <section key={section.category} aria-labelledby={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}>
                      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                        <h3
                          id={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}
                          className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
                        >
                          {section.category}
                        </h3>
                        <span className="text-xs font-medium text-muted-foreground">Qty</span>
                      </div>
                      <div className="divide-y divide-border/70">
                        {section.items.map((item) => {
                          const quantity = dailyQuantities[item.id] ?? "";
                          const numericQuantity = parseFloat(quantity) || 0;
                          return (
                            <div key={item.id} className="flex min-h-14 items-center justify-between gap-4 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground sm:text-base">{item.name}</p>
                                {item.price === null && <p className="text-xs font-medium text-warning">Missing price reference</p>}
                                {item.price !== null && <p className="text-xs text-muted-foreground">Ref. {idr(item.price)}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 sm:size-10"
                                  onClick={() => setDailyQuantities((current) => ({ ...current, [item.id]: String(Math.max(0, numericQuantity - 1)) }))}
                                  aria-label={`Decrease ${item.name} quantity`}
                                  disabled={numericQuantity === 0}
                                >
                                  −
                                </button>
                                <Input
                                  aria-label={`${item.name} quantity`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={quantity}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
                                      setDailyQuantities((current) => ({ ...current, [item.id]: value }));
                                    }
                                  }}
                                  className="h-11 w-16 bg-surface text-right tabular-nums sm:w-20"
                                />
                                <button
                                  type="button"
                                  className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:size-10"
                                  onClick={() => setDailyQuantities((current) => ({ ...current, [item.id]: String(numericQuantity + 1) }))}
                                  aria-label={`Increase ${item.name} quantity`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-accent lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle className="text-lg">Day summary</CardTitle>
              <p className="text-sm text-muted-foreground">{formatDisplay(date)}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">Main portions</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-foreground tabular-nums">{dailyCategoryTotals.main}</p>
              </div>
              <div className="border-t border-primary/10 pt-4">
                <p className="text-sm font-medium text-foreground">Portion split</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-primary/10 bg-surface/70 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Main</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{dailyCategoryTotals.main}</p>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-surface/70 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Add On</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{dailyCategoryTotals.addOn}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  All items: {dailyTotal}{dailyCategoryTotals.other > 0 ? ` · Other: ${dailyCategoryTotals.other}` : ""} portions
                </p>
              </div>
              <div className="border-t border-primary/10 pt-4">
                <p className="text-sm text-muted-foreground">Close status</p>
                <Badge className={`mt-2 ${dailyStatusClass}`}>{dailyStatus}</Badge>
              </div>
              <div className="border-t border-primary/10 pt-4">
                <p className="text-sm text-muted-foreground">Revenue logged</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">{idr(dailySalesEntry?.total ?? 0)}</p>
              </div>
              <div className="space-y-3 border-t border-primary/10 pt-4">
                <p className="text-sm font-medium text-foreground">Payment split</p>
                {DAILY_PAYMENT_METHODS.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /> {label}</span>
                    <span className="font-medium text-foreground tabular-nums">{idr(dailySalesEntry?.[key] ?? 0)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-primary/10 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium text-foreground">{dailyLog?.source === "scan" ? "Scanned" : "Manual"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Last saved</span>
                  <span className="font-medium text-foreground">{dailyLog ? formatDateTime(dailyLog.updatedAt) : "Not saved yet"}</span>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full border-primary/20 bg-surface text-primary hover:bg-surface-elevated">
                <Link href="/sales">
                  Open revenue <ExternalLink className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {activeMenuItems.length > 0 && !dailyLoading && !dailyLoadError && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-y border-border bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgb(31_58_47_/_50%)] backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{dailySaving ? "Saving changes…" : dailyHasChanges ? "Unsaved changes" : dailyLog ? "Saved for this day" : "Ready to close"}</p>
                <p className="text-xs text-muted-foreground">Blank or 0 means this item did not sell.</p>
              </div>
              <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                <Button variant="outline" onClick={() => saveDailyLog("no_sales")} disabled={dailySaving} className="min-h-11">
                  No sales
                </Button>
                <Button variant="secondary" onClick={() => saveDailyLog("draft")} disabled={dailySaving} className="min-h-11">
                  {dailySaving ? "Saving…" : "Save draft"}
                </Button>
                <Button onClick={() => saveDailyLog("complete")} disabled={dailySaving} className="min-h-11 bg-primary hover:bg-primary-hover">
                  {dailySaving ? "Saving…" : "Complete day"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {activeView === "performance" && (
      <div id="items-panel-performance" role="tabpanel" aria-labelledby="items-tab-performance" tabIndex={0} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total portions</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {loading ? "…" : performanceSummary.totalQty.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Across tracked item history</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logged days</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {loading ? "…" : performanceSummary.loggedDays.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Includes explicit no-sales days</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Average Main portions per day</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {loading ? "…" : performanceSummary.averageMainQty.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : performanceSummary.bestMainDay
                  ? `Best Main day: ${formatDisplay(performanceSummary.bestMainDay[0])} · ${performanceSummary.bestMainDay[1].toLocaleString()}`
                  : "Main portions per logged day"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top item</p>
            <p className="truncate text-lg font-semibold tracking-tight text-foreground">
              {loading ? "…" : performanceSummary.topItem?.name ?? "No data yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : performanceSummary.topItem ? `${performanceSummary.topItem.qty.toLocaleString()} portions` : "Start logging to see rankings"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Item detail</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">See one item&apos;s quantity across a date or date range.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportItemDetailCSV}
            disabled={itemDetailItemId === "all" || itemDetailRows.length === 0}
          >
            <Download className="size-3.5" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
            <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
              <Label htmlFor="item-detail-item" className="text-xs text-muted-foreground">Item</Label>
              <Select value={itemDetailItemId} onValueChange={setItemDetailItemId}>
                <SelectTrigger id="item-detail-item" className="w-full">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select an item</SelectItem>
                  {menuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.active === false ? " (Archived)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="item-detail-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="item-detail-from"
                aria-label={`Item detail start date: ${formatDisplay(itemDetailFrom)}`}
                type="date"
                value={itemDetailFrom}
                onChange={(event) => setItemDetailFrom(event.target.value)}
              />
              <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(itemDetailFrom)}</p>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="item-detail-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="item-detail-to"
                aria-label={`Item detail end date: ${formatDisplay(itemDetailTo)}`}
                type="date"
                value={itemDetailTo}
                onChange={(event) => setItemDetailTo(event.target.value)}
              />
              <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(itemDetailTo)}</p>
            </div>
          </div>

          {itemDetailItemId === "all" ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Select an item to see its quantity breakdown.
            </div>
          ) : itemDetailFrom > itemDetailTo ? (
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
              The start date must be on or before the end date.
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading item detail…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Total sold</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{itemDetailSummary.totalQty.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Average / logged day</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{itemDetailSummary.averageQty.toFixed(1)}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Sales days</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{itemDetailSummary.salesDays}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">No-sales days</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{itemDetailSummary.noSalesDays}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Unlogged days</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{itemDetailSummary.unloggedDays}</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={itemDetailRows.map((row) => ({ label: formatDayDisplay(row.date), qty: row.qty }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  />
                  <Bar dataKey="qty" fill="var(--primary-brand)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>

              <div
                className="max-h-72 overflow-y-auto rounded-xl border"
                role="region"
                tabIndex={0}
                aria-label="Item detail table"
              >
                <Table className="min-w-[28rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemDetailRows.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right font-medium">{row.qty.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "Sold" ? "default" : row.status === "Not logged" ? "outline" : "secondary"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Takeaway:</span> {itemDetailSummary.totalQty.toLocaleString()} portions across {itemDetailSummary.loggedDays} logged days, including {itemDetailSummary.noSalesDays} no-sales days.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Main portions navigator + Top sellers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Soup className="size-4" />
              </span>
              <CardTitle>Portions sold (Main)</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Tabs
                value={mainPeriod}
                onValueChange={(v) => {
                  setMainPeriod(v as Period);
                  setMainCursor(todayISO());
                }}
              >
                <TabsList>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>
              </Tabs>
              {mainCursor !== todayISO() && (
                <Button variant="outline" size="sm" onClick={() => setMainCursor(todayISO())}>
                  Today
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center">
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="icon-lg" onClick={() => navigateMainPeriod(-1)} aria-label="Previous main portions period">
                <ChevronLeft className="size-4" />
              </Button>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{mainPeriodSummary.label}</p>
                <p className="text-5xl font-semibold tracking-tight text-foreground">
                  {loading ? "…" : mainPeriodSummary.total}{" "}
                  <span className="text-base font-normal text-muted-foreground">portions</span>
                </p>
              </div>
              <Button variant="outline" size="icon-lg" onClick={() => navigateMainPeriod(1)} aria-label="Next main portions period">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {mainSales.length === 0 && !loading && (
              <p className="mt-4 text-center text-sm text-muted-foreground">No Main-category sales logged yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Trophy className="size-4" />
              </span>
              <CardTitle>Top sellers (all time)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground" aria-live="polite">Loading top sellers…</p>
            ) : topSellers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, topSellers.length * 32)}>
                <BarChart data={topSellers.map(([name, qty]) => ({ name, qty }))} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="qty" fill="var(--primary-hover)" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {!loading && <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Takeaway:</span> {topSellersTakeaway}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recap */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Recap</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={itemFilter} onValueChange={setItemFilter}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="All items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {menuItems.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
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
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No item sales logged yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="qty" fill="var(--primary-brand)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {!loading && <p className="border-t border-border pt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Takeaway:</span> {performanceTakeaway}</p>}
        </CardContent>
      </Card>

      <WeekdayPatternAnalysis
        id="items-weekday-pattern"
        title="Main portions sold by weekday"
        description="Compare recorded Main portions across weekdays to spot recurring patterns in the selected range."
        rangeDescription="Uses the existing canonical Main-item performance stream. Add Ons and no-sale days are excluded; the data has item rows, not customer transaction IDs."
        from={selectedWeekdayFrom}
        to={selectedWeekdayTo}
        onFromChange={setWeekdayFrom}
        onToChange={setWeekdayTo}
        summary={weekdaySummary}
        metrics={ITEM_WEEKDAY_METRICS}
        activeMetric={weekdayMetric}
        onMetricChange={setWeekdayMetric}
        loading={loading}
        error={loadError}
        emptyLabel="No Main portions fall in this range. Try widening the dates or log a daily close."
        totalLabel="Main portions in range"
        formatTotal={formatQuantity}
        formatAverage={formatQuantity}
        recordLabel="Main item rows"
        averageBasis="observed"
        occurrenceLabel="Selling days"
      />

      <Card>
        <CardHeader>
          <CardTitle>Top Main item by weekday</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">The leading Main item for each weekday in the same range and item filter.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="rounded-xl border border-border p-5 text-center text-sm text-muted-foreground" aria-live="polite">Loading top items…</p>
          ) : loadError ? (
            <p className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center text-sm text-muted-foreground">Top-item analysis is unavailable while the data connection is being restored.</p>
          ) : weekdaySummary.recordCount === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No item sales are available for this range.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border" role="region" tabIndex={0} aria-label="Top item by weekday table">
              <Table className="min-w-[28rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Weekday</TableHead>
                    <TableHead>Top item</TableHead>
                    <TableHead className="text-right">Portions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekdayTopItems.map(({ weekday, top }) => (
                    <TableRow key={weekday}>
                      <TableCell className="font-medium">{weekday}</TableCell>
                      <TableCell>{top?.name ?? <span className="text-muted-foreground">No recorded item sales</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{top ? formatQuantity(top.qty) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      )}

      {activeView === "catalog" && (
      /* Menu items management */
      <Card id="items-panel-catalog" role="tabpanel" aria-labelledby="items-tab-catalog" tabIndex={0}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Catalog</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Manage the items available in daily entry and scanning.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{menuItems.filter((item) => item.active !== false).length} active</Badge>
            {catalogMissingPriceCount > 0 && (
              <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                {catalogMissingPriceCount} missing price{catalogMissingPriceCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
            <Input
              aria-label="Search menu items"
              placeholder="Search by item or category…"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
            />
            <Select value={catalogCategory} onValueChange={setCatalogCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {catalogCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={catalogStatus} onValueChange={(value) => setCatalogStatus(value as CatalogStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading menu catalog…
            </div>
          ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Menu catalog">
            <Table className="min-w-[42rem]">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name" sortKey="name" sort={menuSort} onSort={(k) => toggleSort(menuSort, k, setMenuSort)} />
                  <SortableHead label="Category" sortKey="category" sort={menuSort} onSort={(k) => toggleSort(menuSort, k, setMenuSort)} />
                  <SortableHead
                    label="Price"
                    sortKey="price"
                    sort={menuSort}
                    onSort={(k) => toggleSort(menuSort, k, setMenuSort)}
                    className="text-right"
                  />
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMenuItems.map((m) => (
                  <EditableMenuItemRow key={m.id} item={m} onSaved={refresh} onToggleActive={toggleMenuItemActive} />
                ))}
              </TableBody>
            </Table>
            {sortedMenuItems.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {menuItems.length === 0 ? "No menu items yet — use New item to create your catalog." : "No items match these filters."}
              </p>
            )}
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {activeView === "history" && (
      /* Recent item sales */
      <Card id="items-panel-history" role="tabpanel" aria-labelledby="items-tab-history" tabIndex={0}>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>History</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Review quantities. Daily close records are read-only here; legacy rows remain editable.</p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs
              value={recentFilter}
              onValueChange={(v) => {
                setRecentFilter(v as "all" | Period);
                setRecentCursor(todayISO());
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentFilter !== "all" && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button variant="outline" size="icon-lg" onClick={() => navigateRecent(-1)} aria-label="Previous history period">
                <ChevronLeft className="size-4" />
              </Button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{recentFilterLabel}</p>
                {recentCursor !== todayISO() && (
                  <Button variant="ghost" size="sm" onClick={() => setRecentCursor(todayISO())}>
                    Today
                  </Button>
                )}
              </div>
              <Button variant="outline" size="icon-lg" onClick={() => navigateRecent(1)} aria-label="Next history period">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem]">
            <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
              <Label htmlFor="history-search" className="text-xs text-muted-foreground">Search</Label>
              <Input
                id="history-search"
                aria-label="Search item history"
                placeholder="Search item or category…"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
              />
            </div>
            <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
              <Label htmlFor="history-category" className="text-xs text-muted-foreground">Category</Label>
              <Select value={historyCategory} onValueChange={setHistoryCategory}>
                <SelectTrigger id="history-category" className="w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {historyCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="history-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="history-from"
                aria-label={`History start date${historyFrom ? `: ${formatDisplay(historyFrom)}` : ""}`}
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
              />
              {historyFrom && <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(historyFrom)}</p>}
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="history-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="history-to"
                aria-label={`History end date${historyTo ? `: ${formatDisplay(historyTo)}` : ""}`}
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
              />
              {historyTo && <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(historyTo)}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              {sortedRecentSales.length} {sortedRecentSales.length === 1 ? "entry" : "entries"}
              {historyHasFilters ? " match the current filters" : " shown"}
            </p>
            <div className="flex items-center gap-2">
              {historyHasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryCategory("all");
                    setHistoryFrom("");
                    setHistoryTo("");
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={exportHistoryCSV} disabled={sortedRecentSales.length === 0}>
                <Download className="size-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading item history…
            </div>
          ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Item sales history">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Date" sortKey="date" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead label="Item" sortKey="item" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead label="Category" sortKey="category" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead
                    label="Qty"
                    sortKey="qty"
                    sort={saleSort}
                    onSort={(k) => toggleSort(saleSort, k, setSaleSort)}
                    className="text-right"
                  />
                  <TableHead>Source / action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecentSales.map((s) => (
                  <EditableItemSaleRow
                    key={s.id}
                    sale={s}
                    category={categoryByItemId.get(s.itemId) ?? s.category}
                    menuItems={menuItems}
                    onSaved={refresh}
                    onDelete={removeSale}
                    readOnly={s.id.startsWith("daily-")}
                  />
                ))}
              </TableBody>
            </Table>
            {recentFilteredSales.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {recentFilter === "all" ? "No item sales yet" : "No item sales in this period"}
              </p>
            )}
          </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
