// Pure URL-state helpers. The hook in src/hooks/use-query-state.ts wraps these.

/**
 * The query string after setting or removing keys. A null value removes the key. Other keys
 * are kept in their original order, so unrelated state in the URL survives an update.
 */
export function queryWithValues(search: string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}
