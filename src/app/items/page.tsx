"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/patterns/banner";
import { PageTabs } from "@/components/patterns/page-tabs";
import { ErrorBanner } from "@/components/patterns/states";
import { useConfirm } from "@/components/confirm-dialog";
import { ScanSheet } from "@/components/close/scan-sheet/scan-sheet";
import { useQueryState } from "@/hooks/use-query-state";
import { DailyClosePanel } from "@/components/close/daily-close-panel";
import { useDailyClose, type ItemsView } from "@/components/close/use-daily-close";
import { cmp, type Sort } from "@/components/sortable-head";
import { getCanonicalItemRows } from "@/lib/reporting";
import { listMenuItems, listDailyItemLogs, listItemSales, deleteItemSale } from "@/lib/data";
import type { DailyItemLog, MenuItem, ItemSale } from "@/lib/types";
import { todayISO, toISODate, weekKey, monthKey, formatDisplay, formatWeekDisplay, formatMonthDisplay, isISODate } from "@/lib/dates";

import { downloadCSV } from "@/lib/csv";
import { addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";

type Period = "day" | "week" | "month";

const ITEMS_VIEWS: ItemsView[] = ["daily", "history"];

function isItemsView(value: string): boolean {
  return ITEMS_VIEWS.some((view) => view === value);
}

// What a completion replaced, so Undo can put it back.


// The view and the close date live in the URL, so a reload or a shared link opens the same screen.
// History is loaded when the tab opens, so the Daily close screen stays light.
const ItemHistory = dynamic(() => import("@/components/items/item-history").then((module) => module.ItemHistory), {
  loading: () => <p className="py-6 text-center text-sm text-muted-foreground">Loading history…</p>,
});

export default function ItemsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
      <ItemsWorkspace />
    </Suspense>
  );
}

function ItemsWorkspace() {
  const confirm = useConfirm();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [sales, setSales] = useState<ItemSale[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyItemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeView, setActiveView] = useQueryState<ItemsView>("view", { default: "daily", validate: isItemsView });
  const [saleSort, setSaleSort] = useState<Sort<"date" | "item" | "category" | "qty">>(null);

  // Recent item sales filter
  const [recentFilter, setRecentFilter] = useState<"all" | Period>("all");
  const [recentCursor, setRecentCursor] = useState(todayISO());
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyCategory, setHistoryCategory] = useState("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // quantity entry form
  const [date, setDate] = useQueryState("date", { default: todayISO(), validate: isISODate });

  function refresh() {
    setLoading(true);
    setLoadError(false);
    Promise.all([listMenuItems(), listItemSales(), listDailyItemLogs()])
      .then(([m, s, logs]) => {
        setMenuItems(m);
        setSales(s);
        setDailyLogs(logs);
      })
      .catch((err) => {
        console.error("Failed to refresh item data:", err);
        setLoadError(true);
        toast.error("Could not refresh item data");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMenuItems(), listItemSales(), listDailyItemLogs()])
      .then(([m, s, logs]) => {
        if (cancelled) return;
        setMenuItems(m);
        setSales(s);
        setDailyLogs(logs);
        setLoadError(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load menu items:", err);
          setLoadError(true);
          toast.error("Could not load menu items");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const {
    activeMenuItems,
    closeOnlyQuantities,
    closeQuery,
    closeRecap,
    completeReviewOpen,
    completeWarnings,
    confirmLeave,
    dailyCategoryTotals,
    dailyConflict,
    dailyDirty,
    dailyHasChanges,
    dailyLoadError,
    dailyLoading,
    dailyLog,
    dailyPayments,
    dailyPaymentsTotal,
    dailyQuantities,
    dailySaving,
    dailySections,
    dailyTotal,
    discardDailyChanges,
    draftNotice,
    handleScanSaved,
    reloadLatestDaily,
    saveDailyLog,
    setCloseOnlyQuantities,
    setCloseQuery,
    setCompleteReviewOpen,
    setDailyLoadError,
    setDailyLoadedDate,
    setDailyPayment,
    setDailyQuantities,
    setDailyRetryKey,
    switchView,
    undoClose,
    undoing,
  } = useDailyClose({
    activeView,
    confirm,
    date,
    menuItems,
    refresh,
    setActiveView,
    setDailyLogs,
    setDate,
  });
  const categoryByItemId = useMemo(
    () => new Map(menuItems.map((item) => [item.id, item.category])),
    [menuItems]
  );

  const performanceSales = useMemo(
    () => getCanonicalItemRows(dailyLogs, sales, menuItems),
    [dailyLogs, menuItems, sales]
  );

  const dailyLogDates = new Set(dailyLogs.map((log) => log.date));
  const legacyItemSaleDates = new Set(sales.map((sale) => sale.date));
  const legacyOnlyDates = [...legacyItemSaleDates].filter((date) => !dailyLogDates.has(date));
  // Legacy rows stay editable only until their dates are copied into Daily close (D5).
  const legacyEditable = legacyOnlyDates.length > 0;

  async function removeSale(id: string) {
    const sale = sales.find((candidate) => candidate.id === id);
    if (!sale) return;
    const ok = await confirm({
      title: `Delete ${sale.itemName} (${sale.qty})?`,
      body: `From ${formatDisplay(sale.date)}. This cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteItemSale(id);
      toast.success("Item sale deleted");
      refresh();
    } catch (err) {
      console.error("Failed to delete item sale:", err);
      toast.error(err instanceof Error ? err.message : "Could not delete item sale");
    }
  }

  function navigateRecent(dir: 1 | -1) {
    setRecentCursor((c) => {
      const d = parseISO(c);
      if (recentFilter === "week") return toISODate(dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
      if (recentFilter === "month") return toISODate(dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
      return toISODate(dir === 1 ? addDays(d, 1) : subDays(d, 1));
    });
  }

  const recentFilteredSales = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLocaleLowerCase();
    const filtered = performanceSales.filter((sale) => {
      const category = categoryByItemId.get(sale.itemId) ?? sale.category;
      const matchesQuery =
        !normalizedQuery ||
        sale.itemName.toLocaleLowerCase().includes(normalizedQuery) ||
        category.toLocaleLowerCase().includes(normalizedQuery);
      const matchesCategory = historyCategory === "all" || category === historyCategory;
      const matchesFrom = !historyFrom || sale.date >= historyFrom;
      const matchesTo = !historyTo || sale.date <= historyTo;
      return matchesQuery && matchesCategory && matchesFrom && matchesTo;
    });

    if (recentFilter === "all") return filtered;
    const key =
      recentFilter === "day" ? recentCursor : recentFilter === "week" ? weekKey(recentCursor) : monthKey(recentCursor);
    return filtered.filter(
      (s) => (recentFilter === "day" ? s.date : recentFilter === "week" ? weekKey(s.date) : monthKey(s.date)) === key
    );
  }, [categoryByItemId, historyCategory, historyFrom, historyQuery, historyTo, performanceSales, recentCursor, recentFilter]);

  const historyCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const sale of performanceSales) categories.add(categoryByItemId.get(sale.itemId) ?? sale.category);
    return [...categories].sort();
  }, [categoryByItemId, performanceSales]);

  const historyHasFilters = Boolean(historyQuery || historyCategory !== "all" || historyFrom || historyTo);

  const recentFilterLabel = useMemo(() => {
    if (recentFilter === "all") return null;
    const key =
      recentFilter === "day" ? recentCursor : recentFilter === "week" ? weekKey(recentCursor) : monthKey(recentCursor);
    return recentFilter === "day"
      ? formatDisplay(recentCursor)
      : recentFilter === "week"
        ? formatWeekDisplay(key)
        : formatMonthDisplay(key);
  }, [recentFilter, recentCursor]);

  const sortedRecentSales = useMemo(() => {
    if (!saleSort) return recentFilteredSales;
    const { key, dir } = saleSort;
    const sorted = [...recentFilteredSales].sort((a, b) => {
      const va =
        key === "item" ? a.itemName : key === "category" ? (categoryByItemId.get(a.itemId) ?? a.category) : a[key];
      const vb =
        key === "item" ? b.itemName : key === "category" ? (categoryByItemId.get(b.itemId) ?? b.category) : b[key];
      return cmp(va, vb);
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [recentFilteredSales, saleSort, categoryByItemId]);

  function exportHistoryCSV() {
    downloadCSV(
      `porcafe-item-history-${todayISO()}.csv`,
      sortedRecentSales.map((sale) => ({
        date: sale.date,
        item: sale.itemName,
        category: categoryByItemId.get(sale.itemId) ?? sale.category,
        qty: sale.qty,
      }))
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-medium leading-[1.875rem] text-brand tablet:text-title-1">Daily close</h1>
          <p className="mt-1 text-small text-ink-muted">
            {activeView === "daily" ? "Record portions and confirm revenue for one operating day." : "Review recorded item sales."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanSheet menuItems={menuItems} onSaved={handleScanSaved} primary={false} />
          {activeView === "daily" && (
            <Button asChild variant="ghost">
              <Link href="/reports?tab=revenue">
                <ExternalLink className="size-4" aria-hidden="true" /> Open revenue
              </Link>
            </Button>
          )}
        </div>
      </header>

      {loadError && (
        <ErrorBanner onRetry={() => refresh()}>
          Item data could not be loaded. Your current view and filters are preserved. Try again when the connection is available.
        </ErrorBanner>
      )}

      <PageTabs
        label="Daily close sections"
        value={activeView}
        tabs={[
          { value: "daily", label: "Daily close" },
          { value: "history", label: "History" },
        ]}
        onChange={(value) => void switchView(value)}
      />

      {activeView === "history" && legacyEditable && (
        <Banner tone="warn">
          {legacyOnlyDates.length} {legacyOnlyDates.length === 1 ? "date is" : "dates are"} still stored only as legacy item rows, so they stay editable here. Copy them into Daily close in{" "}
          <Link href="/setup?tab=data" className="font-medium text-accent underline underline-offset-2">Setup → Data maintenance</Link>.
        </Banner>
      )}

      {activeView === "daily" && (
        <DailyClosePanel
          activeMenuItems={activeMenuItems}
          closeOnlyQuantities={closeOnlyQuantities}
          confirmLeave={confirmLeave}
          closeQuery={closeQuery}
          closeRecap={closeRecap}
          completeReviewOpen={completeReviewOpen}
          completeWarnings={completeWarnings}
          dailyCategoryTotals={dailyCategoryTotals}
          dailyConflict={dailyConflict}
          dailyDirty={dailyDirty}
          dailyHasChanges={dailyHasChanges}
          dailyLoadError={dailyLoadError}
          dailyLoading={dailyLoading}
          dailyLog={dailyLog}
          dailyPayments={dailyPayments}
          dailyPaymentsTotal={dailyPaymentsTotal}
          dailyQuantities={dailyQuantities}
          dailySaving={dailySaving}
          dailySections={dailySections}
          dailyTotal={dailyTotal}
          date={date}
          discardDailyChanges={discardDailyChanges}
          draftNotice={draftNotice}
          reloadLatestDaily={reloadLatestDaily}
          saveDailyLog={saveDailyLog}
          setCloseOnlyQuantities={setCloseOnlyQuantities}
          setCloseQuery={setCloseQuery}
          setCompleteReviewOpen={setCompleteReviewOpen}
          setDailyLoadError={setDailyLoadError}
          setDailyLoadedDate={setDailyLoadedDate}
          setDailyPayment={setDailyPayment}
          setDailyQuantities={setDailyQuantities}
          setDailyRetryKey={setDailyRetryKey}
          setDate={setDate}
          undoClose={undoClose}
          undoing={undoing}
        />
      )}

      {activeView === "history" && (
        <ItemHistory
          categoryByItemId={categoryByItemId}
          exportHistoryCSV={exportHistoryCSV}
          historyCategories={historyCategories}
          historyCategory={historyCategory}
          historyFrom={historyFrom}
          historyHasFilters={historyHasFilters}
          historyQuery={historyQuery}
          historyTo={historyTo}
          legacyEditable={legacyEditable}
          loading={loading}
          menuItems={menuItems}
          navigateRecent={navigateRecent}
          recentCursor={recentCursor}
          recentFilter={recentFilter}
          recentFilterLabel={recentFilterLabel}
          recentFilteredSales={recentFilteredSales}
          refresh={refresh}
          removeSale={removeSale}
          saleSort={saleSort}
          setHistoryCategory={setHistoryCategory}
          setHistoryFrom={setHistoryFrom}
          setHistoryQuery={setHistoryQuery}
          setHistoryTo={setHistoryTo}
          setRecentCursor={setRecentCursor}
          setRecentFilter={setRecentFilter}
          setSaleSort={setSaleSort}
          sortedRecentSales={sortedRecentSales}
        />
      )}
    </div>
  );
}
