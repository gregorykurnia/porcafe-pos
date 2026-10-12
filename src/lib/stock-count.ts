// Stock count rules: how far a counted quantity is from the system balance, and when the
// difference must be explained.

/** A difference above this share of the system balance needs a reason. */
export const COUNT_REASON_THRESHOLD = 0.2;

export type CountVariance = {
  difference: number;
  /** Share of the system balance, or null when the system balance is zero. */
  percent: number | null;
  needsReason: boolean;
};

export function countVariance(system: number, counted: number): CountVariance {
  const difference = counted - system;
  if (difference === 0) return { difference, percent: 0, needsReason: false };
  if (system === 0) return { difference, percent: null, needsReason: true };
  const percent = (difference / Math.abs(system)) * 100;
  return { difference, percent, needsReason: Math.abs(difference) / Math.abs(system) > COUNT_REASON_THRESHOLD };
}

/** A typed count: zero or more, decimals allowed. Null when it is not a count. */
export function parseCountQuantity(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Session key for a count sheet in progress, so entries survive a reload until saved. */
export function countDraftKey(date: string): string {
  return `porcafe.stock-count.draft.${date}`;
}
