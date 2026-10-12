/** Thrown when a record changed after the caller loaded it, so the write is refused. */
export class ConflictError extends Error {
  constructor(message = "This day was changed on another device — reload to see the latest.") {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Optimistic concurrency check. `expected` is the version the caller loaded, or
 * null when the caller expects no record yet. `actual` is the version stored now.
 */
export function isStale(expected: number | null, actual: number | null): boolean {
  return expected !== actual;
}

/**
 * Version used for concurrency checks: updatedAt, falling back to createdAt for
 * records written before updatedAt existed.
 */
export function recordVersion(record: { updatedAt?: number; createdAt: number }): number {
  return record.updatedAt ?? record.createdAt;
}
