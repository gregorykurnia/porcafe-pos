"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ScanRow } from "@/lib/scan-review";
import type { MenuItem } from "@/lib/types";

type ScanReviewTableProps = {
  rows: ScanRow[];
  menuItems: MenuItem[];
  unmatchedIds: ReadonlySet<string>;
  invalidIds: ReadonlySet<string>;
  onChange: (id: string, patch: Partial<Pick<ScanRow, "menuItemId" | "qty">>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
};

/**
 * One card per sheet row, built for phones: the sheet's own text sits above the
 * matched menu item and the quantity. Rows that still need a match are highlighted.
 */
export function ScanReviewTable({ rows, menuItems, unmatchedIds, invalidIds, onChange, onRemove, onAdd }: ScanReviewTableProps) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No items detected. Add them by hand.</p>}
      {rows.map((row) => {
        const needsMatch = unmatchedIds.has(row.id);
        const invalid = invalidIds.has(row.id);
        return (
          <div
            key={row.id}
            className={`space-y-2 rounded-lg border p-3 ${needsMatch ? "border-warning/40 bg-warning/5" : "border-border bg-surface"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {row.rawName ? `Sheet: ${row.rawName}` : "Added by hand"}
              </p>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${row.rawName || "this row"}`} onClick={() => onRemove(row.id)}>
                <X className="size-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={row.menuItemId} onValueChange={(value) => onChange(row.id, { menuItemId: value })}>
                <SelectTrigger className="min-w-0 flex-1" aria-label={`Menu item for ${row.rawName || "this row"}`}>
                  <SelectValue placeholder="Choose the menu item" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={`Quantity for ${row.rawName || "this row"}`}
                inputMode="numeric"
                autoComplete="off"
                value={row.qty}
                onChange={(event) => onChange(row.id, { qty: event.target.value })}
                className="h-11 w-20 text-right tabular-nums sm:h-9"
              />
            </div>
            {needsMatch && <p className="text-xs text-warning">Choose the menu item for this row.</p>}
            {invalid && <p className="text-xs text-destructive">Use a whole number.</p>}
          </div>
        );
      })}
      <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
        + Add item
      </Button>
    </div>
  );
}
