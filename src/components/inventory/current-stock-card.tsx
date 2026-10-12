"use client";

import { StatusBadge } from "@/components/state/status-badge";
import { stockStatusView } from "@/lib/status";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { filterCurrentStockRows, type CurrentStockFilter, type CurrentStockRow } from "@/lib/current-stock";
import type { StockStatus } from "@/lib/stock-status";

const FILTERS: { value: CurrentStockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "to-order", label: "To order" },
  { value: "on-order", label: "On order" },
  { value: "ok", label: "OK" },
  { value: "other", label: "No alert" },
];

const NEEDS_ORDER: StockStatus[] = ["negative", "out", "to-order"];


function quantity(value: number | null, unit: string): string {
  return value === null ? "—" : `${formatInventoryUsageQuantity(value)} ${unit}`;
}

/**
 * Current stock with the action each material needs: Order when stock is at or below its
 * alert level, and Count for a stock count. A table from small screens up, and stacked cards on phones.
 */
export function CurrentStockCard({
  rows,
  onOrder,
  onCount,
}: {
  rows: CurrentStockRow[];
  onOrder: (materialId: string) => void;
  onCount: (materialId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CurrentStockFilter>("all");
  const visible = useMemo(() => filterCurrentStockRows(rows, query, filter), [rows, query, filter]);

  const actions = (row: CurrentStockRow) => (
    <div className="flex flex-wrap gap-2">
      {NEEDS_ORDER.includes(row.status) && (
        <Button type="button" size="sm" onClick={() => onOrder(row.materialId)} aria-label={`Order ${row.name}`}>
          Order
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" onClick={() => onCount(row.materialId)} aria-label={`Count ${row.name}`}>
        Count
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current stock</CardTitle>
        <CardDescription>Balances are the sum of opening stock, manual movements, stock-count corrections, recipe consumption, and reversals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No active materials.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                aria-label="Search current stock"
                placeholder="Search material"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                {FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={filter === option.value ? "default" : "outline"}
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className="min-h-11 sm:min-h-8"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing matches. Clear the search or the filter.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block" role="region" tabIndex={0} aria-label="Current stock table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Alert at</TableHead>
                        <TableHead className="text-right">On order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((row) => (
                        <TableRow key={row.materialId}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className={`text-right tabular-nums ${row.onHand !== null && row.onHand < 0 ? "text-danger" : ""}`}>{quantity(row.onHand, row.unit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{quantity(row.alertAt, row.unit)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{row.onOrder > 0 ? quantity(row.onOrder, row.unit) : "—"}</TableCell>
                          <TableCell><StatusBadge view={stockStatusView(row.status)} /></TableCell>
                          <TableCell className="text-right">{actions(row)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ul className="space-y-2 sm:hidden">
                  {visible.map((row) => (
                    <li key={row.materialId} className="space-y-2 rounded-xl border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-medium">{row.name}</p>
                        <StatusBadge view={stockStatusView(row.status)} />
                      </div>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {quantity(row.onHand, row.unit)}
                        {row.alertAt !== null ? ` · alert ${quantity(row.alertAt, row.unit)}` : ""}
                        {row.onOrder > 0 ? ` · ${quantity(row.onOrder, row.unit)} on order` : ""}
                      </p>
                      {actions(row)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
