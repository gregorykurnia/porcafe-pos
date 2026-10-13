"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToneShape } from "@/components/patterns/status-chip";
import { cn } from "@/lib/utils";
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
 * The sheet's items as hairline rows (DESIGN_SYSTEM §9). Each row shows the text as written on the sheet, the matched
 * menu item and the quantity. On tablet and desk the row is one line; on phone the sheet text sits above the match.
 * A row that still needs a match is tinted and says so in words.
 */
export function ScanReviewTable({ rows, menuItems, unmatchedIds, invalidIds, onChange, onRemove, onAdd }: ScanReviewTableProps) {
  return (
    <div>
      {rows.length === 0 && (
        <p className="py-6 text-center text-body text-ink-muted">No items detected. Add them by hand.</p>
      )}
      {rows.length > 0 && (
        <ul className="-mx-4 divide-y divide-line tablet:-mx-6">
          {rows.map((row) => {
            const name = row.rawName || "this row";
            const needsMatch = unmatchedIds.has(row.id);
            const invalid = invalidIds.has(row.id);
            return (
              <li
                key={row.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_6rem_2.75rem] items-center gap-x-2.5 gap-y-2 px-4 py-3 tablet:grid-cols-[9.5rem_minmax(0,1fr)_6rem_2.75rem] tablet:gap-x-3 tablet:px-6",
                  needsMatch && "bg-danger-tint/40"
                )}
              >
                <p className="col-span-3 min-w-0 truncate text-small text-ink-muted tablet:col-span-1">
                  {row.rawName ? (
                    <>
                      Sheet: <span className="text-ink">{row.rawName}</span>
                    </>
                  ) : (
                    "Added by hand"
                  )}
                </p>
                <Select value={row.menuItemId} onValueChange={(value) => onChange(row.id, { menuItemId: value })}>
                  <SelectTrigger className="w-full min-w-0" aria-label={`Menu item for ${name}`} aria-invalid={needsMatch || undefined}>
                    <SelectValue placeholder="Choose the menu item" />
                  </SelectTrigger>
                  <SelectContent>
                    {menuItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`Quantity for ${name}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.qty}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => onChange(row.id, { qty: event.target.value })}
                  className="text-right tabular-nums"
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={() => onRemove(row.id)}>
                  <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
                </Button>
                {needsMatch && (
                  <p className="col-span-3 flex items-center gap-1.5 text-micro font-semibold text-danger tablet:col-span-4">
                    <ToneShape tone="danger" />
                    Choose the menu item for this row.
                  </p>
                )}
                {invalid && (
                  <p className="col-span-3 flex items-center gap-1.5 text-micro font-semibold text-danger tablet:col-span-4">
                    <ToneShape tone="danger" />
                    Use a whole number.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="ghost" className="mt-2" onClick={onAdd}>
        <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" /> Add a row by hand
      </Button>
    </div>
  );
}
