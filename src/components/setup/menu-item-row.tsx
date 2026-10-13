"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Ellipsis } from "lucide-react";
import { StatusChip } from "@/components/patterns/status-chip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { upsertMenuItem } from "@/lib/data";
import { ITEM_CATEGORIES, parseAliases } from "@/lib/menu-sheet";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";

type EditableMenuItemField = "name" | "category" | "price";
type MenuItemDraft = Partial<Record<EditableMenuItemField, string>>;

/**
 * The menu grid. Desk: sheet order, name, category, price, sheet names, status and the ⋯ menu on one line. Phone and
 * tablet: name and ⋯ on the first line, category and price next, then sheet names and status. The header row uses it too.
 */
export const MENU_GRID =
  "grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 gap-y-2 desk:grid-cols-[96px_minmax(0,1.4fr)_120px_124px_minmax(0,1.3fr)_96px_44px] desk:gap-x-2";

// Other names the item is written under on the sheet. Saved when the field loses focus.
function SheetNamesInput({ item, onSaved }: { item: MenuItem; onSaved: () => void }) {
  const current = (item.sheetAliases ?? []).join(", ");
  return (
    <Input
      aria-label={`Sheet names for ${item.name}`}
      placeholder="e.g. Nanban, Nanban ayam"
      defaultValue={current}
      onBlur={async (event) => {
        const aliases = parseAliases(event.target.value);
        if (aliases.join("|") === (item.sheetAliases ?? []).join("|")) return;
        try {
          await upsertMenuItem({ id: item.id, name: item.name, category: item.category, price: item.price, active: item.active, sheetAliases: aliases });
          toast.success("Sheet names saved");
          onSaved();
        } catch (err) {
          console.error("Failed to save sheet names:", err);
          toast.error(err instanceof Error ? err.message : "Could not save sheet names");
        }
      }}
    />
  );
}

/** One menu item. Fields edit in place and save when the field loses focus, as before. */
export function MenuItemRow({
  item,
  position,
  count,
  onSaved,
  onToggleActive,
  onMove,
}: {
  item: MenuItem;
  /** The item's place in its category on the sheet, counted from 1, and how many items the category has. */
  position: number;
  count: number;
  onSaved: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState<MenuItemDraft>({});
  const [saving, setSaving] = useState(false);
  const first = position === 1;
  const last = position === count;

  function fieldValue(field: EditableMenuItemField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "price") return item.price !== null ? String(item.price) : "";
    return item[field] ?? "";
  }

  function setField(field: EditableMenuItemField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function commit(overrides?: MenuItemDraft) {
    const merged = { ...draft, ...overrides };
    if (Object.keys(merged).length === 0) return;
    const name = (merged.name ?? item.name).trim();
    if (!name) {
      toast.error("Name can't be empty");
      setDraft({});
      return;
    }
    setSaving(true);
    try {
      await upsertMenuItem({
        id: item.id,
        name,
        category: (merged.category ?? item.category).trim() || "Uncategorized",
        price: merged.price !== undefined ? (merged.price ? parseFloat(merged.price) : null) : item.price,
        active: item.active,
      });
      setDraft({});
      onSaved();
    } catch (err) {
      console.error("Failed to save item:", err);
      toast.error(err instanceof Error ? `Failed to save item: ${err.message}` : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={cn("px-4 py-3 desk:px-4 desk:py-2", saving && "opacity-60")}>
      <div className={MENU_GRID}>
        <div className="hidden items-center gap-0.5 desk:flex">
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={first || saving} aria-label={`Move ${item.name} up on the sheet`}>
            <ArrowUp strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={last || saving} aria-label={`Move ${item.name} down on the sheet`}>
            <ArrowDown strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <span className="w-6 text-center text-table tabular-nums text-ink-muted" aria-label={`Position ${position} of ${count} in ${item.category}`}>
            {position}
          </span>
        </div>

        <div className="row-start-1 min-w-0 col-start-1 desk:row-auto desk:col-auto">
          <Input
            aria-label={`Menu item name for ${item.name}`}
            value={fieldValue("name")}
            disabled={saving}
            onChange={(event) => setField("name", event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </div>

        <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 desk:contents">
          <Select
            value={fieldValue("category")}
            disabled={saving}
            onValueChange={(value) => {
              setField("category", value);
              void commit({ category: value });
            }}
          >
            <SelectTrigger aria-label={`Category for ${item.name}`} className="w-full min-w-0">
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

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-small text-ink-muted desk:hidden" aria-hidden="true">Rp</span>
            <div className="min-w-0 flex-1">
              <Input
                type="number"
                inputMode="decimal"
                aria-label={`Price for ${item.name}`}
                placeholder="0"
                value={fieldValue("price")}
                disabled={saving}
                onChange={(event) => setField("price", event.target.value)}
                onBlur={() => commit()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
                className="text-right"
              />
              {item.price === null && <p className="mt-1 text-micro font-semibold text-warn">Missing price</p>}
            </div>
          </div>
        </div>

        <div className="col-span-2 min-w-0 desk:col-span-1">
          <SheetNamesInput key={(item.sheetAliases ?? []).join("|")} item={item} onSaved={onSaved} />
        </div>

        <div className="col-span-2 flex min-w-0 items-center desk:col-span-1">
          {!item.active && <StatusChip tone="neutral">Archived</StatusChip>}
        </div>

        <div className="row-start-1 col-start-2 desk:row-auto desk:col-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${item.name}`}>
                <Ellipsis strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="desk:hidden" disabled={first || saving} onSelect={() => onMove(-1)}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem className="desk:hidden" disabled={last || saving} onSelect={() => onMove(1)}>
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem disabled={saving} onSelect={() => onToggleActive(item.id, !item.active)}>
                {item.active ? "Archive" : "Restore"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
