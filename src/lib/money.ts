// Rupiah amounts are whole numbers. Staff type them the way they say them:
// "1.500.000", "1500000", "1,5jt", "150rb" or "150k".

const UNIT_MULTIPLIERS: Record<string, number> = {
  jt: 1_000_000,
  juta: 1_000_000,
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
};

/**
 * Parses a typed rupiah amount into whole rupiah.
 * Returns 0 for blank input and null when the text is not an amount.
 *
 * - Without a unit, "." and "," are thousands separators: "1.500.000" → 1500000.
 *   Rupiah has no fractions, so "1,5" reads as 15. Add a unit to write a decimal.
 * - With a unit, the last separator is the decimal point: "1,5jt" → 1500000.
 */
export function parseRupiah(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/^rp\.?\s*/, "");
  if (text === "") return 0;

  const match = /^(\d[\d.,\s]*?)\s*(jt|juta|rb|ribu|k)?$/.exec(text);
  if (!match) return null;

  const [, numberPart, unit] = match;
  const compact = numberPart.replace(/\s/g, "");
  let value: number;

  if (!unit) {
    value = Number(compact.replace(/[.,]/g, ""));
  } else {
    const lastSeparator = Math.max(compact.lastIndexOf("."), compact.lastIndexOf(","));
    const wholePart = lastSeparator === -1 ? compact : compact.slice(0, lastSeparator).replace(/[.,]/g, "");
    const fraction = lastSeparator === -1 ? "" : compact.slice(lastSeparator + 1);
    value = Number(`${wholePart}.${fraction || "0"}`) * UNIT_MULTIPLIERS[unit];
  }

  if (!Number.isSafeInteger(Math.round(value))) return null;
  return Math.round(value);
}

/** Groups a string of digits with "." as the thousands separator: "1234567" → "1.234.567". */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Display text for a stored amount: 1500000 → "1.500.000". Zero shows as an empty field. */
export function formatRupiahText(amount: number): string {
  return amount > 0 ? groupThousands(String(Math.round(amount))) : "";
}

/**
 * Text shown while the user types. Plain digits (and dots or spaces) are grouped
 * as they are typed. Anything with a unit or a decimal comma is left as typed,
 * so "1,5jt" is not rewritten while the user is still typing it.
 */
export function formatRupiahDraft(raw: string): string {
  if (!/^[\d.\s]*$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" ? "" : groupThousands(digits);
}
