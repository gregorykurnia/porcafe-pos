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
import { idr, todayISO, weekKey, monthKey, formatDisplay, formatWeekDisplay, formatMonthDisplay } from "@/lib/dates";
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
import { Trash2, Download, Plus } from "lucide-react";
import { toast } from "sonner";

type Period = "day" | "week" | "month";

export default function ItemsPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sales, setSales] = useState<ItemSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");
  const [itemFilter, setItemFilter] = useState<string>("all");

  // quantity entry form
  const [date, setDate] = useState(todayISO());
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [qty, setQty] = useState("");

  // manage item dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
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
      category: newCategory.trim() || "Uncategorized",
      price: newPrice ? parseFloat(newPrice) : null,
      active: true,
    });
    toast.success("Item added");
    setNewName("");
    setNewCategory("");
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
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
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
                <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Coffee" />
              </div>
              <div className="space-y-1.5">
                <Label>Price (optional)</Label>
                <Input type="number" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addMenuItem} className="bg-orange-500 hover:bg-orange-600">
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
              <Button onClick={logSale} className="bg-orange-500 hover:bg-orange-600">
                Log sale
              </Button>
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Top sellers */}
      <Card>
        <CardHeader>
          <CardTitle>Top sellers (all time)</CardTitle>
        </CardHeader>
        <CardContent>
          {topSellers.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, topSellers.length * 36)}>
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
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-neutral-500">{m.category}</TableCell>
                    <TableCell className="text-right text-neutral-500">{m.price ? idr(m.price) : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeMenuItem(m.id)}>
                        <Trash2 className="size-4 text-neutral-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {menuItems.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No menu items yet</p>}
          </div>
        </CardContent>
      </Card>

      {/* Recent item sales */}
      <Card>
        <CardHeader>
          <CardTitle>Recent item sales</CardTitle>
        </CardHeader>
        <CardContent>
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
                {sales.slice(0, 30).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{formatDisplay(s.date)}</TableCell>
                    <TableCell>{s.itemName}</TableCell>
                    <TableCell className="text-right">{s.qty}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeSale(s.id)}>
                        <Trash2 className="size-4 text-neutral-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sales.length === 0 && !loading && <p className="py-6 text-center text-sm text-neutral-400">No item sales yet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
