"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EditableItemSaleRow } from "@/components/items/editable-item-sale-row";
import { SortableHead, toggleSort, type Sort } from "@/components/sortable-head";
import type { MenuItem, ItemSale } from "@/lib/types";
import { todayISO, formatDisplay, formatDayDisplay } from "@/lib/dates";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

type Period = "day" | "week" | "month";

export type ItemHistoryProps = {
  categoryByItemId: Map<string, string>;
  exportHistoryCSV: () => void;
  historyCategories: string[];
  historyCategory: string;
  historyFrom: string;
  historyHasFilters: boolean;
  historyQuery: string;
  historyTo: string;
  legacyEditable: boolean;
  loading: boolean;
  menuItems: MenuItem[];
  navigateRecent: (dir: 1 | -1) => void;
  recentCursor: string;
  recentFilter: Period | "all";
  recentFilterLabel: string | null;
  recentFilteredSales: ItemSale[];
  refresh: () => void;
  removeSale: (id: string) => Promise<void>;
  saleSort: Sort<"date" | "item" | "category" | "qty">;
  setHistoryCategory: Dispatch<SetStateAction<string>>;
  setHistoryFrom: Dispatch<SetStateAction<string>>;
  setHistoryQuery: Dispatch<SetStateAction<string>>;
  setHistoryTo: Dispatch<SetStateAction<string>>;
  setRecentCursor: Dispatch<SetStateAction<string>>;
  setRecentFilter: Dispatch<SetStateAction<Period | "all">>;
  setSaleSort: Dispatch<SetStateAction<Sort<"date" | "item" | "category" | "qty">>>;
  sortedRecentSales: ItemSale[];
};

/** The History tab: recorded item sales with period and category filters. Loaded when the tab opens. */
export function ItemHistory({
  categoryByItemId,
  exportHistoryCSV,
  historyCategories,
  historyCategory,
  historyFrom,
  historyHasFilters,
  historyQuery,
  historyTo,
  legacyEditable,
  loading,
  menuItems,
  navigateRecent,
  recentCursor,
  recentFilter,
  recentFilterLabel,
  recentFilteredSales,
  refresh,
  removeSale,
  saleSort,
  setHistoryCategory,
  setHistoryFrom,
  setHistoryQuery,
  setHistoryTo,
  setRecentCursor,
  setRecentFilter,
  setSaleSort,
  sortedRecentSales,
}: ItemHistoryProps) {
  return (
      /* Recent item sales */
      <Card id="items-panel-history" role="tabpanel" aria-labelledby="items-tab-history" tabIndex={0}>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>History</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{legacyEditable ? "Legacy rows can be edited until their dates are copied into Daily close. Daily close records are read-only here." : "Read-only. To change a day, open it in Daily close."}</p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              label="History period"
              value={recentFilter}
              options={[
                { value: "all", label: "All" },
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
              onChange={(value) => {
                setRecentFilter(value);
                setRecentCursor(todayISO());
              }}
            />
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
                  <TableHead>Source</TableHead>
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
                    readOnly={s.id.startsWith("daily-") || !legacyEditable}
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
  );
}
