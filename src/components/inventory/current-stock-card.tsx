"use client";

import { useMemo, useState } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusChip, type StatusTone } from "@/components/patterns/status-chip";
import { EmptyState } from "@/components/patterns/states";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import { filterCurrentStockRows, type CurrentStockFilter, type CurrentStockRow } from "@/lib/current-stock";
import { STOCK_STATUS_META, type StockStatus } from "@/lib/stock-status";

const FILTERS: { value: CurrentStockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "to-order", label: "To order" },
  { value: "on-order", label: "On order" },
  { value: "ok", label: "OK" },
  { value: "other", label: "No alert" },
];

const NEEDS_ORDER: StockStatus[] = ["negative", "out", "to-order"];

// Stock status to a Canopy tone (DESIGN_SYSTEM §6). Negative is the one solid chip.
const STATUS_TONE: Record<StockStatus, StatusTone> = {
  negative: "solid",
  out: "danger",
  "to-order": "warn",
  "on-order": "info",
  ok: "ok",
  "no-alert-level": "neutral",
  "alerts-off": "neutral",
  "not-initialized": "neutral",
};

function quantity(value: number | null, unit: string): string {
  return value === null ? "—" : `${formatInventoryUsageQuantity(value)} ${unit}`;
}

/**
 * Current stock (inventory §3.6.1). A compact table with search and a status filter. Order appears on the rows
 * that need ordering; Record count is in each row's ⋯ menu.
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

  const columns: Column<CurrentStockRow>[] = [
    {
      key: "material",
      label: "Material",
      cell: (row) => <span className="font-medium">{row.name}</span>,
      phone: "title",
    },
    {
      key: "onHand",
      label: "On hand",
      align: "right",
      cell: (row) => (
        <span className={row.onHand !== null && row.onHand < 0 ? "font-semibold text-danger" : undefined}>
          {quantity(row.onHand, row.unit)}
        </span>
      ),
      phone: "figure",
    },
    {
      key: "alertAt",
      label: "Alert level",
      align: "right",
      cell: (row) => (
        <span className="text-ink-muted">
          <span className="tablet:hidden">Alert </span>
          {quantity(row.alertAt, row.unit)}
        </span>
      ),
      phone: "meta",
    },
    {
      key: "onOrder",
      label: "On order",
      align: "right",
      cell: (row) => (
        <span className="text-ink-muted">
          {row.onOrder > 0 ? (
            <>
              <span className="tablet:hidden">On order </span>
              {quantity(row.onOrder, row.unit)}
            </>
          ) : (
            "—"
          )}
        </span>
      ),
      phone: "meta",
    },
    {
      key: "status",
      label: "Status",
      cell: (row) => <StatusChip tone={STATUS_TONE[row.status]}>{STOCK_STATUS_META[row.status].label}</StatusChip>,
      phone: "meta",
    },
  ];

  if (rows.length === 0) {
    return (
      <Card className="gap-0 py-0 shadow-card">
        <div className="px-4 pt-4 tablet:px-6 tablet:pt-6">
          <h2 className="font-display text-title-2 text-ink">Current stock</h2>
        </div>
        <EmptyState title="No active materials.">Add materials in Setup → Materials and their stock appears here.</EmptyState>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-card">
      <div className="space-y-4 px-4 pt-4 tablet:px-6 tablet:pt-6">
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-title-2 text-ink">Current stock</h2>
            <p className="mt-1 text-small text-ink-muted">
              Balances are the sum of opening stock, manual movements, stock-count corrections, recipe consumption, and reversals.
            </p>
          </div>
          <Input
            aria-label="Search current stock"
            placeholder="Search material"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full tablet:w-64"
          />
        </div>
        <SegmentedControl
          label="Filter by status"
          value={filter}
          className="max-w-full flex-nowrap overflow-x-auto [&>button]:whitespace-nowrap"
          options={FILTERS.map((option) => ({
            value: option.value,
            label: `${option.label} ${rows.length > 0 ? filterCurrentStockRows(rows, "", option.value).length : 0}`,
          }))}
          onChange={setFilter}
        />
      </div>

      <div className="mt-4 border-t border-line">
        <DataTable
          caption="Current stock"
          columns={columns}
          rows={visible}
          getKey={(row) => row.materialId}
          density="compact"
          rowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              {NEEDS_ORDER.includes(row.status) && (
                <Button type="button" size="sm" variant="secondary" onClick={() => onOrder(row.materialId)} aria-label={`Order ${row.name}`}>
                  Order
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${row.name}`}>
                    <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onCount(row.materialId)}>Record count</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          empty={<EmptyState title="Nothing matches.">Clear the search or the filter.</EmptyState>}
        />
      </div>
    </Card>
  );
}
