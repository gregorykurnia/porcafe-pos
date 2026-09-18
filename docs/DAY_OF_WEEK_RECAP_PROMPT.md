# Day-of-Week Recap Analysis Prompt

This prompt is intended for a future implementation session. It does not authorize implementation by itself.

## Recommended implementation prompt

```text
Add a Day-of-Week Pattern analysis to the existing Items Sold Recap / Sales Recap experience in this repository.

Before editing, read AGENTS.md and docs/DESIGN_DIRECTION.md. Inspect the current recap pages, data model, API queries, date-range filters, timezone handling, chart components, and design system. Reuse the existing architecture and UI patterns. Do not invent field names or create a parallel analytics system.

First show the planned file changes and explain which existing data sources and business rules will be used. Wait for approval if the implementation would require changing routes, permissions, persistence semantics, or the source of truth.

Requirements:

1. Group recap data by weekday, Monday through Sunday.
2. Support the existing date-range filters and calculate:
   - Total items sold
   - Total sales
   - Number of transactions
   - Average items sold per occurrence of that weekday
   - Average sales per occurrence of that weekday
3. Show both totals and per-day averages. Normalize averages by the number of actual Mondays, Tuesdays, etc. in the selected range so uneven date ranges are not misleading.
4. Add a clear visualization, preferably:
   - A weekday bar chart for average sales
   - A toggle for average items sold and transaction count
   - A table showing weekday, sample count, totals, averages, and percentage of weekly total
5. If the existing data supports item-level analysis, add a drill-down or secondary view showing the top-selling item for each weekday. Keep the overall weekday summary useful without requiring the drill-down.
6. Add concise, data-backed insights such as the best-performing and weakest-performing weekday. Include the number of observed weekday occurrences and avoid strong conclusions when the sample size is small.
7. Handle these edge cases:
   - Missing or zero-sales weekdays
   - Partial date ranges
   - The current incomplete day
   - Timezone boundaries
   - Empty results
   - Cancelled or refunded orders according to the app's existing business rules
8. Use the application's existing timezone and sales definitions consistently. Document whether sales means gross, net, or another existing metric.
9. Make the UI responsive and accessible, with readable labels, tooltips, keyboard support, and a non-chart tabular alternative.
10. Preserve all existing recap functionality and styling. Follow the Calm Café Ledger direction with Daily Close Companion behavior from docs/DESIGN_DIRECTION.md.

Add or update tests for weekday grouping, average calculations, date-range boundaries, timezone behavior, empty data, and refunded/cancelled transactions. Run the relevant lint, type-check, build, and test commands for the changed surface. Compare the result at desktop and mobile widths. Keep the implementation focused and do not add unrelated features.

After the change is verified, follow the repository workflow in AGENTS.md: create a focused git commit and push it to the configured remote.
```

## Suggested location

Keep this file and `DESIGN_DIRECTION.md` in `docs/`. Leave `AGENTS.md` at the repository root because it contains repository-wide agent instructions.
