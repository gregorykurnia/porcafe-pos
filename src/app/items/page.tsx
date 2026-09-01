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
  upsertItemSale,
  deleteItemSale,
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
import { Trash2, Download, Plus, ChevronLeft, ChevronRight } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Menu Items</h1>
          <p className="text-sm text-neutral-500">Track quantity sold per item</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-[#1f3a2f] hover:bg-[#16291f]">
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
            <CardTitle>Portions sold (Main)</CardTitle>
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
                <p className="text-4xl font-semibold text-neutral-900">
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
            <CardTitle>Top sellers (all time)</CardTitle>
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
                  <Tooltip />
                  <Bar dataKey="qty" fill="#fb923c" radius={[0, 4, 4, 0]} />
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
                <Tooltip />
                <Bar dataKey="qty" fill="#f97316" radius={[4, 4, 0, 0]} />
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
