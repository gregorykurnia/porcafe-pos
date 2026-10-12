import { formatRupiahText, parseRupiah } from "./money";
import type { SalesEntry } from "./types";

/** What the revenue form shows. Amounts stay as typed text until they are parsed. */
export type SalesFormValues = {
  bca: string;
  cash: string;
  soundbox: string;
  other: string;
  note: string;
};

/** Parsed whole-rupiah amounts, as they are stored. */
export type SalesAmounts = {
  bca: number;
  cash: number;
  soundbox: number;
  other: number;
  note: string;
};

export const EMPTY_SALES_FORM: SalesFormValues = { bca: "", cash: "", soundbox: "", other: "", note: "" };
export const EMPTY_SALES_AMOUNTS: SalesAmounts = { bca: 0, cash: 0, soundbox: 0, other: 0, note: "" };

const AMOUNT_FIELDS = [
  { key: "bca", label: "BCA" },
  { key: "cash", label: "Cash" },
  { key: "soundbox", label: "Soundbox" },
  { key: "other", label: "Other" },
] as const;

export function salesFormFromEntry(entry: SalesEntry | null): SalesFormValues {
  if (!entry) return EMPTY_SALES_FORM;
  return {
    bca: formatRupiahText(entry.bca),
    cash: formatRupiahText(entry.cash),
    soundbox: formatRupiahText(entry.soundbox),
    other: formatRupiahText(entry.other),
    note: entry.note ?? "",
  };
}

export function salesAmountsFromEntry(entry: SalesEntry | null): SalesAmounts {
  if (!entry) return EMPTY_SALES_AMOUNTS;
  return {
    bca: entry.bca,
    cash: entry.cash,
    soundbox: entry.soundbox,
    other: entry.other,
    note: (entry.note ?? "").trim(),
  };
}

/** Parses the form. Returns null when any amount is unreadable. */
export function parseSalesForm(form: SalesFormValues): SalesAmounts | null {
  const bca = parseRupiah(form.bca);
  const cash = parseRupiah(form.cash);
  const soundbox = parseRupiah(form.soundbox);
  const other = parseRupiah(form.other);
  if (bca === null || cash === null || soundbox === null || other === null) return null;
  return { bca, cash, soundbox, other, note: form.note.trim() };
}

export function salesTotal(amounts: SalesAmounts): number {
  return amounts.bca + amounts.cash + amounts.soundbox + amounts.other;
}

/**
 * True when saving the form would change what is stored. An unreadable amount
 * counts as a change, so it is never discarded silently.
 */
export function isSalesFormDirty(form: SalesFormValues, saved: SalesAmounts): boolean {
  const next = parseSalesForm(form);
  if (!next) return true;
  return (
    AMOUNT_FIELDS.some(({ key }) => next[key] !== saved[key]) || next.note !== saved.note
  );
}

export type SalesChangeRow = {
  label: string;
  kind: "amount" | "note";
  current: number | string | null;
  next: number | string | null;
};

/** One row per stored field, in form order, for the overwrite confirmation. */
export function salesChangeRows(saved: SalesAmounts, next: SalesAmounts): SalesChangeRow[] {
  const amountRows: SalesChangeRow[] = AMOUNT_FIELDS.map(({ key, label }) => ({
    label,
    kind: "amount",
    current: saved[key],
    next: next[key],
  }));
  return [
    ...amountRows,
    { label: "Note", kind: "note", current: saved.note || null, next: next.note || null },
  ];
}
