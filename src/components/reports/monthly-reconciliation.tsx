"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldRow } from "@/components/fields/field-row";
import { upsertMonthlyAdjustment } from "@/lib/data";
import { formatDateTime, formatMonthDisplay, idr, monthKey } from "@/lib/dates";
import { monthsTouching, type ReportPeriod } from "@/lib/report-period";
import type { MonthlyAdjustment, SalesEntry } from "@/lib/types";

/** A signed amount with a true minus sign for negatives (DESIGN_SYSTEM §7). */
function signedRp(value: number): string {
  if (value < 0) return `− ${idr(-value)}`;
  if (value > 0) return `+ ${idr(value)}`;
  return idr(0);
}

/**
 * Selisih for one month (inventory §3.5.1). It is kept per month and is added only to that month's total on the
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
  const earlier = useMemo(
    () => adjustments.filter((adjustment) => adjustment.month !== month).sort((a, b) => b.month.localeCompare(a.month)),
    [adjustments, month]
  );

  return (
    <Card className="gap-0 py-0 shadow-card">
      <div className="space-y-5 p-5 tablet:p-6">
        <div>
          <h2 className="font-display text-title-2 text-ink">Monthly reconciliation</h2>
          <p className="mt-1 text-small text-ink-muted">
            The bank difference for one month. It is added to that month&apos;s total only, and daily figures do not change.
            It counts once the month is over.
          </p>
        </div>
        <FieldRow label="Month">
          {(id) => (
            <Select value={month} onValueChange={setPicked}>
              <SelectTrigger id={id} className="w-full bg-surface">
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
          )}
        </FieldRow>
        <ReconciliationForm key={month} month={month} existing={existing} onSaved={onSaved} />
      </div>
      {earlier.length > 0 ? (
        <div className="border-t border-line p-5 tablet:p-6">
          <h3 className="text-title-3 text-ink">Earlier months</h3>
          <dl className="mt-2 divide-y divide-line">
            {earlier.map((adjustment) => (
              <div key={adjustment.id} className="flex items-baseline justify-between gap-3 py-2 text-body">
                <dt className="text-ink-muted">{formatMonthDisplay(adjustment.month)}</dt>
                <dd className="tabular-nums text-ink">{signedRp(adjustment.amount)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
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
      <FieldRow
        label={`Selisih for ${formatMonthDisplay(month)}`}
        hint="Enter a plus amount when the bank received more than was recorded for the month, and a minus amount when it received less."
      >
        {(id) => (
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-ink-muted">
              Rp
            </span>
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              disabled={saving}
              onChange={(event) => setAmount(event.target.value)}
              className="pl-10 text-right"
            />
          </div>
        )}
      </FieldRow>
      <FieldRow label="Note (optional)">
        {(id) => (
          <Input
            id={id}
            placeholder="e.g. bank fee, transfer delay"
            value={note}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FieldRow>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-ink-muted" aria-live="polite">
          {existing ? `Last saved ${formatDateTime(existing.createdAt)}` : "Nothing saved for this month yet."}
        </p>
        <Button variant="secondary" onClick={save} disabled={saving} loading={saving}>
          {saving ? "Saving…" : "Save selisih"}
        </Button>
      </div>
    </div>
  );
}
