import { formatDisplay, formatTimeOfDay, idr } from "./dates";

// Owner decision D6 (default): warn when payments and the menu-price estimate differ by more
// than 15 %. Warnings never block completing a day.
export const REVENUE_MISMATCH_THRESHOLD = 0.15;

export type CloseWarningCode =
  | "no-portions"
  | "no-revenue"
  | "revenue-mismatch"
  | "missing-price"
  | "future-date"
  | "editing-completed";

export type CloseWarning = { code: CloseWarningCode; message: string };

export type CloseCheckInput = {
  date: string;
  today: string;
  quantities: Record<string, number>;
  items: { id: string; price: number | null }[];
  /** Total of the payments being saved. */
  payments: number;
  /** The saved day before this save, or null if the day was never saved. */
  previous: { status: "draft" | "complete" | "no_sales"; source: "manual" | "scan"; updatedAt: number } | null;
};

/** Checks shown before a day is completed. They inform the user; they never block. */
export function getCloseWarnings(input: CloseCheckInput): CloseWarning[] {
  const priceById = new Map(input.items.map((item) => [item.id, item.price]));
  const warnings: CloseWarning[] = [];
  let portions = 0;
  let estimate = 0;
  let unpriced = 0;

  for (const [itemId, qty] of Object.entries(input.quantities)) {
    if (!(qty > 0)) continue;
    portions += qty;
    const price = priceById.get(itemId);
    if (price === null || price === undefined) {
      unpriced += 1;
      continue;
    }
    estimate += price * qty;
  }

  if (portions === 0) {
    warnings.push({ code: "no-portions", message: "No items are entered. If the day had no sales, mark it as No sales instead." });
  } else if (input.payments === 0) {
    warnings.push({
      code: "no-revenue",
      message: "Items are entered but no payments are. Enter the payments, or complete anyway if they are not known yet.",
    });
  } else if (estimate > 0 && Math.abs(input.payments - estimate) / estimate > REVENUE_MISMATCH_THRESHOLD) {
    warnings.push({
      code: "revenue-mismatch",
      message: `Payments are ${idr(input.payments)}, but the items come to about ${idr(estimate)} at menu prices. Check both before completing.`,
    });
  }

  if (unpriced > 0) {
    warnings.push({
      code: "missing-price",
      message: `${unpriced} sold item${unpriced === 1 ? " has" : "s have"} no price, so the estimate is partial.`,
    });
  }

  if (input.date > input.today) {
    warnings.push({ code: "future-date", message: `${formatDisplay(input.date)} is in the future.` });
  }

  if (input.previous?.status === "complete") {
    const source = input.previous.source === "scan" ? "from the sheet" : "by hand";
    warnings.push({
      code: "editing-completed",
      message: `This day was completed at ${formatTimeOfDay(input.previous.updatedAt)} ${source}. Completing again replaces it.`,
    });
  }

  return warnings;
}
