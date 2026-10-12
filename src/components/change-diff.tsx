export type ChangeDiffRow = {
  label: string;
  current: number | string | null;
  next: number | string | null;
  /** Formats a non-empty value for display. Plain String() is used when omitted. */
  format?: (value: number | string) => string;
};

/**
 * Current → new table for a record about to be overwritten. Changed rows are
 * highlighted, so a confirmation shows exactly what will change.
 */
export function ChangeDiff({
  rows,
  currentLabel = "Saved",
  nextLabel = "New",
}: {
  rows: ChangeDiffRow[];
  currentLabel?: string;
  nextLabel?: string;
}) {
  const changedCount = rows.filter((row) => row.current !== row.next).length;

  function display(row: ChangeDiffRow, value: number | string | null) {
    if (value === null || value === "") return "—";
    return row.format ? row.format(value) : String(value);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Field</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{currentLabel}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{nextLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const changed = row.current !== row.next;
              return (
                <tr key={row.label} className={changed ? "bg-warning/10" : undefined}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{row.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{display(row, row.current)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${changed ? "font-semibold text-warning" : "text-foreground"}`}>
                    {display(row, row.next)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {changedCount === 0 ? "No values change." : `${changedCount} ${changedCount === 1 ? "value" : "values"} will change.`}
      </p>
    </div>
  );
}
