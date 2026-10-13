// Chart colours come from the design tokens in src/app/globals.css. Charts read them as CSS
// variables, so one token change updates every chart. Single-series charts use `primary`.
// The four payment and category slots keep a fixed order and never cycle.
export const chartColors = {
  primary: "var(--color-brand)",
  // DESIGN_SYSTEM §10: main series at 78% opacity, the highlight in brand, today as a dashed outline,
  // and the average as a dashed ink line.
  series: "var(--color-accent)",
  seriesOpacity: 0.78,
  highlight: "var(--color-brand)",
  today: "var(--color-line-input)",
  average: "var(--color-ink)",
  grid: "var(--chart-grid)",
  other: "var(--chart-other)",
  payment: {
    BCA: "var(--chart-1)",
    Cash: "var(--chart-2)",
    Soundbox: "var(--chart-3)",
    Other: "var(--chart-4)",
  } as Record<string, string>,
  categorySlots: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"],
};
