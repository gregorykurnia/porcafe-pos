"use client";

import { Suspense, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
const REPORT_TABS: ReportsTab[] = ["revenue", "items", "weekday"];

function isReportsTab(value: string): boolean {
  return REPORT_TABS.some((tab) => tab === value);
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
      <ReportsWorkspace />
    </Suspense>
  );
}

// The tab and the shared period live in the URL (?tab=, ?from=, ?to=), so a shared link opens the same report.
function ReportsWorkspace() {
  const today = todayISO();
  const [tab, setTab] = useQueryState<ReportsTab>("tab", { default: "revenue", validate: isReportsTab });
  const [from] = useQueryState("from", { default: `${monthKey(today)}-01`, validate: isISODate });
  const [to] = useQueryState("to", { default: today, validate: isISODate });
  const updateQuery = useQueryUpdate();
  const period = useMemo<ReportPeriod>(() => ({ from, to }), [from, to]);

  // Both dates change in one navigation, so neither write overwrites the other.
  const setPeriod = useCallback((next: ReportPeriod) => updateQuery({ from: next.from, to: next.to }), [updateQuery]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Revenue, items and weekday patterns for one period.</p>
      </div>

      <PeriodSelector period={period} today={today} onChange={setPeriod} />

      {!valid ? (
        <Card className="border-warning/25 bg-warning/5">
          <CardContent className="p-5 text-sm text-foreground">
            The start date must be on or before the end date.
          </CardContent>
        </Card>
      ) : data.status === "error" ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-center">
            <p className="font-medium text-foreground">Couldn&apos;t load reports</p>
            <p className="text-sm text-muted-foreground">Check the connection and try again.</p>
            <Button type="button" variant="outline" onClick={() => void data.reload()}>Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(value) => setTab(value as ReportsTab)}>
            <TabsList>
              <TabsTrigger id="reports-tab-revenue" aria-controls="reports-panel-revenue" value="revenue">Revenue</TabsTrigger>
              <TabsTrigger id="reports-tab-items" aria-controls="reports-panel-items" value="items">Items</TabsTrigger>
              <TabsTrigger id="reports-tab-weekday" aria-controls="reports-panel-weekday" value="weekday">Weekday patterns</TabsTrigger>
            </TabsList>
          </Tabs>

          {data.status === "loading" ? (
            <div className="space-y-3 rounded-xl border border-border p-4" aria-label="Loading reports">
              {[1, 2, 3].map((row) => <div key={row} className="h-10 animate-pulse rounded bg-muted" />)}
            </div>
          ) : (
            <div id={`reports-panel-${tab}`} role="tabpanel" aria-labelledby={`reports-tab-${tab}`} tabIndex={0}>
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
        </>
      )}
    </div>
  );
}
