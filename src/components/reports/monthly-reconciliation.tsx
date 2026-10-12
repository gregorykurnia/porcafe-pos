import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertMonthlyAdjustment } from "@/lib/data";
import { formatDateTime, formatMonthDisplay, monthKey } from "@/lib/dates";
import { monthsTouching, type ReportPeriod } from "@/lib/report-period";
import type { MonthlyAdjustment, SalesEntry } from "@/lib/types";

/**
 * Selisih for one month. It is kept per month and is added only to that month's total on the
 * Revenue tab, never to a day. The month defaults to the last month in the period.
 */
export function MonthlyReconciliation({
  period,
  entries,
  adjustments,
  onSaved,
}: {
  period: ReportPeriod;
  entries: SalesEntry[];
  adjustments: MonthlyAdjustment[];
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const months = useMemo(() => {
    const all = new Set([
      ...monthsTouching(period),
      monthKey(period.to),
      ...entries.map((entry) => monthKey(entry.date)),
      ...adjustments.map((adjustment) => adjustment.month),
    ]);
    return [...all].sort().reverse();
  }, [adjustments, entries, period]);

  const month = picked && months.includes(picked) ? picked : monthKey(period.to);
  const existing = adjustments.find((adjustment) => adjustment.month === month);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly reconciliation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Selisih is the bank reconciliation difference for one month. It is added to that month&apos;s total only, and daily
          figures do not change. It counts once the month is over.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="reconciliation-month">Month</Label>
          <Select value={month} onValueChange={setPicked}>
            <SelectTrigger id="reconciliation-month" className="h-11 w-full bg-surface sm:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((item) => (
                <SelectItem key={item} value={item}>
                  {formatMonthDisplay(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ReconciliationForm key={month} month={month} existing={existing} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}

function ReconciliationForm({
  month,
  existing,
  onSaved,
}: {
  month: string;
  existing: MonthlyAdjustment | undefined;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // An empty note is sent as "" so that clearing it really clears it; a missing field would keep the old note.
      await upsertMonthlyAdjustment(month, parseFloat(amount) || 0, note.trim());
      toast.success("Selisih saved");
      onSaved();
    } catch (err) {
      console.error("Failed to save selisih:", err);
      toast.error(err instanceof Error ? `Failed to save selisih: ${err.message}` : "Failed to save selisih");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="selisih-amount">Selisih for {formatMonthDisplay(month)}</Label>
          <Input
            id="selisih-amount"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            disabled={saving}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11 sm:h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="selisih-note">Note (optional)</Label>
          <Input
            id="selisih-note"
            placeholder="e.g. bank fee, transfer delay"
            value={note}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
            className="h-11 sm:h-10"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter a plus amount when the bank received more than was recorded for the month, and a minus amount when it
        received less.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {existing ? `Last saved ${formatDateTime(existing.createdAt)}` : "Nothing saved for this month yet."}
        </p>
        <Button size="sm" onClick={save} disabled={saving} className="bg-primary hover:bg-primary-hover">
          {saving ? "Saving…" : "Save selisih"}
        </Button>
      </div>
    </div>
  );
}
