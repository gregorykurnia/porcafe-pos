"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { EditableMenuItemRow } from "@/components/setup/menu-item-row";
import { SortableHead, cmp, toggleSort, type Sort } from "@/components/sortable-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMenuItems, upsertMenuItem } from "@/lib/data";
import { ITEM_CATEGORIES, moveWithinCategory } from "@/lib/menu-sheet";
import type { MenuItem } from "@/lib/types";

type CatalogStatus = "active" | "archived" | "all";
type CatalogSortKey = "name" | "category" | "price";

/** The menu: the items available in daily entry and scanning. Lives in Setup → Menu. */
export function MenuCatalog() {
  const confirm = useConfirm();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<CatalogStatus>("active");
  const [sort, setSort] = useState<Sort<CatalogSortKey>>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(ITEM_CATEGORIES[0]);
  const [newPrice, setNewPrice] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listMenuItems());
    } catch (err) {
      console.error("Failed to load menu items", err);
      toast.error(err instanceof Error ? err.message : "Could not load the menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const categories = useMemo(() => {
    const found = new Set(items.map((item) => item.category).filter(Boolean));
    const standard = ITEM_CATEGORIES.filter((c) => found.has(c));
    const other = [...found].filter((c) => !ITEM_CATEGORIES.includes(c as (typeof ITEM_CATEGORIES)[number])).sort();
    return [...standard, ...other];
  }, [items]);

  const missingPriceCount = useMemo(() => items.filter((item) => item.active !== false && item.price === null).length, [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLocaleLowerCase().includes(normalizedQuery) ||
        item.category.toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = category === "all" || item.category === category;
      const matchesStatus = status === "all" || (status === "active" ? item.active !== false : item.active === false);
      return matchesQuery && matchesCategory && matchesStatus;
    });

    if (!sort) return filtered;
    const { key, dir } = sort;
    const sorted = [...filtered].sort((a, b) => {
      const va = key === "price" ? (a.price ?? -Infinity) : a[key];
      const vb = key === "price" ? (b.price ?? -Infinity) : b[key];
      return cmp(va, vb);
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [category, items, query, sort, status]);

  async function addItem() {
    if (!newName.trim()) {
      toast.error("Item name required");
      return;
    }
    try {
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
      void load();
    } catch (err) {
      console.error("Failed to add menu item", err);
      toast.error(err instanceof Error ? err.message : "Could not add the item");
    }
  }

  // Renumbers the item's category so the sheet order is 1, 2, 3… with the item one place along.
  async function moveItem(item: MenuItem, direction: -1 | 1) {
    const orders = moveWithinCategory(items, item.id, direction);
    if (orders.size === 0) return;
    try {
      await Promise.all(
        [...orders].map(([id, sheetOrder]) => {
          const menuItem = items.find((candidate) => candidate.id === id);
          if (!menuItem) return Promise.resolve();
          return upsertMenuItem({ id, name: menuItem.name, category: menuItem.category, price: menuItem.price, active: menuItem.active, sheetOrder });
        })
      );
      void load();
    } catch (err) {
      console.error("Failed to reorder menu items:", err);
      toast.error(err instanceof Error ? `Could not change the order: ${err.message}` : "Could not change the order");
    }
  }

  async function toggleActive(id: string, active: boolean) {
    const item = items.find((menuItem) => menuItem.id === id);
    if (!item) return;
    if (!active) {
      const ok = await confirm({
        title: `Archive ${item.name}?`,
        body: "Archived items disappear from Daily close and scanning. Past sales stay in History.",
        confirmLabel: "Archive",
      });
      if (!ok) return;
    }
    try {
      await upsertMenuItem({ id: item.id, name: item.name, category: item.category, price: item.price, active });
      toast.success(active ? `${item.name} restored` : `${item.name} archived`);
      void load();
    } catch (err) {
      console.error("Failed to update item status:", err);
      toast.error(err instanceof Error ? `Could not update item: ${err.message}` : "Could not update item");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Menu</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Manage the items available in daily entry and scanning.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">{items.filter((item) => item.active !== false).length} active</Badge>
          {missingPriceCount > 0 && (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
              {missingPriceCount} missing price{missingPriceCount === 1 ? "" : "s"}
            </Badge>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                <Button onClick={() => void addItem()} className="bg-primary hover:bg-primary-hover">
                  Add item
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
          <Input aria-label="Search menu items" placeholder="Search by item or category…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Filter by category" className="w-full">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as CatalogStatus)}>
            <SelectTrigger aria-label="Filter by status" className="w-full">
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
                  <SortableHead label="Name" sortKey="name" sort={sort} onSort={(k) => toggleSort(sort, k, setSort)} className="sticky left-0 z-10 min-w-44 bg-card" />
                  <SortableHead label="Category" sortKey="category" sort={sort} onSort={(k) => toggleSort(sort, k, setSort)} />
                  <SortableHead label="Price" sortKey="price" sort={sort} onSort={(k) => toggleSort(sort, k, setSort)} className="text-right" />
                  <TableHead>Sheet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <EditableMenuItemRow
                    key={item.id}
                    item={item}
                    onSaved={() => void load()}
                    onToggleActive={toggleActive}
                    onMove={(direction) => void moveItem(item, direction)}
                  />
                ))}
              </TableBody>
            </Table>
            {visibleItems.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "No menu items yet — use New item to create your catalog." : "No items match these filters."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
