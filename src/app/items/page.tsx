"use client";

import { useEffect, useMemo, useState } from "react";
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
  getSalesEntryByDate,
  upsertSalesEntryByDate,
} from "@/lib/data";
import type { DailyItemLog, MenuItem, ItemSale } from "@/lib/types";
import {
  todayISO,
  toISODate,
  weekKey,
  monthKey,
  formatDisplay,
  formatWeekDisplay,
  formatMonthDisplay,
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
import { addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, parseISO } from "date-fns";
import { Trash2, Download, Plus, ChevronLeft, ChevronRight, ScanLine, X, Soup, Trophy, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

type Period = "day" | "week" | "month";
type ItemsView = "daily" | "performance" | "catalog" | "history";
type CatalogStatus = "active" | "archived" | "all";

const ITEM_CATEGORIES = ["Main", "Add On"] as const;

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
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-neutral-900 ${
          className?.includes("text-right") ? "flex-row-reverse" : ""
        } ${active ? "text-neutral-900" : ""}`}
      >
        {label}
        <Icon className={`size-3 ${active ? "" : "text-neutral-300"}`} />
      </button>
    </TableHead>
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
        value={fieldValue(field)}
        disabled={saving}
        onChange={(e) => setField(field, e.target.value)}
        onBlur={() => commit()}
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
    <TableRow className={`${saving ? "opacity-50" : ""} ${item.active ? "" : "bg-neutral-50/70"}`}>
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
          <SelectTrigger size="sm" className="h-8 w-full border-transparent bg-transparent hover:border-neutral-200">
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
      <TableCell className="p-1 text-right">{cellInput("price", "number")}</TableCell>
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
}: {
  sale: ItemSale;
  category: string;
  menuItems: MenuItem[];
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<SaleDraft>({});
  const [saving, setSaving] = useState(false);

  function fieldValue(field: EditableSaleField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "qty") return String(sale.qty);
    if (field === "itemId") return sale.itemId;
    return sale.date;
  }

  function setField(field: EditableSaleField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
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
          className="h-8 border-transparent bg-transparent px-1.5 hover:border-neutral-200 focus:border-neutral-300"
        />
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
          <SelectTrigger size="sm" className="h-8 w-full border-transparent bg-transparent hover:border-neutral-200">
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
      <TableCell className="p-1 text-neutral-500">{category}</TableCell>
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
          className="h-8 border-transparent bg-transparent px-1.5 text-right hover:border-neutral-200 focus:border-neutral-300"
        />
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" onClick={() => onDelete(sale.id)}>
          <Trash2 className="size-4 text-neutral-400" />
        </Button>
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

      // The daily log is the canonical scanner output. Saving by date makes a
      // rescan idempotent and replaces the complete quantity map for that sheet.
      const existingDailyLog = await getDailyItemLog(scanDate);
      await upsertDailyItemLog({
        id: existingDailyLog?.id,
        date: scanDate,
        quantities,
        totalQty: Object.values(quantities).reduce((total, value) => total + value, 0),
        status: "complete",
        source: "scan",
        createdAt: existingDailyLog?.createdAt,
      });

      // Keep the legacy collection mirrored for the existing Performance and
      // History views until those views are migrated to dailyItemLogs.
      const existingForDate = await listItemSalesByDate(scanDate);
      const existingByItemId = new Map(existingForDate.map((s) => [s.itemId, s]));
      for (const row of rowsWithQty) {
        const item = menuItems.find((m) => m.id === row.menuItemId);
        if (!item) continue;
        await upsertItemSale({
          id: existingByItemId.get(item.id)?.id,
          date: scanDate,
          itemId: item.id,
          itemName: item.name,
          category: item.category,
          qty: parseFloat(row.qty),
        });
      }
      toast.success("Daily quantities saved — now review the revenue split");
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
          <ScanLine className="size-4" /> Scan ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
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
            <p className="text-sm text-neutral-500">
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
                <Label>Date</Label>
                <Input
                  type="date"
                  value={scanDate}
                  disabled={itemsSaved}
                  onChange={(e) => setScanDate(e.target.value)}
                />
                {existingEntryId && (
                  <p className="text-xs text-amber-600">
                    A Sales entry already exists for this date — saving will update it.
                  </p>
                )}
              </div>
            </div>

            {scanning ? (
              <p className="py-6 text-center text-sm text-neutral-400">
                Reading ticket… this can take 30-60s while it carefully counts tally marks.
              </p>
            ) : step === "items" ? (
              <div className="space-y-2">
                <Label>Items sold</Label>
                <p className="text-xs text-neutral-500">
                  Confirm each row matches the correct menu item, then save. You&apos;ll review the Cash/BCA/Nobu
                  revenue split next.
                </p>
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
                            <Button variant="ghost" size="icon" onClick={() => removeDraft(idx)}>
                              <X className="size-4 text-neutral-400" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {draftItems.length === 0 && (
                    <p className="py-4 text-center text-sm text-neutral-400">No items detected</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Daily quantities for {scanDate} saved. Now review the payment-method split before it&apos;s logged
                  to Sales recap.
                </div>
                <Label>Revenue (this sheet)</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-500">Cash</Label>
                    <Input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-500">BCA</Label>
                    <Input type="number" inputMode="decimal" value={bca} onChange={(e) => setBca(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-500">Nobu (→ Soundbox)</Label>
                    <Input type="number" inputMode="decimal" value={nobu} onChange={(e) => setNobu(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  Total: {(parseFloat(cash) || 0) + (parseFloat(bca) || 0) + (parseFloat(nobu) || 0)}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {previewUrl && !scanning && step === "items" && (
            <Button onClick={confirmItems} disabled={saving} className="bg-[#1f3a2f] hover:bg-[#16291f]">
              {saving ? "Saving…" : "Save item sales & continue"}
            </Button>
          )}
          {previewUrl && !scanning && step === "revenue" && (
            <Button onClick={confirmRevenue} disabled={saving} className="bg-[#1f3a2f] hover:bg-[#16291f]">
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
  const [activeView, setActiveView] = useState<ItemsView>("daily");
  const [dailyLog, setDailyLog] = useState<DailyItemLog | null>(null);
  const [dailyQuantities, setDailyQuantities] = useState<Record<string, string>>({});
  const [dailyLoadedDate, setDailyLoadedDate] = useState("");
  const [dailySaving, setDailySaving] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [itemFilter, setItemFilter] = useState<string>("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("active");
  const [menuSort, setMenuSort] = useState<Sort<"name" | "category" | "price">>(null);
  const [saleSort, setSaleSort] = useState<Sort<"date" | "item" | "category" | "qty">>(null);

  // Main-portions navigator
  const [mainPeriod, setMainPeriod] = useState<Period>("day");
  const [mainCursor, setMainCursor] = useState(todayISO());

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

  function refresh() {
    setLoading(true);
    Promise.all([listMenuItems(), listItemSales(), listDailyItemLogs()])
      .then(([m, s, logs]) => {
        setMenuItems(m);
        setSales(s);
        setDailyLogs(logs);
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
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load menu items:", err);
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
    getDailyItemLog(date)
      .then((log) => {
        if (cancelled) return;
        setDailyLog(log);
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
          toast.error("Could not load this day");
          setDailyLoadedDate(date);
        }
      })

    return () => {
      cancelled = true;
    };
  }, [date]);

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
    if (!dailyLog) return false;
    return activeMenuItems.some(
      (item) => (parseFloat(dailyQuantities[item.id] ?? "") || 0) !== (dailyLog.quantities[item.id] ?? 0)
    );
  }, [activeMenuItems, dailyLog, dailyQuantities]);

  async function saveDailyLog(
    status: "draft" | "complete" | "no_sales",
    quantities = dailyQuantities
  ) {
    if (activeMenuItems.length === 0) {
      toast.error("Add a menu item first");
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

  const performanceSummary = useMemo(() => {
    const itemTotals = new Map<string, { name: string; qty: number }>();
    const dayTotals = new Map<string, number>();
    for (const sale of performanceSales) {
      const item = itemTotals.get(sale.itemId) ?? { name: sale.itemName, qty: 0 };
      item.qty += sale.qty;
      itemTotals.set(sale.itemId, item);
      dayTotals.set(sale.date, (dayTotals.get(sale.date) ?? 0) + sale.qty);
    }

    const totalQty = performanceSales.reduce((total, sale) => total + sale.qty, 0);
    const loggedDays = new Set([
      ...dailyLogs.map((log) => log.date),
      ...sales.map((sale) => sale.date),
    ]).size;
    const topItem = [...itemTotals.values()].sort((a, b) => b.qty - a.qty)[0] ?? null;
    const bestDay = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      totalQty,
      loggedDays,
      averageQty: loggedDays ? totalQty / loggedDays : 0,
      topItem,
      bestDay,
    };
  }, [dailyLogs, performanceSales, sales]);

  async function removeSale(id: string) {
    await deleteItemSale(id);
    toast.success("Deleted");
    refresh();
  }

  // ---- Recap ----
  const filteredSales = useMemo(
    () => (itemFilter === "all" ? performanceSales : performanceSales.filter((s) => s.itemId === itemFilter)),
    [itemFilter, performanceSales]
  );

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
    label: period === "day" ? g.label.slice(0, 6) : g.label.replace("Week of ", ""),
    qty: g.qty,
  }));

  const topSellers = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of performanceSales) map.set(s.itemName, (map.get(s.itemName) ?? 0) + s.qty);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [performanceSales]);

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
    const filtered = sales.filter((sale) => {
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
  }, [categoryByItemId, historyCategory, historyFrom, historyQuery, historyTo, recentCursor, recentFilter, sales]);

  const historyCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const sale of sales) categories.add(categoryByItemId.get(sale.itemId) ?? sale.category);
    return [...categories].sort();
  }, [categoryByItemId, sales]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Menu Items</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Track quantity sold per item</p>
        </div>
        <div className="flex items-center gap-2">
        <TicketScanDialog menuItems={menuItems} onDone={refresh} />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-[#1f3a2f] shadow-sm shadow-[#1f3a2f]/20 hover:bg-[#16291f]">
              <Plus className="size-4" /> New item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add menu item</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Iced Latte" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="w-full">
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
                <Label>Price (optional)</Label>
                <Input type="number" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addMenuItem} className="bg-[#1f3a2f] hover:bg-[#16291f]">
                Add item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as ItemsView)}
        className="w-full"
      >
        <TabsList className="grid h-10 w-full grid-cols-4 rounded-xl bg-neutral-100/80 p-1 sm:w-fit sm:min-w-[32rem]">
          <TabsTrigger value="daily" className="rounded-lg px-3">Today</TabsTrigger>
          <TabsTrigger value="performance" className="rounded-lg px-3">Performance</TabsTrigger>
          <TabsTrigger value="catalog" className="rounded-lg px-3">Catalog</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg px-3">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeView === "daily" && (
      /* Quantity entry */
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Daily quantities</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">Enter every item sold for the selected date.</p>
          </div>
          <Badge variant={!dailyHasChanges && dailyLog?.status === "complete" ? "default" : "outline"}>
            {dailyHasChanges ? "Unsaved changes" : dailyLog?.status === "no_sales" ? "No sales" : dailyLog?.status === "complete" ? "Complete" : dailyLog ? "Draft" : "Not saved"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-neutral-50 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="daily-log-date">Date</Label>
              <Input
                id="daily-log-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-[10.5rem] bg-white"
              />
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total portions</p>
              <p className="text-2xl font-semibold tracking-tight text-neutral-900">{dailyTotal}</p>
            </div>
          </div>

          {dailyLoading ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">Loading this day…</div>
          ) : activeMenuItems.length === 0 ? (
            <p className="text-sm text-neutral-400">Add an active menu item in Catalog to start logging sales.</p>
          ) : (
            <div className="space-y-5">
              {dailySections.map((section) => (
                <section key={section.category} aria-labelledby={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}>
                  <h3
                    id={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}
                    className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500"
                  >
                    {section.category}
                  </h3>
                  <div className="divide-y rounded-xl border border-neutral-200 bg-white">
                    {section.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                        <span className="min-w-0 truncate text-sm font-medium text-neutral-800">{item.name}</span>
                        <Input
                          aria-label={`${item.name} quantity`}
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          placeholder="0"
                          value={dailyQuantities[item.id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
                              setDailyQuantities((current) => ({ ...current, [item.id]: value }));
                            }
                          }}
                          className="h-9 w-24 bg-neutral-50 text-right sm:w-28"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {activeMenuItems.length > 0 && !dailyLoading && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-xs text-neutral-500">Blank or 0 means this item did not sell.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => saveDailyLog("no_sales")} disabled={dailySaving}>
                  No sales
                </Button>
                <Button variant="outline" onClick={() => saveDailyLog("draft")} disabled={dailySaving}>
                  {dailySaving ? "Saving…" : "Save draft"}
                </Button>
                <Button onClick={() => saveDailyLog("complete")} disabled={dailySaving} className="bg-[#1f3a2f] hover:bg-[#16291f]">
                  {dailySaving ? "Saving…" : "Complete day"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {activeView === "performance" && (
      <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total portions</p>
            <p className="text-2xl font-semibold tracking-tight text-neutral-900">
              {loading ? "…" : performanceSummary.totalQty.toLocaleString()}
            </p>
            <p className="text-xs text-neutral-500">Across tracked item history</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Logged days</p>
            <p className="text-2xl font-semibold tracking-tight text-neutral-900">
              {loading ? "…" : performanceSummary.loggedDays.toLocaleString()}
            </p>
            <p className="text-xs text-neutral-500">Includes explicit no-sales days</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Average per day</p>
            <p className="text-2xl font-semibold tracking-tight text-neutral-900">
              {loading ? "…" : performanceSummary.averageQty.toFixed(1)}
            </p>
            <p className="text-xs text-neutral-500">
              {loading
                ? "Loading…"
                : performanceSummary.bestDay
                  ? `Best: ${formatDisplay(performanceSummary.bestDay[0])} · ${performanceSummary.bestDay[1].toLocaleString()}`
                  : "Portions per logged day"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Top item</p>
            <p className="truncate text-lg font-semibold tracking-tight text-neutral-900">
              {loading ? "…" : performanceSummary.topItem?.name ?? "No data yet"}
            </p>
            <p className="text-xs text-neutral-500">
              {loading ? "Loading…" : performanceSummary.topItem ? `${performanceSummary.topItem.qty.toLocaleString()} portions` : "Start logging to see rankings"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main portions navigator + Top sellers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1f3a2f]/10 text-[#1f3a2f]">
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
              <Button variant="outline" size="icon" onClick={() => navigateMainPeriod(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <div className="text-center">
                <p className="text-sm text-neutral-500">{mainPeriodSummary.label}</p>
                <p className="text-5xl font-semibold tracking-tight text-neutral-900">
                  {mainPeriodSummary.total}{" "}
                  <span className="text-base font-normal text-neutral-500">portions</span>
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateMainPeriod(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {mainSales.length === 0 && !loading && (
              <p className="mt-4 text-center text-sm text-neutral-400">No Main-category sales logged yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#3d6b53]/15 text-[#3d6b53]">
                <Trophy className="size-4" />
              </span>
              <CardTitle>Top sellers (all time)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {topSellers.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, topSellers.length * 32)}>
                <BarChart data={topSellers.map(([name, qty]) => ({ name, qty }))} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="qty" fill="#3d6b53" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
            <div className="flex h-48 items-center justify-center text-sm text-neutral-400">
              {loading ? "Loading…" : "No item sales logged yet"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="qty" fill="#1f3a2f" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {activeView === "catalog" && (
      /* Menu items management */
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Catalog</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">Manage the items available in daily entry and scanning.</p>
          </div>
          <Badge variant="outline">{menuItems.filter((item) => item.active !== false).length} active</Badge>
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

          <div className="overflow-x-auto">
            <Table>
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
              <p className="py-8 text-center text-sm text-neutral-400">
                {menuItems.length === 0 ? "No menu items yet — use New item to create your catalog." : "No items match these filters."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {activeView === "history" && (
      /* Recent item sales */
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>History</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">Review and correct recorded item quantities.</p>
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
              <Button variant="outline" size="icon" onClick={() => navigateRecent(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-neutral-700">{recentFilterLabel}</p>
                {recentCursor !== todayISO() && (
                  <Button variant="ghost" size="sm" onClick={() => setRecentCursor(todayISO())}>
                    Today
                  </Button>
                )}
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateRecent(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem]">
            <Input
              aria-label="Search item history"
              placeholder="Search item or category…"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
            />
            <Select value={historyCategory} onValueChange={setHistoryCategory}>
              <SelectTrigger className="w-full">
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
            <Input
              aria-label="History start date"
              type="date"
              value={historyFrom}
              onChange={(event) => setHistoryFrom(event.target.value)}
            />
            <Input
              aria-label="History end date"
              type="date"
              value={historyTo}
              onChange={(event) => setHistoryTo(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-neutral-500">
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

          <div className="overflow-x-auto">
            <Table>
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
                  <TableHead></TableHead>
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
                  />
                ))}
              </TableBody>
            </Table>
            {recentFilteredSales.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-neutral-400">
                {recentFilter === "all" ? "No item sales yet" : "No item sales in this period"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
