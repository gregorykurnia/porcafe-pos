"use client";

import { Suspense, useCallback, useMemo } from "react";
import { Banner } from "@/components/patterns/banner";
import { PageTabs, type PageTab } from "@/components/patterns/page-tabs";
import { ErrorBanner, LoadingSkeleton } from "@/components/patterns/states";
import { ItemsReport } from "@/components/reports/items-report";
import { PeriodSelector } from "@/components/reports/period-selector";
import { RevenueReport } from "@/components/reports/revenue-report";
import { WeekdayReport } from "@/components/reports/weekday-report";
import { useQueryState, useQueryUpdate } from "@/hooks/use-query-state";
import { useReportData } from "@/hooks/use-report-data";
import { isISODate, monthKey, todayISO } from "@/lib/dates";
import { isValidPeriod, type ReportPeriod } from "@/lib/report-period";
import { getCanonicalItemRows } from "@/lib/reporting";
import type { ItemSale } from "@/lib/types";

type ReportsTab = "revenue" | "items" | "weekday";
const REPORT_TABS: PageTab<ReportsTab>[] = [
  { value: "revenue", label: "Revenue" },
  { value: "items", label: "Items" },
  { value: "weekday", label: "Weekday patterns" },
];

function isReportsTab(value: string): boolean {
  return REPORT_TABS.some((tab) => tab.value === value);
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} label="Loading reports" />}>
      <ReportsWorkspace />
    </Suspense>
  );
}

// The tab and the shared period live in the URL (?tab=, ?from=, ?to=), so a shared link opens the same report.
function ReportsWorkspace() {
  const today = todayISO();
  const [tab, setTab] = useQueryState<ReportsTab>("tab", { default: "revenue", validate: isReportsTab });
  const defaultFrom = `${monthKey(today)}-01`;
  const [from] = useQueryState("from", { default: defaultFrom, validate: isISODate });
  const [to] = useQueryState("to", { default: today, validate: isISODate });
  const updateQuery = useQueryUpdate();
  const period = useMemo<ReportPeriod>(() => ({ from, to }), [from, to]);

  // Both dates change in one navigation, so neither write overwrites the other. The default
  // period (this month) drops both keys, so clearing a custom range also clears the address.
  const setPeriod = useCallback(
    (next: ReportPeriod) =>
      updateQuery(
        next.from === defaultFrom && next.to === today ? { from: null, to: null } : { from: next.from, to: next.to }
      ),
    [defaultFrom, today, updateQuery]
  );

  const data = useReportData();
  const categoryByItemId = useMemo(
    () => new Map(data.menuItems.map((item) => [item.id, item.category])),
    [data.menuItems]
  );
  const isMain = useCallback(
    (row: ItemSale) => (categoryByItemId.get(row.itemId) ?? row.category) === "Main",
    [categoryByItemId]
  );
  const itemRows = useMemo(
    () => getCanonicalItemRows(data.dailyLogs, data.itemSales, data.menuItems),
    [data.dailyLogs, data.itemSales, data.menuItems]
  );
  // A day counts as logged if it has a daily close or any legacy item row.
  const loggedDates = useMemo(
    () => [...data.dailyLogs.map((log) => log.date), ...data.itemSales.map((sale) => sale.date)],
    [data.dailyLogs, data.itemSales]
  );

  const valid = isValidPeriod(period);
  const activeTab = REPORT_TABS.find((item) => item.value === tab);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium text-brand tablet:text-title-1">Reports</h1>
          <p className="mt-1 text-small text-ink-muted">Revenue, items and weekday patterns for one period.</p>
        </div>
        <PeriodSelector period={period} today={today} onChange={setPeriod} />
      </header>

      <PageTabs label="Report sections" value={tab} tabs={REPORT_TABS} onChange={setTab} />

      {!valid ? (
        <Banner tone="danger">
          The start date must be on or before the end date. Reports are hidden until the period is fixed.
        </Banner>
      ) : data.status === "loading" ? (
        <LoadingSkeleton rows={4} label="Loading reports" />
      ) : data.status === "error" ? (
        <ErrorBanner onRetry={() => void data.reload()}>
          Couldn&apos;t load reports. Check the connection and try again.
        </ErrorBanner>
      ) : (
        <div role="tabpanel" aria-label={activeTab?.label}>
          {tab === "revenue" && (
            <RevenueReport
              period={period}
              today={today}
              entries={data.salesEntries}
              adjustments={data.adjustments}
              onChanged={() => void data.reload()}
            />
          )}
          {tab === "items" && (
            <ItemsReport
              period={period}
              today={today}
              menuItems={data.menuItems}
              itemRows={itemRows}
              dailyLogs={data.dailyLogs}
              loggedDates={loggedDates}
              isMain={isMain}
            />
          )}
          {tab === "weekday" && (
            <WeekdayReport period={period} entries={data.salesEntries} itemRows={itemRows} isMain={isMain} />
          )}
        </div>
      )}
    </div>
  );
}
