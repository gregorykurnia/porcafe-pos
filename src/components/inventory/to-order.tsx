"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DataTable, type Band, type Column } from "@/components/patterns/data-table";
import { StatStrip, type StatCell } from "@/components/patterns/stat-strip";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { EmptyState, LoadingSkeleton } from "@/components/patterns/states";
import type { Sort } from "@/components/sortable-head";
import { cn } from "@/lib/utils";
import { formatInventoryUsageQuantity } from "@/lib/inventory-usage";
import type { InventoryBalance } from "@/lib/inventory-ledger";
import { getInventoryReorderStatus, type InventoryReorderStatus } from "@/lib/reorder-status";
import { STOCK_STATUS_META, stockStatusFromReorder, type StockStatus } from "@/lib/stock-status";
import type { InventoryMaterial, InventorySupplier } from "@/lib/types";

// Stock → To order (inventory §3.6.2). Every active material with its reorder state. Sorted by status by default,
// so what needs ordering comes first. "Create order" hands the material to the Orders view.

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

const REORDER_ORDER: InventoryReorderStatus[] = ["to-order", "on-way", "stock-high", "not-configured", "alerts-off", "not-initialized"];

type StatusFilter = "all" | InventoryReorderStatus;
type ReorderSortKey = "material" | "stock" | "threshold" | "gap" | "quantity" | "supplier" | "status";

type ReorderRow = {
  id: string;
  material: InventoryMaterial;
  currentQuantity: number | null | undefined;
  gap: number | undefined;
  reorder: InventoryReorderStatus;
  stockStatus: StockStatus;
  supplierName: string;
};

export type ToOrderProps = {
  /** Active materials only. */
  materials: InventoryMaterial[];
  suppliers: InventorySupplier[];
  balances: InventoryBalance[];
  stockInitialized: boolean;
  stockLoading: boolean;
  openOrderMaterialIds: Set<string>;
  toOrderCount: number;
  onWayCount: number;
  scheduledCount: number;
  recentOrderCount: number;
  onCreateOrder: (materialId: string) => void;
};

function formatQuantity(value: number, unit: string) {
  return `${formatInventoryUsageQuantity(value)} ${unit}`;
}

/** The gap to the alert level, in words. */
function GapToAlert({ gap, unit }: { gap: number | undefined; unit: string }) {
  if (gap === undefined) return <span className="text-ink-muted">—</span>;
  if (gap === 0) return <span className="font-medium text-ink">At alert level</span>;
  if (gap < 0) return <span className="font-medium text-ink">{`${formatInventoryUsageQuantity(Math.abs(gap))} ${unit} below`}</span>;
  return <span className="text-ink-muted">{`${formatInventoryUsageQuantity(gap)} ${unit} above`}</span>;
}

export function ToOrder({
  materials,
  suppliers,
  balances,
  stockInitialized,
  stockLoading,
  openOrderMaterialIds,
  toOrderCount,
  onWayCount,
  scheduledCount,
  recentOrderCount,
  onCreateOrder,
}: ToOrderProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort<string>>({ key: "status", dir: "asc" });

  const balanceByMaterialId = useMemo(() => new Map(balances.map((balance) => [balance.materialId, balance])), [balances]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);

  const rows = useMemo<ReorderRow[]>(() => materials.map((material) => {
    const currentQuantity = balanceByMaterialId.get(material.id)?.currentQuantity;
    const reorder = getInventoryReorderStatus(material, currentQuantity, stockInitialized, openOrderMaterialIds.has(material.id));
    return {
      id: material.id,
      material,
      currentQuantity,
      gap: material.reorderThreshold !== undefined && currentQuantity !== null && currentQuantity !== undefined
        ? currentQuantity - material.reorderThreshold
        : undefined,
      reorder,
      stockStatus: stockStatusFromReorder(reorder),
      supplierName: material.preferredSupplierId ? supplierById.get(material.preferredSupplierId)?.name ?? "Archived supplier" : "No preferred supplier",
    };
  }), [balanceByMaterialId, materials, openOrderMaterialIds, stockInitialized, supplierById]);

  const counts = useMemo(() => {
    const nextCounts = new Map<StatusFilter, number>([["all", rows.length]]);
    for (const status of REORDER_ORDER) nextCounts.set(status, rows.filter((row) => row.reorder === status).length);
    return nextCounts;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => statusFilter === "all" || row.reorder === statusFilter);
    if (!sort) return filtered;
    const sign = sort.dir === "asc" ? 1 : -1;
    const byName = (a: ReorderRow, b: ReorderRow) => a.material.name.localeCompare(b.material.name, "id", { sensitivity: "base" });
    return [...filtered].sort((a, b) => {
      const key = sort.key as ReorderSortKey;
      let comparison = 0;
      if (key === "material") {
        comparison = byName(a, b);
      } else if (key === "supplier") {
        comparison = a.supplierName.localeCompare(b.supplierName, "id", { sensitivity: "base" });
      } else if (key === "status") {
        comparison = REORDER_ORDER.indexOf(a.reorder) - REORDER_ORDER.indexOf(b.reorder);
      } else {
        const pick = (row: ReorderRow): number | null | undefined => {
          if (key === "stock") return row.currentQuantity;
          if (key === "threshold") return row.material.reorderThreshold;
          if (key === "quantity") return row.material.reorderQuantity;
          return row.gap;
        };
        const left = pick(a);
        const right = pick(b);
        if (left === null || left === undefined) return right === null || right === undefined ? byName(a, b) : 1;
        if (right === null || right === undefined) return -1;
        comparison = left - right;
      }
      return comparison === 0 ? byName(a, b) : comparison * sign;
    });
  }, [rows, sort, statusFilter]);

  function toggleSort(key: string) {
    setSort((current) => ({ key, dir: current?.key === key && current.dir === "asc" ? "desc" : "asc" }));
  }

  const cells: StatCell[] = [
    {
      label: "Items to order",
      value: (
        <span className="inline-flex items-center gap-2">
          {toOrderCount > 0 ? <ToneShape tone="warn" className="text-warn-mark" /> : null}
          {toOrderCount}
        </span>
      ),
    },
    { label: "Orders on the way", value: onWayCount },
    { label: "Scheduled stock-ins", value: scheduledCount, note: "Active schedules" },
    { label: "Orders in the last 7 days", value: recentOrderCount },
  ];

  const columns: Column<ReorderRow>[] = [
    {
      key: "material",
      label: "Material",
      sortKey: "material",
      cell: (row) => (
        <>
          <span className="font-medium">{row.material.name}</span>
          <span className="ml-1.5 text-small text-ink-muted">{row.material.baseUnit}</span>
        </>
      ),
      phone: "title",
      cellClassName: "whitespace-normal",
    },
    {
      key: "stock",
      label: "Current stock",
      sortKey: "stock",
      align: "right",
      headClassName: "whitespace-normal",
      cell: (row) => (row.currentQuantity === null || row.currentQuantity === undefined ? "—" : formatQuantity(row.currentQuantity, row.material.baseUnit)),
      phone: "figure",
    },
    {
      key: "threshold",
      label: "Alert level",
      sortKey: "threshold",
      align: "right",
      headClassName: "whitespace-normal",
      cell: (row) => (
        <span className="text-ink-muted">
          {row.material.reorderThreshold === undefined ? "—" : <><span className="desk:hidden">Alert </span>{formatQuantity(row.material.reorderThreshold, row.material.baseUnit)}</>}
        </span>
      ),
      phone: "meta",
    },
    {
      key: "gap",
      label: "Gap to alert",
      sortKey: "gap",
      headClassName: "whitespace-normal",
      cell: (row) => (row.material.reorderThreshold === undefined
        ? <span className="text-ink-muted">No alert level</span>
        : <GapToAlert gap={row.gap} unit={row.material.baseUnit} />),
      phone: "meta",
    },
    {
      key: "quantity",
      label: "Order quantity",
      sortKey: "quantity",
      align: "right",
      headClassName: "whitespace-normal",
      cell: (row) => {
        const quantity = row.material.reorderQuantity;
        if (Number.isFinite(quantity) && quantity! > 0) {
          return (
            <>
              <span className="desk:hidden">Order </span>
              {formatQuantity(quantity!, row.material.baseUnit)}
            </>
          );
        }
        if (row.reorder !== "to-order") return <span className="text-ink-muted">—</span>;
        // The reason sits on a band row under the material, so this column stays narrow.
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-warn">
            <ToneShape tone="warn" className="text-warn-mark" />
            Not set
          </span>
        );
      },
      phone: "detail",
    },
    {
      key: "supplier",
      label: "Preferred supplier",
      sortKey: "supplier",
      headClassName: "whitespace-normal",
      cell: (row) => (
        <span className={cn("block whitespace-normal leading-5", row.supplierName === "No preferred supplier" && "text-ink-muted")}>
          <span className="desk:hidden">Supplier: </span>
          {row.supplierName}
        </span>
      ),
      phone: "detail",
    },
    {
      key: "status",
      label: "Status",
      sortKey: "status",
      cell: (row) => <StatusChip tone={STATUS_TONE[row.stockStatus]}>{STOCK_STATUS_META[row.stockStatus].label}</StatusChip>,
      phone: "detail",
    },
  ];

  // A to-order material with no valid order quantity gets a band row under it, with the reason in the inventory's words.
  const tableRows: (ReorderRow | Band)[] = visibleRows.flatMap((row): (ReorderRow | Band)[] => {
    const quantity = row.material.reorderQuantity;
    const quantityMissing = !(Number.isFinite(quantity) && quantity! > 0);
    return row.reorder === "to-order" && quantityMissing
      ? [row, { band: `${row.material.name}: set a valid order quantity to enable push alerts.` }]
      : [row];
  });

  const filterOptions = [
    { value: "all" as StatusFilter, label: `All ${counts.get("all") ?? 0}` },
    ...REORDER_ORDER.map((status) => ({
      value: status as StatusFilter,
      label: `${STOCK_STATUS_META[stockStatusFromReorder(status)].label} ${counts.get(status) ?? 0}`,
    })),
  ];

  return (
    <section className="space-y-5">
      <StatStrip label="To order figures" cells={cells} />

      <Card id="reorder-overview" className="scroll-mt-6 gap-0 py-0 shadow-card">
        <div className="space-y-4 px-4 pt-4 tablet:px-6 tablet:pt-6">
          <div className="min-w-0">
            <h2 className="font-display text-title-2 text-ink">Reorder overview</h2>
            <p className="mt-1 text-small text-ink-muted">Filter materials by stock status, then sort the list to see what needs attention.</p>
          </div>
          {stockLoading ? (
            <LoadingSkeleton rows={4} label="Loading current stock and reorder statuses…" />
          ) : materials.length > 0 ? (
            <SegmentedControl
              label="Filter by status"
              value={statusFilter}
              className="max-w-full flex-nowrap overflow-x-auto [&>button]:whitespace-nowrap"
              options={filterOptions}
              onChange={setStatusFilter}
            />
          ) : null}
        </div>

        {stockLoading ? null : (
          <div className="mt-4 border-t border-line">
            <DataTable
              caption="Materials to order"
              columns={columns}
              rows={tableRows}
              getKey={(row) => row.id}
              density="compact"
              sort={sort}
              onSort={toggleSort}
              rowActions={(row) => row.reorder === "to-order" ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => onCreateOrder(row.material.id)} aria-label={`Create supplier order for ${row.material.name}`}>
                  <Plus />Create order
                </Button>
              ) : null}
              listBelow="desk"
              actionsBelow
              empty={materials.length === 0
                ? <EmptyState title="No active materials yet.">Add materials in Setup → Materials, and they appear here.</EmptyState>
                : <EmptyState title="No materials match this status.">Choose All to see every material.</EmptyState>}
            />
          </div>
        )}
      </Card>
    </section>
  );
}
