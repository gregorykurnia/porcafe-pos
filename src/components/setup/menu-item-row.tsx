import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { upsertMenuItem } from "@/lib/data";
import { ITEM_CATEGORIES, parseAliases } from "@/lib/menu-sheet";
import type { MenuItem } from "@/lib/types";

type EditableMenuItemField = "name" | "category" | "price";
type MenuItemDraft = Partial<Record<EditableMenuItemField, string>>;

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
      className="h-8 min-w-40 flex-1 text-sm"
    />
  );
}

export function EditableMenuItemRow({
  item,
  onSaved,
  onToggleActive,
  onMove,
}: {
  item: MenuItem;
  onSaved: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState<MenuItemDraft>({});
  const [saving, setSaving] = useState(false);

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

  function cellInput(field: EditableMenuItemField, type: "text" | "number") {
    return (
      <Input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        aria-label={`${field === "name" ? "Menu item name" : field === "category" ? "Category" : "Price"} for ${item.name}`}
        value={fieldValue(field)}
        disabled={saving}
        onChange={(e) => setField(field, e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`h-10 border-border bg-transparent px-1.5 sm:h-8 sm:border-transparent hover:border-border focus:border-ring ${
          type === "number" ? "text-right" : ""
        }`}
      />
    );
  }

  return (
    <TableRow className={`${saving ? "opacity-50" : ""} ${item.active ? "" : "bg-surface-elevated"}`}>
      <TableCell className="sticky left-0 z-10 min-w-44 bg-card p-1 font-medium">{cellInput("name", "text")}</TableCell>
      <TableCell className="p-1">
        <Select
          value={fieldValue("category")}
          disabled={saving}
          onValueChange={(v) => {
            setField("category", v);
            commit({ category: v });
          }}
        >
          <SelectTrigger
            size="sm"
          className="h-10 w-full border-border bg-transparent hover:border-border sm:h-8 sm:border-transparent"
            aria-label={`Category for ${item.name}`}
          >
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
      </TableCell>
      <TableCell className="p-1 text-right">
        {cellInput("price", "number")}
        {item.price === null && <p className="px-1.5 text-left text-xs font-medium text-warning">Missing price</p>}
      </TableCell>
      <TableCell className="p-1">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={saving} aria-label={`Move ${item.name} up on the sheet`}>
            <ChevronUp className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={saving} aria-label={`Move ${item.name} down on the sheet`}>
            <ChevronDown className="size-4" />
          </Button>
          <SheetNamesInput key={(item.sheetAliases ?? []).join("|")} item={item} onSaved={onSaved} />
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Active" : "Archived"}</Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleActive(item.id, !item.active)}
          disabled={saving}
          aria-label={`${item.active ? "Archive" : "Restore"} ${item.name}`}
        >
          {item.active ? "Archive" : "Restore"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
