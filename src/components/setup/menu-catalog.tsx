"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { MENU_GRID, MenuItemRow } from "@/components/setup/menu-item-row";
import { EmptyState, LoadingSkeleton } from "@/components/patterns/states";
import { FieldRow } from "@/components/fields/field-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cmp, toggleSort, type Sort } from "@/components/sortable-head";
import { listMenuItems, upsertMenuItem } from "@/lib/data";
import { ITEM_CATEGORIES, moveWithinCategory, sortForSheet } from "@/lib/menu-sheet";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";

type CatalogStatus = "active" | "archived" | "all";
type CatalogSortKey = "name" | "category" | "price";
type SheetPosition = { position: number; count: number };

const SORT_OPTIONS: { value: string; label: string; sort: Sort<CatalogSortKey> }[] = [
  { value: "sheet", label: "Sheet order", sort: null },
  { value: "name:asc", label: "Name, A to Z", sort: { key: "name", dir: "asc" } },
  { value: "name:desc", label: "Name, Z to A", sort: { key: "name", dir: "desc" } },
  { value: "category:asc", label: "Category, A to Z", sort: { key: "category", dir: "asc" } },
  { value: "category:desc", label: "Category, Z to A", sort: { key: "category", dir: "desc" } },
  { value: "price:asc", label: "Price, low to high", sort: { key: "price", dir: "asc" } },
  { value: "price:desc", label: "Price, high to low", sort: { key: "price", dir: "desc" } },
];

function sortValue(sort: Sort<CatalogSortKey>): string {
  return sort ? `${sort.key}:${sort.dir}` : "sheet";
}

/** The menu: the items available in daily entry and scanning. Lives in Setup → Menu. */
export function MenuCatalog() {
  const confirm = useConfirm();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<CatalogStatus>("active");
  const [sort, setSort] = useState<Sort<CatalogSortKey>>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const activeCount = useMemo(() => items.filter((item) => item.active !== false).length, [items]);
  const missingPriceCount = useMemo(() => items.filter((item) => item.active !== false && item.price === null).length, [items]);

  // Each item's place in its category on the sheet. Archived items count, as they do when moving.
  const positions = useMemo(() => {
    const map = new Map<string, SheetPosition>();
    for (const c of categories) {
      const inCategory = sortForSheet(items.filter((item) => item.category === c));
      inCategory.forEach((item, index) => map.set(item.id, { position: index + 1, count: inCategory.length }));
    }
    return map;
  }, [categories, items]);

  // Without a sort, rows stay in sheet order and are grouped by category. A sort gives a flat list.
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

    if (!sort) return sortForSheet(filtered);
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
      setSheetOpen(false);
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

  const saveBlocker = newName.trim() ? "" : "Enter a name to add the item.";

  return (
    <>
      <MenuCatalogView
        items={items}
        visibleItems={visibleItems}
        positions={positions}
        loading={loading}
        activeCount={activeCount}
        missingPriceCount={missingPriceCount}
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        categories={categories}
        status={status}
        onStatusChange={setStatus}
        sort={sort}
        onSortChange={(key) => toggleSort(sort, key, setSort)}
        onSortSet={setSort}
        onNew={() => setSheetOpen(true)}
        onSaved={() => void load()}
        onToggleActive={toggleActive}
        onMove={(item, direction) => void moveItem(item, direction)}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New menu item</SheetTitle>
            <SheetDescription>Price is optional. An item with no price shows Missing price until one is added.</SheetDescription>
          </SheetHeader>
          <FieldRow label="Name">
            {(id) => <Input id={id} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Iced Latte" />}
          </FieldRow>
          <FieldRow label="Category">
            {(id) => (
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger id={id} className="w-full">
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
            )}
          </FieldRow>
          <FieldRow label="Price (Rp, optional)">
            {(id) => (
              <Input id={id} type="number" inputMode="decimal" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="0" className="text-right" />
            )}
          </FieldRow>
          <SheetFooter>
            <p className="mr-auto self-center text-small text-ink-muted" aria-live="polite">{saveBlocker}</p>
            <Button onClick={() => void addItem()}>
              Add item
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: CatalogSortKey;
  sort: Sort<CatalogSortKey>;
  onSort: (key: CatalogSortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label.toLowerCase()}, ${dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "not sorted"}`}
      className={cn(
        "inline-flex items-center gap-1 text-small text-ink-muted hover:text-ink [@media(pointer:coarse)]:min-h-11",
        active && "text-ink",
        className
      )}
    >
      {label}
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

/** The menu's presentation: a count line, filters, and the list in category bands (a table on desk). */
export function MenuCatalogView({
  items,
  visibleItems,
  positions,
  loading,
  activeCount,
  missingPriceCount,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  categories,
  status,
  onStatusChange,
  sort,
  onSortChange,
  onSortSet,
  onNew,
  onSaved,
  onToggleActive,
  onMove,
}: {
  items: MenuItem[];
  visibleItems: MenuItem[];
  positions: Map<string, SheetPosition>;
  loading: boolean;
  activeCount: number;
  missingPriceCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  status: CatalogStatus;
  onStatusChange: (value: CatalogStatus) => void;
  sort: Sort<CatalogSortKey>;
  onSortChange: (key: CatalogSortKey) => void;
  onSortSet: (sort: Sort<CatalogSortKey>) => void;
  onNew: () => void;
  onSaved: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  onMove: (item: MenuItem, direction: -1 | 1) => void;
}) {
  const categoryOptions = [{ value: "all", label: "All" }, ...categories.map((c) => ({ value: c, label: c }))];
  const statusOptions: { value: CatalogStatus; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
    { value: "all", label: "All" },
  ];

  // Sheet order groups rows under a band per category. A sort shows one flat list.
  const rows: Array<{ band: string } | MenuItem> = [];
  if (sort) {
    rows.push(...visibleItems);
  } else {
    for (const c of categories) {
      const inCategory = visibleItems.filter((item) => item.category === c);
      if (inCategory.length === 0) continue;
      rows.push({ band: c });
      rows.push(...inCategory);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink">
          <b className="font-semibold">{activeCount} active item{activeCount === 1 ? "" : "s"}</b>
          {missingPriceCount > 0 && (
            <>
              <span className="text-ink-muted"> · </span>
              <span className="font-semibold text-warn">
                {missingPriceCount} missing price{missingPriceCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </p>
        <Button onClick={onNew}>
          <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
          New item
        </Button>
      </div>

      <div className="flex flex-col gap-3 desk:flex-row desk:flex-wrap desk:items-center desk:justify-between">
        <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap tablet:items-center">
          <Input aria-label="Search menu items" placeholder="Item or category" value={query} onChange={(event) => onQueryChange(event.target.value)} className="tablet:w-64" />
          <SegmentedControl label="Filter by category" value={category} options={categoryOptions} onChange={onCategoryChange} />
          <SegmentedControl label="Filter by status" value={status} options={statusOptions} onChange={onStatusChange} />
        </div>
        <Select value={sortValue(sort)} onValueChange={(value) => onSortSet(SORT_OPTIONS.find((option) => option.value === value)?.sort ?? null)}>
          <SelectTrigger aria-label="Sort menu items" className="w-full desk:hidden tablet:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className={cn(MENU_GRID, "hidden border-b border-line px-4 py-2 desk:grid")}>
          <span className="text-small text-ink-muted">Sheet order</span>
          <SortHead label="Name" sortKey="name" sort={sort} onSort={onSortChange} />
          <SortHead label="Category" sortKey="category" sort={sort} onSort={onSortChange} />
          <SortHead label="Price · Rp" sortKey="price" sort={sort} onSort={onSortChange} className="justify-self-end" />
          <span className="text-small text-ink-muted">Sheet names</span>
          <span className="text-small text-ink-muted">Status</span>
          <span className="sr-only">Actions</span>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} label="Loading menu catalog…" />
        ) : visibleItems.length === 0 ? (
          <div className="p-6">
            <EmptyState title={items.length === 0 ? "No menu items yet" : "No items match these filters"}>
              {items.length === 0 ? "Use New item to create your catalog." : "Clear the search or change a filter to see more items."}
            </EmptyState>
          </div>
        ) : (
          <ul aria-label="Menu catalog" className="divide-y divide-line">
            {rows.map((row) =>
              "band" in row ? (
                <li key={`band-${row.band}`} className="bg-canvas px-4 py-2 text-small font-semibold text-ink">
                  {row.band} <span className="font-normal text-ink-muted">· {visibleItems.filter((item) => item.category === row.band).length} items · sheet order</span>
                </li>
              ) : (
                <MenuItemRow
                  key={row.id}
                  item={row}
                  position={positions.get(row.id)?.position ?? 1}
                  count={positions.get(row.id)?.count ?? 1}
                  onSaved={onSaved}
                  onToggleActive={onToggleActive}
                  onMove={(direction) => onMove(row, direction)}
                />
              )
            )}
          </ul>
        )}
      </div>

      <p className="text-small text-ink-muted">
        Changes save when you leave a field. Sheet names are the other spellings used on the paper sheet; scanning matches them.
      </p>
    </div>
  );
}
