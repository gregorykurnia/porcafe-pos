import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { upsertItemSale } from "@/lib/data";
import { formatDisplay } from "@/lib/dates";
import type { ItemSale, MenuItem } from "@/lib/types";

type EditableSaleField = "date" | "itemId" | "qty";
type SaleDraft = Partial<Record<EditableSaleField, string>>;

export function EditableItemSaleRow({
  sale,
  category,
  menuItems,
  onSaved,
  onDelete,
  readOnly = false,
}: {
  sale: ItemSale;
  category: string;
  menuItems: MenuItem[];
  onSaved: () => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
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

  if (readOnly) {
    return (
      <TableRow>
        <TableCell className="font-medium">{formatDisplay(sale.date)}</TableCell>
        <TableCell>{sale.itemName}</TableCell>
        <TableCell className="text-muted-foreground">{category}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{sale.qty}</TableCell>
        <TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Badge variant="secondary">Daily close</Badge><Button asChild variant="ghost" size="sm"><Link href={`/items?date=${sale.date}`}>Open day</Link></Button></div></TableCell>
      </TableRow>
    );
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

  return (
    <TableRow className={saving ? "opacity-50" : undefined}>
      <TableCell className="p-1">
        <Input
          type="date"
          value={fieldValue("date")}
          disabled={saving}
          onChange={(e) => {
            setField("date", e.target.value);
            commit({ date: e.target.value });
          }}
          className="h-8 border-transparent bg-transparent px-1.5 hover:border-border focus:border-ring"
        />
        <span className="block px-1.5 text-[11px] leading-4 text-muted-foreground">
          {fieldValue("date") ? formatDisplay(fieldValue("date")) : "No date selected"}
        </span>
      </TableCell>
      <TableCell className="p-1">
        <Select
          value={fieldValue("itemId")}
          disabled={saving}
          onValueChange={(v) => {
            setField("itemId", v);
            commit({ itemId: v });
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-full border-transparent bg-transparent hover:border-border">
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
      </TableCell>
      <TableCell className="p-1 text-muted-foreground">{category}</TableCell>
      <TableCell className="p-1 text-right">
        <Input
          type="number"
          inputMode="numeric"
          value={fieldValue("qty")}
          disabled={saving}
          onChange={(e) => setField("qty", e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 border-transparent bg-transparent px-1.5 text-right hover:border-border focus:border-ring"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <span aria-live="polite" className="text-xs text-success">{saving ? "Saving…" : saveStatus === "saved" ? "Saved" : ""}</span>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => onDelete(sale.id)}
            aria-label={`Delete ${sale.itemName} sale`}
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
