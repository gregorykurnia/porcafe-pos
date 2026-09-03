"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  deleteMenuItem,
  listItemSales,
  listItemSalesByDate,
  upsertItemSale,
  deleteItemSale,
  getSalesEntryByDate,
  upsertSalesEntry,
} from "@/lib/data";
import type { MenuItem, ItemSale } from "@/lib/types";
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
import { Trash2, Download, Plus, ChevronLeft, ChevronRight, ScanLine, X, Soup, Trophy } from "lucide-react";
import { toast } from "sonner";

type Period = "day" | "week" | "month";

const ITEM_CATEGORIES = ["Main", "Add On"] as const;

type EditableMenuItemField = "name" | "category" | "price";
type MenuItemDraft = Partial<Record<EditableMenuItemField, string>>;

function EditableMenuItemRow({
  item,
  onSaved,
  onDelete,
}: {
  item: MenuItem;
  onSaved: () => void;
  onDelete: (id: string) => void;
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
    <TableRow className={saving ? "opacity-50" : undefined}>
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
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}>
          <Trash2 className="size-4 text-neutral-400" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

type EditableSaleField = "date" | "itemId" | "qty";
type SaleDraft = Partial<Record<EditableSaleField, string>>;

function EditableItemSaleRow({
  sale,
  menuItems,
  onSaved,
  onDelete,
}: {
  sale: ItemSale;
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
      // Re-scanning the same ticket (or the same date) must overwrite that date's
      // per-item quantity, not add another row on top of it — otherwise every
      // rescan double-counts. Look up what's already logged for this date first.
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
      toast.success("Item sales saved — now review the revenue split");
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
      await upsertSalesEntry({
        id: existingEntryId ?? undefined,
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
                  Item sales for {scanDate} saved. Now review the payment-method split before it&apos;s logged to
                  Sales recap.
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
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");
  const [itemFilter, setItemFilter] = useState<string>("all");

  // Main-portions navigator
  const [mainPeriod, setMainPeriod] = useState<Period>("day");
  const [mainCursor, setMainCursor] = useState(todayISO());

  // Recent item sales filter
  const [recentFilter, setRecentFilter] = useState<"all" | Period>("all");
  const [recentCursor, setRecentCursor] = useState(todayISO());

  // quantity entry form
  const [date, setDate] = useState(todayISO());
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [qty, setQty] = useState("");

  // manage item dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(ITEM_CATEGORIES[0]);
  const [newPrice, setNewPrice] = useState("");

  function refresh() {
    setLoading(true);
    Promise.all([listMenuItems(), listItemSales()])
      .then(([m, s]) => {
        setMenuItems(m);
        setSales(s);
        if (!selectedItemId && m.length) setSelectedItemId(m[0].id);
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

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

  async function removeMenuItem(id: string) {
    await deleteMenuItem(id);
    toast.success("Item removed");
    refresh();
  }

  async function logSale() {
    const item = menuItems.find((m) => m.id === selectedItemId);
    if (!item || !qty || parseFloat(qty) <= 0) {
      toast.error("Select an item and quantity");
      return;
    }
    await upsertItemSale({
      date,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      qty: parseFloat(qty),
    });
    toast.success("Sale logged");
    setQty("");
    refresh();
  }

  async function removeSale(id: string) {
    await deleteItemSale(id);
    toast.success("Deleted");
    refresh();
  }

  // ---- Recap ----
  const filteredSales = useMemo(
    () => (itemFilter === "all" ? sales : sales.filter((s) => s.itemId === itemFilter)),
    [sales, itemFilter]
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
    for (const s of sales) map.set(s.itemName, (map.get(s.itemName) ?? 0) + s.qty);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [sales]);

  // Live item -> category lookup, so recaps stay correct even if a sale was
  // logged before its item's category was set/changed (the sale record keeps
  // whatever category it was logged with, but this map reflects the current one).
  const categoryByItemId = useMemo(
    () => new Map(menuItems.map((m) => [m.id, m.category])),
    [menuItems]
  );
  const mainSales = useMemo(
    () => sales.filter((s) => (categoryByItemId.get(s.itemId) ?? s.category) === "Main"),
    [sales, categoryByItemId]
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
    if (recentFilter === "all") return sales.slice(0, 30);
    const key =
      recentFilter === "day" ? recentCursor : recentFilter === "week" ? weekKey(recentCursor) : monthKey(recentCursor);
    return sales.filter(
      (s) => (recentFilter === "day" ? s.date : recentFilter === "week" ? weekKey(s.date) : monthKey(s.date)) === key
    );
  }, [sales, recentFilter, recentCursor]);

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

  function exportCSV() {
    downloadCSV(
      `porcafe-items-${period}-${todayISO()}.csv`,
      grouped.map((g) => ({ period: g.label, qty: g.qty }))
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

      {/* Quantity entry */}
      <Card>
        <CardHeader>
          <CardTitle>Log quantity sold</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {menuItems.length === 0 ? (
            <p className="text-sm text-neutral-400">Add a menu item first to start logging sales.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-2 space-y-1.5">
                  <Label>Item</Label>
                  <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {menuItems.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input type="number" inputMode="numeric" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
              </div>
              <Button onClick={logSale} className="bg-[#1f3a2f] hover:bg-[#16291f]">
                Log sale
              </Button>
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Menu items management */}
      <Card>
        <CardHeader>
          <CardTitle>Menu items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {menuItems.map((m) => (
                  <EditableMenuItemRow key={m.id} item={m} onSaved={refresh} onDelete={removeMenuItem} />
                ))}
              </TableBody>
            </Table>
            {menuItems.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No menu items yet</p>}
          </div>
        </CardContent>
      </Card>

      {/* Recent item sales */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Recent item sales</CardTitle>
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
        <CardContent>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFilteredSales.map((s) => (
                  <EditableItemSaleRow
                    key={s.id}
                    sale={s}
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
    </div>
  );
}
