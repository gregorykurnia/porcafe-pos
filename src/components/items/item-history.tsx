"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, toggleSort, type Sort } from "@/components/sortable-head";
import { EmptyState, LoadingSkeleton } from "@/components/patterns/states";
import { EditableItemSaleRow } from "@/components/items/editable-item-sale-row";
import type { MenuItem, ItemSale } from "@/lib/types";
import { todayISO, formatDisplay, formatDayDisplay } from "@/lib/dates";

type Period = "day" | "week" | "month";
type SaleSortKey = "date" | "item" | "category" | "qty";

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
  saleSort: Sort<SaleSortKey>;
  setHistoryCategory: Dispatch<SetStateAction<string>>;
  setHistoryFrom: Dispatch<SetStateAction<string>>;
  setHistoryQuery: Dispatch<SetStateAction<string>>;
  setHistoryTo: Dispatch<SetStateAction<string>>;
  setRecentCursor: Dispatch<SetStateAction<string>>;
  setRecentFilter: Dispatch<SetStateAction<Period | "all">>;
  setSaleSort: Dispatch<SetStateAction<Sort<SaleSortKey>>>;
  sortedRecentSales: ItemSale[];
};

type HistoryRow = { kind: "band"; date: string; portions: number } | { kind: "sale"; sale: ItemSale };

/** Groups rows under a date band. Used when the list is in date order, which is the default. */
function groupByDate(sales: ItemSale[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let band: Extract<HistoryRow, { kind: "band" }> | null = null;
  for (const sale of sales) {
    if (!band || band.date !== sale.date) {
      band = { kind: "band", date: sale.date, portions: 0 };
      rows.push(band);
    }
    band.portions += sale.qty;
    rows.push({ kind: "sale", sale });
  }
  return rows;
}

function portionsLabel(count: number): string {
  return `${count} ${count === 1 ? "portion" : "portions"}`;
}

/**
 * The History tab: recorded item sales with a period, search and filters. Desk and tablet get a compact table with
 * date bands; phone gets two-line list rows. Daily close entries are read-only. Legacy rows edit in place.
 */
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
  // Bands only make sense in date order (the default, and the Date sort). Other sorts show a flat list.
  const grouped = !saleSort || saleSort.key === "date";
  const rows = useMemo<HistoryRow[]>(
    () => (grouped ? groupByDate(sortedRecentSales) : sortedRecentSales.map((sale) => ({ kind: "sale" as const, sale }))),
    [grouped, sortedRecentSales]
  );
  const sortHandler = (key: SaleSortKey) => toggleSort(saleSort, key, setSaleSort);
  const count = sortedRecentSales.length;

  return (
    <div id="items-panel-history" className="space-y-5">
      <p className="text-small text-ink-muted">
        {legacyEditable
          ? "Legacy rows can be edited until their dates are copied into Daily close. Daily close records are read-only here."
          : "Read-only. To change a day, open it in Daily close."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
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
        {recentFilter !== "all" && (
          <>
            <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface p-1">
              <Button variant="ghost" size="icon-sm" onClick={() => navigateRecent(-1)} aria-label="Previous history period">
                <ChevronLeft strokeWidth={1.5} />
              </Button>
              <p className="min-w-0 px-2 text-center font-display text-title-3 text-ink" aria-live="polite">
                {recentFilterLabel}
              </p>
              <Button variant="ghost" size="icon-sm" onClick={() => navigateRecent(1)} aria-label="Next history period">
                <ChevronRight strokeWidth={1.5} />
              </Button>
            </div>
            <Button variant="ghost" size="sm" disabled={recentCursor === todayISO()} onClick={() => setRecentCursor(todayISO())}>
              Today
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-2 desk:grid-cols-[minmax(0,1fr)_14rem_11rem_11rem]">
        <div className="col-span-2 min-w-0 space-y-1.5 tablet:col-span-1">
          <Label htmlFor="history-search" className="text-small font-medium text-ink-muted">
            Search
          </Label>
          <Input
            id="history-search"
            aria-label="Search item history"
            placeholder="Search item or category…"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
        </div>
        <div className="col-span-2 min-w-0 space-y-1.5 tablet:col-span-1">
          <Label htmlFor="history-category" className="text-small font-medium text-ink-muted">
            Category
          </Label>
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
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="history-from" className="text-small font-medium text-ink-muted">
            From
          </Label>
          <Input
            id="history-from"
            aria-label={`History start date${historyFrom ? `: ${formatDisplay(historyFrom)}` : ""}`}
            type="date"
            value={historyFrom}
            onChange={(event) => setHistoryFrom(event.target.value)}
          />
          {historyFrom && <p className="text-small text-ink-muted">{formatDayDisplay(historyFrom)}</p>}
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="history-to" className="text-small font-medium text-ink-muted">
            To
          </Label>
          <Input
            id="history-to"
            aria-label={`History end date${historyTo ? `: ${formatDisplay(historyTo)}` : ""}`}
            type="date"
            value={historyTo}
            onChange={(event) => setHistoryTo(event.target.value)}
          />
          {historyTo && <p className="text-small text-ink-muted">{formatDayDisplay(historyTo)}</p>}
        </div>
      </div>

      <Card className="gap-0 py-0 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 tablet:px-6">
          <p className="text-table text-ink">
            {count} {count === 1 ? "entry" : "entries"}
            {historyHasFilters ? " match the current filters" : " shown"}
          </p>
          <div className="flex items-center gap-1">
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
            <Button variant="ghost" size="sm" onClick={exportHistoryCSV} disabled={count === 0}>
              <Download strokeWidth={1.5} /> Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4 tablet:p-6">
            <p className="text-small text-ink-muted" aria-hidden="true">
              Loading item history…
            </p>
            <LoadingSkeleton rows={4} label="Loading item history…" />
          </div>
        ) : count === 0 ? (
          <EmptyState
            title={recentFilter === "all" ? "No item sales yet" : "No item sales in this period"}
            action={
              historyHasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryCategory("all");
                    setHistoryFrom("");
                    setHistoryTo("");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {historyHasFilters
              ? "Nothing matches the current filters. Clear them to see every sale."
              : recentFilter === "all"
                ? "Sales appear here once a day is closed in Daily close."
                : "Step to another period to see its sales."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden tablet:block" role="region" aria-label="Item sales history">
              <Table className="[&_td]:px-1.5 [&_th]:px-1.5 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
                <caption className="sr-only">Item sales history</caption>
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <SortableHead label="Date" sortKey="date" sort={saleSort} onSort={sortHandler} className="text-small text-ink-muted" />
                    <SortableHead label="Item" sortKey="item" sort={saleSort} onSort={sortHandler} className="text-small text-ink-muted" />
                    <SortableHead label="Category" sortKey="category" sort={saleSort} onSort={sortHandler} className="text-small text-ink-muted" />
                    <SortableHead label="Qty" sortKey="qty" sort={saleSort} onSort={sortHandler} className="text-small text-ink-muted text-right" />
                    <TableHead className="text-small text-ink-muted">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) =>
                    row.kind === "band" ? (
                      <TableRow key={`band-${row.date}`} className="border-line bg-canvas hover:bg-canvas">
                        <TableCell colSpan={5} className="py-2 text-small font-semibold text-ink">
                          {formatDisplay(row.date)} <span className="font-normal text-ink-muted">· {portionsLabel(row.portions)}</span>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <EditableItemSaleRow
                        key={row.sale.id}
                        variant="table"
                        sale={row.sale}
                        category={categoryByItemId.get(row.sale.itemId) ?? row.sale.category}
                        menuItems={menuItems}
                        onSaved={refresh}
                        onDelete={removeSale}
                        readOnly={row.sale.id.startsWith("daily-") || !legacyEditable}
                      />
                    )
                  )}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-line tablet:hidden" aria-label="Item sales history">
              {rows.map((row) =>
                row.kind === "band" ? (
                  <li key={`band-${row.date}`} className="bg-canvas px-4 py-2 text-small font-semibold text-ink">
                    {formatDisplay(row.date)} <span className="font-normal text-ink-muted">· {portionsLabel(row.portions)}</span>
                  </li>
                ) : (
                  <EditableItemSaleRow
                    key={row.sale.id}
                    variant="list"
                    sale={row.sale}
                    category={categoryByItemId.get(row.sale.itemId) ?? row.sale.category}
                    menuItems={menuItems}
                    onSaved={refresh}
                    onDelete={removeSale}
                    readOnly={row.sale.id.startsWith("daily-") || !legacyEditable}
                  />
                )
              )}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
