"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SortableHead, type Sort } from "@/components/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * A column. `phone` says where it goes in the two-line list on phone: `title` (left, line 1), `figure` (right,
 * line 1) or `meta` (line 2). `hidden` leaves it out on phone.
 */
export type Column<R> = {
  key: string;
  label: string;
  align?: "left" | "right";
  cell: (row: R) => ReactNode;
  /** Set when the column can be sorted. The sort key is passed back to onSort. */
  sortKey?: string;
  phone?: "title" | "figure" | "meta" | "hidden";
};

/** A band row (date bands in History, categories in Menu) groups the rows under it. */
export type Band = { band: string };

export type DataTableProps<R> = {
  caption: string;
  columns: Column<R>[];
  rows: (R | Band)[];
  getKey: (row: R) => string;
  /** Compact is 40 px on desk. Touch devices always get comfortable (56 px). */
  density?: "compact" | "comfortable";
  sort?: Sort<string>;
  onSort?: (key: string) => void;
  /** The ⋯ menu for a row, usually a DropdownMenu. Keep at most one text action per row. */
  rowActions?: (row: R) => ReactNode;
  selectedKey?: string;
  empty?: ReactNode;
};

function isBand<R>(row: R | Band): row is Band {
  return typeof row === "object" && row !== null && "band" in row && !("id" in row);
}

/**
 * Desk and tablet get a table (sticky header, sortable heads, hairline rows). Phone gets the same rows as two-line
 * list rows (DESIGN_SYSTEM §8).
 */
export function DataTable<R>({
  caption,
  columns,
  rows,
  getKey,
  density = "compact",
  sort,
  onSort,
  rowActions,
  selectedKey,
  empty,
}: DataTableProps<R>) {
  const rowHeight = density === "compact" ? "h-10 [@media(pointer:coarse)]:h-14" : "h-14";
  const phoneColumns = {
    title: columns.filter((c) => c.phone === "title"),
    figure: columns.filter((c) => c.phone === "figure"),
    meta: columns.filter((c) => c.phone === "meta"),
  };

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div>
      <div className="hidden overflow-x-auto tablet:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow className="border-line hover:bg-transparent">
              {columns.map((column) =>
                column.sortKey && onSort && sort !== undefined ? (
                  <SortableHead
                    key={column.key}
                    label={column.label}
                    sortKey={column.sortKey}
                    sort={sort}
                    onSort={onSort}
                    className={cn("text-small text-ink-muted", column.align === "right" && "text-right")}
                  />
                ) : (
                  <TableHead key={column.key} className={cn("text-small text-ink-muted", column.align === "right" && "text-right")}>
                    {column.label}
                  </TableHead>
                )
              )}
              {rowActions ? <TableHead className="w-10" aria-label="Actions" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) =>
              isBand(row) ? (
                <TableRow key={`band-${index}`} className="border-line bg-canvas hover:bg-canvas">
                  <TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="py-2 text-small font-semibold text-ink">
                    {row.band}
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow
                  key={getKey(row)}
                  data-state={selectedKey === getKey(row) ? "selected" : undefined}
                  className={cn("border-line hover:bg-canvas data-[state=selected]:bg-brand-soft", rowHeight)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn("text-table text-ink", column.align === "right" && "text-right tabular-nums")}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions ? <TableCell className="w-10 text-right">{rowActions(row)}</TableCell> : null}
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-line tablet:hidden" aria-label={caption}>
        {rows.map((row, index) =>
          isBand(row) ? (
            <li key={`band-${index}`} className="bg-canvas px-4 py-2 text-small font-semibold text-ink">
              {row.band}
            </li>
          ) : (
            <li key={getKey(row)} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate text-body font-medium text-ink">{phoneColumns.title.map((c) => <span key={c.key}>{c.cell(row)}</span>)}</div>
                  <div className="shrink-0 text-body tabular-nums text-ink">{phoneColumns.figure.map((c) => <span key={c.key}>{c.cell(row)}</span>)}</div>
                </div>
                {phoneColumns.meta.length > 0 ? (
                  <div className="mt-0.5 truncate text-small text-ink-muted">{phoneColumns.meta.map((c, i) => <span key={c.key}>{i > 0 ? " · " : null}{c.cell(row)}</span>)}</div>
                ) : null}
              </div>
              {rowActions ? <div className="shrink-0">{rowActions(row)}</div> : null}
            </li>
          )
        )}
      </ul>
    </div>
  );
}
