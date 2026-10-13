"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Ellipsis, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { SaveState, type SaveStateKind } from "@/components/patterns/save-state";
import { upsertItemSale } from "@/lib/data";
import { formatDisplay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ItemSale, MenuItem } from "@/lib/types";

type EditableSaleField = "date" | "itemId" | "qty";
type SaleDraft = Partial<Record<EditableSaleField, string>>;

/** The short day shown in the date column, for example "Mon, 12 Oct" (DESIGN_SYSTEM §7). */
export function formatShortDay(dateISO: string): string {
  return format(parseISO(dateISO), "EEE, d MMM");
}

/**
 * One recorded item sale. Daily close entries are read-only and link to their day. Legacy rows are edited in place:
 * a change to the date or item saves at once, and quantity saves on blur or Enter. Delete sits in the ⋯ menu.
 *
 * `variant` picks the desk and tablet table row or the phone list item. The history renders both, and CSS shows one.
 */
export function EditableItemSaleRow({
  sale,
  category,
  menuItems,
  onSaved,
  onDelete,
  readOnly = false,
  variant,
}: {
  sale: ItemSale;
  category: string;
  menuItems: MenuItem[];
  onSaved: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
  variant: "table" | "list";
}) {
  const [draft, setDraft] = useState<SaleDraft>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  function fieldValue(field: EditableSaleField): string {
    if (field in draft) return draft[field] ?? "";
    if (field === "qty") return String(sale.qty);
    if (field === "itemId") return sale.itemId;
    return sale.date;
  }

  function setField(field: EditableSaleField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    setSaveStatus("idle");
  }

  async function commit(overrides?: SaleDraft) {
    const merged = { ...draft, ...overrides };
    if (Object.keys(merged).length === 0) return;
    const itemId = merged.itemId ?? sale.itemId;
    const item = menuItems.find((m) => m.id === itemId);
    if (!item) {
      toast.error("Item not found");
      setDraft({});
      return;
    }
    setSaving(true);
    try {
      await upsertItemSale({
        id: sale.id,
        date: merged.date ?? sale.date,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        qty: merged.qty !== undefined ? parseFloat(merged.qty) || 0 : sale.qty,
      });
      setDraft({});
      setSaveStatus("saved");
      onSaved();
    } catch (err) {
      console.error("Failed to save sale:", err);
      toast.error(err instanceof Error ? `Failed to save sale: ${err.message}` : "Failed to save sale");
    } finally {
      setSaving(false);
    }
  }

  const dayLabel = formatShortDay(sale.date);
  const dayLong = formatDisplay(sale.date);
  const saveKind: SaveStateKind | null = saving ? "saving" : saveStatus === "saved" ? "saved" : null;
  const isTable = variant === "table";

  // The table is narrow on tablet, so there the link is an icon with its name in aria-label and title.
  const openDay = (
    <Button asChild variant="ghost" size="sm" className="shrink-0 [@media(pointer:coarse)]:min-w-11">
      <Link href={`/items?date=${sale.date}`} aria-label={`Open day ${dayLong}`} title={isTable ? "Open day in Daily close" : undefined}>
        {isTable ? <ExternalLink strokeWidth={1.5} aria-hidden="true" className="desk:hidden" /> : null}
        <span className={isTable ? "hidden desk:inline" : undefined}>Open day</span>
      </Link>
    </Button>
  );

  if (readOnly) {
    if (isTable) {
      return (
        <TableRow className="h-10 border-line hover:bg-canvas [@media(pointer:coarse)]:h-14">
          <TableCell className="py-0 text-ink">{dayLabel}</TableCell>
          <TableCell className="py-0 font-medium text-ink">{sale.itemName}</TableCell>
          <TableCell className="py-0 text-ink-muted">{category}</TableCell>
          <TableCell className="py-0 text-right font-semibold tabular-nums text-ink">{sale.qty}</TableCell>
          <TableCell className="py-0">
            <div className="flex items-center gap-1">
              <span className="text-small text-ink-muted">Daily close</span>
              {openDay}
            </div>
          </TableCell>
        </TableRow>
      );
    }
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 break-words text-body font-medium text-ink">{sale.itemName}</p>
            <p className="shrink-0 text-body font-semibold tabular-nums text-ink">{sale.qty}</p>
          </div>
          <p className="text-small text-ink-muted">
            {dayLabel} · {category} · Daily close
          </p>
        </div>
        {openDay}
      </li>
    );
  }

  const noDateNote = fieldValue("date") ? null : "No date selected";

  const dateInput = (className: string) => (
    <Input
      type="date"
      aria-label={`Date for ${sale.itemName}`}
      value={fieldValue("date")}
      disabled={saving}
      className={className}
      onChange={(e) => {
        setField("date", e.target.value);
        commit({ date: e.target.value });
      }}
    />
  );

  const itemField = (
    <Select
      value={fieldValue("itemId")}
      disabled={saving}
      onValueChange={(v) => {
        setField("itemId", v);
        commit({ itemId: v });
      }}
    >
      <SelectTrigger
        aria-label={`Item for the sale on ${dayLong}`}
        className="w-full min-w-36 bg-surface text-[16px] desk:text-body desk:data-[size=default]:h-10"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {menuItems.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const qtyField = (className: string) => (
    <Input
      type="number"
      inputMode="numeric"
      aria-label={`Quantity for ${sale.itemName}`}
      value={fieldValue("qty")}
      disabled={saving}
      onChange={(e) => setField("qty", e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn("text-right", className)}
    />
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${sale.itemName} on ${dayLong}`}>
          <Ellipsis strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(sale.id)}>
          Delete sale
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isTable) {
    // Five cells, the same columns as the Daily close rows. The save state sits under the date, so the row does not
    // widen while it saves.
    return (
      <TableRow className={cn("min-h-14 border-line hover:bg-canvas", saving && "opacity-50")}>
        <TableCell className="p-1">
          {dateInput("w-auto px-2")}
          <span className="block h-4 px-1 text-micro leading-4 text-ink-muted">
            {saveKind ? <SaveState kind={saveKind} /> : noDateNote}
          </span>
        </TableCell>
        <TableCell className="p-1">{itemField}</TableCell>
        <TableCell className="p-1 text-ink-muted">{category}</TableCell>
        <TableCell className="p-1">{qtyField("w-16")}</TableCell>
        <TableCell className="p-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-small text-ink-muted">Legacy row</span>
            {menu}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <li className={cn("space-y-2 px-4 py-3", saving && "opacity-50")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{itemField}</div>
        {menu}
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {dateInput("w-full")}
          {noDateNote ? <span className="block px-1 pt-1 text-micro leading-4 text-ink-muted">{noDateNote}</span> : null}
        </div>
        <div className="w-28 shrink-0">{qtyField("")}</div>
      </div>
      <div className="flex items-center justify-between gap-2 text-small text-ink-muted">
        <span>{category} · Legacy row</span>
        {saveKind ? <SaveState kind={saveKind} /> : null}
      </div>
    </li>
  );
}
