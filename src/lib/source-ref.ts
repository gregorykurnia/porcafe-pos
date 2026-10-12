// Turns the internal sourceRef on a stock movement into words a person can act on.
// The raw reference stays available as a tooltip.

export type SourceLabel = {
  label: string;
  /** The raw reference, kept for support and audit. */
  raw: string;
};

/** Pulls the YYYY-MM-DD out of a usage event id such as "usage-2026-10-11". */
function usageDate(eventId: string): string | null {
  const match = /usage-(\d{4}-\d{2}-\d{2})/.exec(eventId);
  return match ? match[1] : null;
}

export function describeSourceRef(sourceRef: string | null | undefined): SourceLabel | null {
  if (!sourceRef) return null;
  const raw = sourceRef;

  if (raw.startsWith("consumption:")) {
    const date = usageDate(raw);
    const reversed = raw.includes(":reversal:");
    const day = date ? `daily close ${date}` : "daily close";
    return { label: reversed ? `Reversed ${day}` : `Recipe use from ${day}`, raw };
  }
  if (raw.startsWith("supplier-order:")) {
    const parts = raw.split(":");
    const received = parts.includes("receipt");
    return { label: received ? "Delivery against a supplier order" : "Supplier order", raw };
  }
  if (raw.startsWith("supplier-delivery-schedule:")) {
    const date = raw.split(":").pop() ?? "";
    return { label: date ? `Scheduled delivery ${date}` : "Scheduled delivery", raw };
  }
  if (raw.startsWith("stock-count:")) {
    const date = raw.split(":")[1] ?? "";
    return { label: date ? `Stock count ${date}` : "Stock count", raw };
  }
  if (raw.startsWith("opening-balance:")) {
    const date = raw.split(":")[1] ?? "";
    return { label: date ? `Opening stock ${date}` : "Opening stock", raw };
  }
  return { label: raw, raw };
}
