import { formatRupiahText, parseRupiah } from "./money";

// Pure rules for Daily close: unsaved item quantities and the day's payments.

/**
 * True when the typed quantities differ from the saved log. Blank and zero are the
 * same, and an item missing from either side counts as zero.
 */
export function quantitiesDiffer(typed: Record<string, string>, saved: Record<string, number>): boolean {
  const itemIds = new Set([...Object.keys(typed), ...Object.keys(saved)]);
  for (const itemId of itemIds) {
    const typedValue = parseFloat(typed[itemId] ?? "") || 0;
    const savedValue = saved[itemId] ?? 0;
    if (typedValue !== savedValue) return true;
  }
  return false;
}

export type ClosePaymentKey = "cash" | "bca" | "soundbox" | "other";
export type ClosePaymentAmounts = Record<ClosePaymentKey, number>;
export type ClosePaymentsText = Record<ClosePaymentKey, string>;

export const CLOSE_PAYMENT_KEYS: readonly ClosePaymentKey[] = ["cash", "bca", "soundbox", "other"];
export const EMPTY_CLOSE_PAYMENTS_TEXT: ClosePaymentsText = { cash: "", bca: "", soundbox: "", other: "" };

/** Saved amounts for the day. A day with no revenue record counts as zero. */
export function savedClosePayments(entry: Partial<ClosePaymentAmounts> | null): ClosePaymentAmounts {
  return {
    cash: entry?.cash ?? 0,
    bca: entry?.bca ?? 0,
    soundbox: entry?.soundbox ?? 0,
    other: entry?.other ?? 0,
  };
}

/** Form text for the saved amounts. Zero shows as blank, as it does everywhere else. */
export function closePaymentsText(entry: Partial<ClosePaymentAmounts> | null): ClosePaymentsText {
  const saved = savedClosePayments(entry);
  return {
    cash: formatRupiahText(saved.cash),
    bca: formatRupiahText(saved.bca),
    soundbox: formatRupiahText(saved.soundbox),
    other: formatRupiahText(saved.other),
  };
}

/** Parses the typed amounts. Returns null when any of them is unreadable. */
export function parseClosePayments(text: ClosePaymentsText): ClosePaymentAmounts | null {
  const cash = parseRupiah(text.cash);
  const bca = parseRupiah(text.bca);
  const soundbox = parseRupiah(text.soundbox);
  const other = parseRupiah(text.other);
  if (cash === null || bca === null || soundbox === null || other === null) return null;
  return { cash, bca, soundbox, other };
}

/**
 * True when the typed payments would save something different from the saved day.
 * An unreadable amount counts as a change, so it is never discarded silently.
 */
export function closePaymentsDiffer(text: ClosePaymentsText, saved: ClosePaymentAmounts): boolean {
  const typed = parseClosePayments(text);
  if (!typed) return true;
  return CLOSE_PAYMENT_KEYS.some((key) => typed[key] !== saved[key]);
}

export type CloseDraft = {
  quantities: Record<string, string>;
  payments: ClosePaymentsText;
};

/**
 * Reads a stored draft. Accepts the current shape and the older quantities-only
 * shape, and rejects anything else, so a bad value never reaches the screen.
 */
export function normalizeCloseDraft(value: unknown): CloseDraft | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as Partial<CloseDraft>;
  if (candidate.quantities && typeof candidate.quantities === "object" && candidate.payments && typeof candidate.payments === "object") {
    return {
      quantities: candidate.quantities as Record<string, string>,
      payments: { ...EMPTY_CLOSE_PAYMENTS_TEXT, ...candidate.payments },
    };
  }
  if (Object.values(value).every((entry) => typeof entry === "string")) {
    return { quantities: value as Record<string, string>, payments: EMPTY_CLOSE_PAYMENTS_TEXT };
  }
  return null;
}
