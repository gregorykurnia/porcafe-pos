"use client";

import { MoneyInput } from "@/components/fields/money-input";
import { CLOSE_PAYMENT_KEYS, parseClosePayments, type ClosePaymentKey, type ClosePaymentsText } from "@/lib/close-draft";
import { idr } from "@/lib/dates";

const LABELS: Record<ClosePaymentKey, string> = { cash: "Cash", bca: "BCA", soundbox: "Soundbox", other: "Other" };

/**
 * The day's four payment fields, saved with the items. Each row has the label on the left and the amount on the right
 * (DESIGN_SYSTEM §10). `hints` shows what the sheet reads for each method, so the reviewer can compare before saving.
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
    <section aria-labelledby="scan-payments-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2.5">
        <h3 id="scan-payments-heading" className="text-title-3 text-ink">Payments</h3>
        <p className="text-small text-ink-muted">
          {total === null ? (
            <span className="font-semibold text-danger">Check amounts</span>
          ) : (
            <>
              Total <span className="font-semibold tabular-nums text-ink">{idr(total)}</span>
            </>
          )}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {CLOSE_PAYMENT_KEYS.map((key) => (
          <li key={key} className="space-y-1.5 py-3">
            <MoneyInput
              id={`scan-payment-${key}`}
              label={LABELS[key]}
              layout="row"
              value={values[key]}
              onChange={(value) => onChange(key, value)}
              disabled={disabled}
            />
            {hints[key] && <p className="pl-[100px] text-small text-ink-muted">{hints[key]}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
