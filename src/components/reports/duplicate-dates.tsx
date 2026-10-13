import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveDuplicateSalesDate, type DuplicateSalesDate } from "@/lib/data";
import { formatDateTime, formatDisplay, idr } from "@/lib/dates";

/** Shown while any date has more than one revenue record. The totals are not changed until one record is kept. */
export function DuplicateDatesCard({
  groups,
  onResolved,
}: {
  groups: DuplicateSalesDate[];
  onResolved: () => void;
}) {
  return (
    <Card className="border-warning/25 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-lg text-foreground">Duplicate dates need review</CardTitle>
        <p className="text-sm text-muted-foreground">
          These days have more than one revenue record. Keep one record for each date. The others are removed, and
          amounts are not combined.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-warning/15 rounded-xl border border-warning/15 bg-surface/70">
          {groups.map((group) => (
            <div key={group.date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{formatDisplay(group.date)}</p>
                <p className="text-xs text-muted-foreground">{group.entries.length} records for this date</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground tabular-nums">
                  {idr(group.entries.reduce((sum, entry) => sum + entry.total, 0))}
                </p>
                <p className="text-xs text-muted-foreground">Combined view only</p>
              </div>
              <DuplicateDateReviewDialog group={group} onResolved={onResolved} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DuplicateDateReviewDialog({
  group,
  onResolved,
}: {
  group: DuplicateSalesDate;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState(group.entries[0]?.id ?? "");
  const [resolving, setResolving] = useState(false);

  async function resolve() {
    if (!keepId) return;
    setResolving(true);
    try {
      const result = await resolveDuplicateSalesDate(group.date, keepId);
      toast.success(`Kept one record and removed ${result.deletedIds.length} duplicate${result.deletedIds.length === 1 ? "" : "s"}`);
      setOpen(false);
      onResolved();
    } catch (err) {
      console.error("Failed to resolve duplicate sales date:", err);
      toast.error(err instanceof Error ? err.message : "Could not resolve duplicate date");
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-warning/20 bg-surface hover:bg-surface-elevated">
          Review records
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {formatDisplay(group.date)}</DialogTitle>
          <DialogDescription>
            Choose the one record that represents this operating day. The other {group.entries.length - 1} record{group.entries.length - 1 === 1 ? "" : "s"} will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {group.entries.map((entry) => (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${keepId === entry.id ? "border-primary bg-brand-soft" : "border-border bg-surface hover:bg-muted"}`}
            >
              <input
                type="radio"
                name={`duplicate-${group.date}`}
                value={entry.id}
                checked={keepId === entry.id}
                onChange={() => setKeepId(entry.id)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{idr(entry.total)}</span>
                  <span className="text-xs text-muted-foreground">{entry.id.startsWith("sales-") ? "Canonical ID" : "Existing ID"}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  BCA {idr(entry.bca)} · Cash {idr(entry.cash)} · Soundbox {idr(entry.soundbox)} · Other {idr(entry.other)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Created {formatDateTime(entry.createdAt)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-muted-foreground">
          This action only keeps the selected record and removes the others. It does not combine payment amounts.
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={resolving}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={resolve} disabled={resolving || !keepId}>
            {resolving ? "Resolving…" : "Keep selected record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
