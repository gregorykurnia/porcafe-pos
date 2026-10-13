import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Banner } from "@/components/patterns/banner";
import { StatusLine } from "@/components/patterns/status-chip";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDetail,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resolveDuplicateSalesDate, type DuplicateSalesDate } from "@/lib/data";
import { formatDateTime, formatDisplay, idr } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** The Revenue tab's warning (inventory §3.5.1). It links to Setup → Data maintenance, where the records are kept. */
export function DuplicateDatesBanner({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Banner tone="warn" action={{ label: "Review in Setup", onClick: () => router.push("/setup?tab=data") }}>
      {count} {count === 1 ? "date has" : "dates have"} more than one revenue record. Review them in Setup → Data maintenance.
    </Banner>
  );
}

/** Shown while any date has more than one revenue record. The totals are not changed until one record is kept. */
export function DuplicateDatesCard({
  groups,
  onResolved,
}: {
  groups: DuplicateSalesDate[];
  onResolved: () => void;
}) {
  return (
    <section aria-labelledby="duplicate-dates-title" className="space-y-4 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card desk:p-6">
      <div>
        <h2 id="duplicate-dates-title" className="font-display text-title-2 text-ink">Duplicate sales dates</h2>
        <p className="mt-1 text-small text-ink-muted">
          These days have more than one revenue record. Keep one record for each date. The others are removed, and amounts are not combined.
        </p>
      </div>
      <StatusLine tone="warn">
        {groups.length} {groups.length === 1 ? "date has" : "dates have"} more than one revenue record.
      </StatusLine>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {groups.map((group) => (
          <li key={group.date} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{formatDisplay(group.date)}</p>
              <p className="text-small text-ink-muted">{group.entries.length} records for this date</p>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-medium text-ink">{idr(group.entries.reduce((sum, entry) => sum + entry.total, 0))}</p>
              <p className="text-small text-ink-muted">Combined view only</p>
            </div>
            <DuplicateDateReviewDialog group={group} onResolved={onResolved} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Keep one record. Destructive, so the dialog opens with Cancel focused and the others are only removed on confirm. */
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const others = group.entries.length - 1;

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
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Review records
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => { if (!resolving) setOpen(next); }}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-danger-tint text-danger">
              <Trash2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <AlertDialogTitle>Review {formatDisplay(group.date)}</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the one record that represents this operating day. The other {others} record{others === 1 ? "" : "s"} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <fieldset disabled={resolving} className="space-y-2">
            <legend className="sr-only">Record to keep</legend>
            {group.entries.map((entry) => (
              <label
                key={entry.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                  keepId === entry.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-canvas"
                )}
              >
                <input
                  type="radio"
                  name={`duplicate-${group.date}`}
                  value={entry.id}
                  checked={keepId === entry.id}
                  onChange={() => setKeepId(entry.id)}
                  className="mt-1 size-5 accent-brand"
                />
                <span className="min-w-0 flex-1 text-body">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink tabular-nums">{idr(entry.total)}</span>
                    <span className="text-small text-ink-muted">{entry.id.startsWith("sales-") ? "Canonical ID" : "Existing ID"}</span>
                  </span>
                  <span className="mt-1 block text-small text-ink-muted tabular-nums">
                    BCA {idr(entry.bca)} · Cash {idr(entry.cash)} · Soundbox {idr(entry.soundbox)} · Other {idr(entry.other)}
                  </span>
                  <span className="mt-1 block text-small text-ink-muted">Created {formatDateTime(entry.createdAt)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <AlertDialogDetail>This keeps only the selected record and removes the others. It does not combine payment amounts.</AlertDialogDetail>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={resolving}>Cancel</AlertDialogCancel>
            <Button variant="destructive" className="w-full tablet:w-auto" onClick={() => void resolve()} loading={resolving} disabled={resolving || !keepId}>
              {resolving ? "Resolving…" : "Keep selected record"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
