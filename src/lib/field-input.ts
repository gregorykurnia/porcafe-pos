// Rules behind the shared quantity and date fields. Kept pure so they can be tested.

/** Accepts a typed quantity, or returns null to reject the keystroke. */
export function acceptQuantityInput(raw: string, allowDecimal = false): string | null {
  const pattern = allowDecimal ? /^\d*(\.\d*)?$/ : /^\d*$/;
  return pattern.test(raw) ? raw : null;
}

/** Steps a quantity by `delta`, never below `min`. Whole numbers unless decimals are allowed. */
export function stepQuantity(current: string, delta: number, { min = 0, allowDecimal = false } = {}): string {
  const numeric = parseFloat(current) || 0;
  const next = Math.max(min, numeric + delta);
  return String(allowDecimal ? next : Math.round(next));
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The date a date field should show after the user edits it. A cleared or
 * half-typed value keeps the current date, so clearing the field never jumps to today.
 */
export function acceptDateInput(raw: string, current: string): string {
  return isISODate(raw) ? raw : current;
}
