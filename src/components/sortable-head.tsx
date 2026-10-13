import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

// Column sorting for the tables. The header shows the sort state; a click cycles ascending, descending, then off.
export type SortDir = "asc" | "desc";
export type Sort<K extends string> = { key: K; dir: SortDir } | null;

export function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: Sort<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`${label}, ${active ? (sort!.dir === "asc" ? "ascending" : "descending") : "not sorted"}`}
        className={`inline-flex items-center gap-1 hover:text-foreground [@media(pointer:coarse)]:min-h-11 ${
          className?.includes("text-right") ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className={`size-3 ${active ? "" : "text-muted-foreground"}`} />
      </button>
    </TableHead>
  );
}

export function toggleSort<K extends string>(
  current: Sort<K>,
  key: K,
  setSort: (s: Sort<K>) => void
) {
  if (current?.key === key) {
    setSort(current.dir === "asc" ? { key, dir: "desc" } : null);
  } else {
    setSort({ key, dir: "asc" });
  }
}

export function cmp(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
