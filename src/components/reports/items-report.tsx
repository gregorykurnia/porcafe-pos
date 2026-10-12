import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Soup, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCSV } from "@/lib/csv";
import { formatDisplay } from "@/lib/dates";
import {
  chartLabel,
  formatQuantity,
  periodKey,
  periodLabel,
  qtyByPeriod,
  shiftCursor,
  itemDetailRows,
  itemDetailSummary,
  mainQtyInBucket,
  summarizeItemPeriod,
  topSellers,
  type Grain,
} from "@/lib/item-report";
import { formatPeriodRange, type ReportPeriod } from "@/lib/report-period";
import type { DailyItemLog, ItemSale, MenuItem } from "@/lib/types";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.18)",
  fontSize: 12,
};

const GRAIN_TABS: { key: Grain; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/**
 * The Items tab. Every card reads the shared period, except the Main navigator, which steps through
 * its own cursor on purpose.
 */
export function ItemsReport({
  period,
  today,
  menuItems,
  itemRows,
  dailyLogs,
  loggedDates,
  isMain,
}: {
  period: ReportPeriod;
  today: string;
  menuItems: MenuItem[];
  itemRows: ItemSale[];
  dailyLogs: DailyItemLog[];
  loggedDates: string[];
  isMain: (row: ItemSale) => boolean;
}) {
  const rangeLabel = formatPeriodRange(period);
  const [detailItemId, setDetailItemId] = useState("all");
  const [recapGrain, setRecapGrain] = useState<Grain>("day");
  const [recapItemId, setRecapItemId] = useState("all");
  const [navGrain, setNavGrain] = useState<Grain>("day");
  const [navCursor, setNavCursor] = useState(today);

  const summary = useMemo(
    () => summarizeItemPeriod({ rows: itemRows, loggedDates, isMain, period }),
    [isMain, itemRows, loggedDates, period]
  );
  const detailRows = useMemo(
    () => (detailItemId === "all" ? [] : itemDetailRows({ rows: itemRows, dailyLogs, itemId: detailItemId, period })),
    [dailyLogs, detailItemId, itemRows, period]
  );
  const detailSummary = useMemo(() => itemDetailSummary(detailRows), [detailRows]);
  const recapBuckets = useMemo(
    () => qtyByPeriod(
      recapItemId === "all" ? itemRows : itemRows.filter((row) => row.itemId === recapItemId),
      recapGrain,
      period
    ),
    [itemRows, period, recapGrain, recapItemId]
  );
  const sellers = useMemo(() => topSellers(itemRows, period), [itemRows, period]);
  const navKey = periodKey(navCursor, navGrain);
  const navTotal = useMemo(() => mainQtyInBucket(itemRows, isMain, navGrain, navKey), [isMain, itemRows, navGrain, navKey]);

  function exportItemDetailCSV() {
    const item = menuItems.find((menuItem) => menuItem.id === detailItemId);
    if (!item || detailRows.length === 0) return;
    const slug = item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCSV(
      `porcafe-${slug || "item"}-${period.from}-to-${period.to}.csv`,
      detailRows.map((row) => ({ date: row.date, item: item.name, qty: row.qty, status: row.status }))
    );
  }

  function exportRecapCSV() {
    downloadCSV(
      `porcafe-items-${recapGrain}-${period.from}-to-${period.to}.csv`,
      recapBuckets.map((bucket) => ({ period: periodLabel(bucket.key, recapGrain), qty: bucket.qty }))
    );
  }

  const recapTakeaway = (() => {
    const latest = recapBuckets[recapBuckets.length - 1];
    const previous = recapBuckets[recapBuckets.length - 2];
    if (!latest) return "No item sales in this period.";
    if (!previous) return `One period has ${formatQuantity(latest.qty)} portions.`;
    return latest.qty >= previous.qty
      ? `The latest period is at or above the previous period at ${formatQuantity(latest.qty)} portions.`
      : `The latest period is below the previous period at ${formatQuantity(latest.qty)} portions.`;
  })();

  const sellersTakeaway = sellers.length > 0
    ? `${sellers[0].name} leads with ${formatQuantity(sellers[0].qty)} portions.`
    : "No item sales in this period.";

  const detailName = menuItems.find((menuItem) => menuItem.id === detailItemId)?.name;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total portions</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{formatQuantity(summary.totalQty)}</p>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logged days</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{summary.loggedDays.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Includes explicit no-sales days</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Main portions per selling day</p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.averageMainQty === null ? "—" : summary.averageMainQty.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.sellingDays === 0
                ? "No Main portions in this period"
                : `${summary.sellingDays} selling ${summary.sellingDays === 1 ? "day" : "days"} with a Main sold`}
              {summary.bestMainDay && ` · Best: ${formatDisplay(summary.bestMainDay.date)}, ${formatQuantity(summary.bestMainDay.qty)}`}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top item</p>
            <p className="truncate text-lg font-semibold tracking-tight text-foreground">{summary.topItem?.name ?? "No data yet"}</p>
            <p className="text-xs text-muted-foreground">
              {summary.topItem ? `${formatQuantity(summary.topItem.qty)} portions` : "No item sales in this period"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Item detail</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">One item&apos;s quantity for every day in {rangeLabel}.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportItemDetailCSV} disabled={detailItemId === "all" || detailRows.length === 0}>
            <Download className="size-3.5" /> CSV · {rangeLabel}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="item-detail-item" className="text-xs text-muted-foreground">Item</label>
            <Select value={detailItemId} onValueChange={setDetailItemId}>
              <SelectTrigger id="item-detail-item" className="w-full sm:w-80">
                <SelectValue placeholder="Select an item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Select an item</SelectItem>
                {menuItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}{item.active === false ? " (Archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {detailItemId === "all" ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Select an item to see its quantity breakdown.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <DetailStat label="Total sold" value={formatQuantity(detailSummary.totalQty)} />
                <DetailStat label="Average / logged day" value={detailSummary.averageQty === null ? "—" : detailSummary.averageQty.toFixed(1)} />
                <DetailStat label="Sales days" value={String(detailSummary.salesDays)} />
                <DetailStat label="No-sales days" value={String(detailSummary.noSalesDays)} />
                <DetailStat label="Unlogged days" value={String(detailSummary.unloggedDays)} />
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={detailRows.map((row) => ({ label: chartLabel(row.date, "day"), qty: row.qty }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="qty" name={detailName ?? "Portions"} fill="var(--primary-brand)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
              <div className="max-h-72 overflow-y-auto rounded-xl border" role="region" tabIndex={0} aria-label="Item detail table">
                <Table className="min-w-[28rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailRows.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{formatDisplay(row.date)}</TableCell>
                        <TableCell className="text-right font-medium">{formatQuantity(row.qty)}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "Sold" ? "default" : row.status === "Not logged" ? "outline" : "secondary"}>
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Takeaway:</span> {formatQuantity(detailSummary.totalQty)} portions across {detailSummary.loggedDays} logged days, including {detailSummary.noSalesDays} no-sales days.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Soup className="size-4" />
              </span>
              <CardTitle>Main portions, stepped</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Tabs
                value={navGrain}
                onValueChange={(value) => {
                  setNavGrain(value as Grain);
                  setNavCursor(today);
                }}
              >
                <TabsList>
                  {GRAIN_TABS.map((grain) => (
                    <TabsTrigger key={grain.key} value={grain.key}>{grain.label}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {navCursor !== today && (
                <Button variant="outline" size="sm" onClick={() => setNavCursor(today)}>Today</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center gap-3">
            <p className="text-xs text-muted-foreground">This card does not follow the period. It steps through any day, week or month.</p>
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="icon-lg" onClick={() => setNavCursor((cursor) => shiftCursor(cursor, navGrain, -1))} aria-label="Previous Main portions period">
                <ChevronLeft className="size-4" />
              </Button>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{periodLabel(navKey, navGrain)}</p>
                <p className="text-5xl font-semibold tracking-tight text-foreground">
                  {formatQuantity(navTotal)} <span className="text-base font-normal text-muted-foreground">portions</span>
                </p>
              </div>
              <Button variant="outline" size="icon-lg" onClick={() => setNavCursor((cursor) => shiftCursor(cursor, navGrain, 1))} aria-label="Next Main portions period">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Trophy className="size-4" />
              </span>
              <CardTitle>Top sellers · {rangeLabel}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {sellers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No item sales in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, sellers.length * 32)}>
                <BarChart data={sellers.map((seller) => ({ name: seller.name, qty: seller.qty }))} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={160} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="qty" name="Portions" fill="var(--primary-hover)" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Takeaway:</span> {sellersTakeaway}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Recap · {rangeLabel}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={recapItemId} onValueChange={setRecapItemId}>
              <SelectTrigger size="sm" className="w-56" aria-label="Recap item filter">
                <SelectValue placeholder="All items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {menuItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportRecapCSV} disabled={recapBuckets.length === 0}>
              <Download className="size-3.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={recapGrain} onValueChange={(value) => setRecapGrain(value as Grain)}>
            <TabsList>
              <TabsTrigger value="day">By day</TabsTrigger>
              <TabsTrigger value="week">By week</TabsTrigger>
              <TabsTrigger value="month">By month</TabsTrigger>
            </TabsList>
          </Tabs>
          {recapBuckets.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No item sales in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={recapBuckets.map((bucket) => ({ label: chartLabel(bucket.key, recapGrain), qty: bucket.qty }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="qty" name="Portions" fill="var(--primary-brand)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Takeaway:</span> {recapTakeaway}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
