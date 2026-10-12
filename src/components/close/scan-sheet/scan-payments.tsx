"use client";

import { MoneyInput } from "@/components/fields/money-input";
import { CLOSE_PAYMENT_KEYS, parseClosePayments, type ClosePaymentKey, type ClosePaymentsText } from "@/lib/close-draft";
import { idr } from "@/lib/dates";

const LABELS: Record<ClosePaymentKey, string> = { cash: "Cash", bca: "BCA", soundbox: "Soundbox", other: "Other" };

/**
 * The day's four payment fields, saved with the items. `hints` shows what the sheet
 * reads for each method, so the reviewer can compare before saving.
 */
export function ScanPayments({
  values,
  hints,
  onChange,
  disabled,
}: {
  values: ClosePaymentsText;
  hints: Partial<Record<ClosePaymentKey, string>>;
  onChange: (key: ClosePaymentKey, value: string) => void;
  disabled?: boolean;
}) {
  const parsed = parseClosePayments(values);
  const total = parsed ? CLOSE_PAYMENT_KEYS.reduce((sum, key) => sum + parsed[key], 0) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Payments</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{total === null ? "Check amounts" : idr(total)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CLOSE_PAYMENT_KEYS.map((key) => (
          <div key={key} className="space-y-1">
            <MoneyInput id={`scan-payment-${key}`} label={LABELS[key]} value={values[key]} onChange={(value) => onChange(key, value)} disabled={disabled} />
            {hints[key] && <p className="text-xs text-muted-foreground">{hints[key]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
