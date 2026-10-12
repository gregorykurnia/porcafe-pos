"use client";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/state/status-badge";
import { closeStatusView } from "@/lib/status";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-dialog";
import { ScanSheet } from "@/components/close/scan-sheet/scan-sheet";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { useQueryState } from "@/hooks/use-query-state";
import { RelativeSavedAt } from "@/components/state/relative-saved-at";
import { DateStepper } from "@/components/fields/date-stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EditableItemSaleRow } from "@/components/items/editable-item-sale-row";
import { SortableHead, cmp, toggleSort, type Sort } from "@/components/sortable-head";
import { clearSessionDraft, closeDraftKey, readSessionDraft, writeSessionDraft } from "@/lib/session-draft";
import {
  closePaymentsDiffer,
  closePaymentsText,
  normalizeCloseDraft,
  parseClosePayments,
  quantitiesDiffer,
  savedClosePayments,
  type ClosePaymentsText,
  EMPTY_CLOSE_PAYMENTS_TEXT,
} from "@/lib/close-draft";
import { ConflictError, recordVersion } from "@/lib/concurrency";
import { getCloseWarnings } from "@/lib/close-checks";
import { ITEM_CATEGORIES, filterSheetItems, sortForSheet } from "@/lib/menu-sheet";
import { getCanonicalItemRows } from "@/lib/reporting";
import { CompleteDayReview } from "@/components/close/complete-day-review";
import { CloseRecap } from "@/components/close/close-recap";
import { MoneyInput } from "@/components/fields/money-input";
import {
  listMenuItems,
  getDailyItemLog,
  listDailyItemLogs,
  saveDailyClose,
  undoDailyClose,
  listItemSales,
  deleteItemSale,
  getSalesEntryByDate,
} from "@/lib/data";
import type { DailyItemLog, MenuItem, ItemSale, SalesEntry } from "@/lib/types";
import {
  todayISO,
  idr,
  toISODate,
  weekKey,
  monthKey,
  formatDisplay,
  formatDayDisplay,
  formatWeekDisplay,
  formatMonthDisplay,
  formatTimeOfDay,
  isISODate,
} from "@/lib/dates";

import { downloadCSV } from "@/lib/csv";
import { addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, parseISO } from "date-fns";
import { Download, ChevronLeft, ChevronRight, Banknote, CreditCard, QrCode, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { calculateAndPersistDailyInventoryUsage, usageStatusDeductsStock } from "@/lib/inventory-usage";

type Period = "day" | "week" | "month";
type ItemsView = "daily" | "history";

const ITEMS_VIEWS: ItemsView[] = ["daily", "history"];

function isItemsView(value: string): boolean {
  return ITEMS_VIEWS.some((view) => view === value);
}

// What a completion replaced, so Undo can put it back.
type CloseUndo = {
  completedVersion: number;
  previousLog: DailyItemLog | null;
  previousQuantities: Record<string, string>;
  previousPayments: ClosePaymentsText;
  previousSales: SalesEntry | null;
  revenue: { salesId: string; previous: { cash: number; bca: number; soundbox: number; other: number } | null } | null;
};

type CloseRecapState = {
  date: string;
  portions: number;
  revenue: number;
  stockStatus: string;
  undo: CloseUndo;
};

async function calculateSavedDailyUsage(log: DailyItemLog) {
  try {
    const event = await calculateAndPersistDailyInventoryUsage(log);
    // Only calculated usage moves stock, so only that can change reorder alerts.
    if (event && usageStatusDeductsStock(event.status)) {
      void fetch("/api/push/reorder-transition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: log.date }),
        keepalive: true,
      }).then((response) => {
        if (!response.ok) console.warn("Reorder push processing was not accepted", response.status);
      }).catch((error) => {
        console.warn("Reorder push processing could not be reached", error);
      });
    }
    if (event?.status === "needs-review") {
      toast.warning("Day saved, but inventory usage needs recipe or mapping review.");
    }
    return event;
  } catch (error) {
    console.error("Failed to calculate daily inventory usage:", error);
    toast.warning("Day saved, but the inventory usage recap could not be refreshed.");
    return null;
  }
}

const DAILY_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "bca", label: "BCA", icon: CreditCard },
  { key: "soundbox", label: "Soundbox", icon: QrCode },
  { key: "other", label: "Other", icon: Banknote },
] as const;

// The view and the close date live in the URL, so a reload or a shared link opens the same screen.
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
  const [dailyLog, setDailyLog] = useState<DailyItemLog | null>(null);
  const [dailySalesEntry, setDailySalesEntry] = useState<SalesEntry | null>(null);
  const [dailyQuantities, setDailyQuantities] = useState<Record<string, string>>({});
  const [dailyPayments, setDailyPayments] = useState<ClosePaymentsText>(EMPTY_CLOSE_PAYMENTS_TEXT);
  // The day changed on another device since it was loaded. Saving is refused until it is reloaded.
  const [dailyConflict, setDailyConflict] = useState(false);
  const [completeReviewOpen, setCompleteReviewOpen] = useState(false);
  const [closeQuery, setCloseQuery] = useState("");
  const [closeOnlyQuantities, setCloseOnlyQuantities] = useState(false);
  const [closeRecap, setCloseRecap] = useState<CloseRecapState | null>(null);
  const [undoing, setUndoing] = useState(false);

  // The completion recap disappears after 10 seconds. Undo is offered for the same window.
  useEffect(() => {
    if (!closeRecap) return;
    const timer = setTimeout(() => setCloseRecap(null), 10_000);
    return () => clearTimeout(timer);
  }, [closeRecap]);
  const [dailyLoadedDate, setDailyLoadedDate] = useState("");
  const [dailyLoadError, setDailyLoadError] = useState(false);
  const [dailyRetryKey, setDailyRetryKey] = useState(0);
  // Saved-at time of unsaved quantities restored from this browser session, if any.
  const [draftNotice, setDraftNotice] = useState<number | null>(null);
  const [dailySaving, setDailySaving] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    const timeoutMarker = "daily-log-timeout" as const;
    const timeout = new Promise<typeof timeoutMarker>((resolve) => {
      setTimeout(() => resolve(timeoutMarker), 10000);
    });

    Promise.race([Promise.all([getDailyItemLog(date), getSalesEntryByDate(date)]), timeout])
      .then((result) => {
        if (cancelled) return;
        if (result === timeoutMarker) {
          setDailyLog(null);
          setDailySalesEntry(null);
          setDailyQuantities({});
          setDailyLoadedDate(date);
          setDailyLoadError(true);
          toast.error("Loading this day timed out");
          return;
        }
        const [log, salesEntry] = result;
        const savedQuantities = log?.quantities ?? {};
        const savedPayments = savedClosePayments(salesEntry);
        // Unsaved entries from earlier in this session win over the saved day.
        const draft = readSessionDraft<unknown>(closeDraftKey(date));
        const draftValue = normalizeCloseDraft(draft?.value);
        const restore = draft && draftValue && (quantitiesDiffer(draftValue.quantities, savedQuantities) || closePaymentsDiffer(draftValue.payments, savedPayments))
          ? { ...draftValue, savedAt: draft.savedAt }
          : null;
        setDailyLog(log);
        setDailySalesEntry(salesEntry);
        setDailyLoadError(false);
        setDailyQuantities(
          restore
            ? restore.quantities
            : Object.fromEntries(Object.entries(savedQuantities).map(([itemId, value]) => [itemId, String(value)]))
        );
        setDailyPayments(restore ? restore.payments : closePaymentsText(salesEntry));
        setDailyConflict(false);
        setDraftNotice(restore?.savedAt ?? null);
        setDailyLoadedDate(date);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load daily item log:", err);
          setDailyLog(null);
          setDailySalesEntry(null);
          setDailyQuantities({});
          toast.error("Could not load this day");
          setDailyLoadedDate(date);
          setDailyLoadError(true);
        }
      })

    return () => {
      cancelled = true;
    };
  }, [date, dailyRetryKey]);

  const activeMenuItems = useMemo(
    () => menuItems.filter((item) => item.active !== false),
    [menuItems]
  );

  const dailyTotal = useMemo(
    () => Object.values(dailyQuantities).reduce((total, value) => total + (parseFloat(value) || 0), 0),
    [dailyQuantities]
  );

  const dailyCategoryTotals = useMemo(() => {
    const totals = { main: 0, addOn: 0, other: 0 };
    for (const [itemId, value] of Object.entries(dailyQuantities)) {
      const quantity = parseFloat(value) || 0;
      if (quantity <= 0) continue;

      const category = menuItems.find((item) => item.id === itemId)?.category;
      if (category === "Main") totals.main += quantity;
      else if (category === "Add On") totals.addOn += quantity;
      else totals.other += quantity;
    }
    return totals;
  }, [dailyQuantities, menuItems]);

  // Items follow the order of the paper sheet within each category. The find box and the
  // only-with-quantity toggle narrow the list without changing what is saved.
  const dailySections = useMemo(() => {
    const knownCategories = new Set<string>(ITEM_CATEGORIES);
    const sections: { category: string; items: MenuItem[] }[] = ITEM_CATEGORIES.map((category) => ({
      category,
      items: activeMenuItems.filter((item) => item.category === category),
    }));
    const otherItems = activeMenuItems.filter((item) => !knownCategories.has(item.category));
    if (otherItems.length) sections.push({ category: "Other", items: otherItems });
    const quantities = Object.fromEntries(Object.entries(dailyQuantities).map(([itemId, value]) => [itemId, parseFloat(value) || 0]));
    return sections
      .map((section) => ({
        ...section,
        items: filterSheetItems(sortForSheet(section.items), closeQuery, { onlyWithQuantity: closeOnlyQuantities, quantities }),
      }))
      .filter((section) => section.items.length > 0);
  }, [activeMenuItems, closeQuery, closeOnlyQuantities, dailyQuantities]);

  const dailyLoading = dailyLoadedDate !== date;

  const dailyHasChanges = useMemo(() => {
    const quantitiesChanged = activeMenuItems.some(
      (item) => (parseFloat(dailyQuantities[item.id] ?? "") || 0) !== (dailyLog?.quantities[item.id] ?? 0)
    );
    return quantitiesChanged || closePaymentsDiffer(dailyPayments, savedClosePayments(dailySalesEntry));
  }, [activeMenuItems, dailyLog, dailyQuantities, dailyPayments, dailySalesEntry]);

  const dailyPaymentsTotal = useMemo(() => {
    const parsed = parseClosePayments(dailyPayments);
    return parsed ? parsed.cash + parsed.bca + parsed.soundbox + parsed.other : 0;
  }, [dailyPayments]);

  const completeWarnings = useMemo(() => {
    const quantities = Object.fromEntries(Object.entries(dailyQuantities).map(([itemId, value]) => [itemId, parseFloat(value) || 0]));
    const parsed = parseClosePayments(dailyPayments);
    return getCloseWarnings({
      date,
      today: todayISO(),
      quantities,
      items: activeMenuItems.map((item) => ({ id: item.id, price: item.price })),
      payments: parsed ? parsed.cash + parsed.bca + parsed.soundbox + parsed.other : 0,
      previous: dailyLog ? { status: dailyLog.status, source: dailyLog.source, updatedAt: dailyLog.updatedAt } : null,
    });
  }, [activeMenuItems, dailyLog, dailyPayments, dailyQuantities, date]);

  async function undoClose() {
    if (!closeRecap) return;
    const { date: completedDate, undo } = closeRecap;
    setUndoing(true);
    try {
      await undoDailyClose({
        date: completedDate,
        expectedUpdatedAt: undo.completedVersion,
        previousLog: undo.previousLog,
        revenue: undo.revenue,
      });
      // A day with no saved log counts as an empty draft for stock: its earlier deduction is reversed.
      const restored: DailyItemLog = undo.previousLog ?? {
        id: completedDate,
        date: completedDate,
        quantities: {},
        totalQty: 0,
        status: "draft",
        source: "manual",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      void calculateSavedDailyUsage(restored);
      setDailyLog(undo.previousLog);
      setDailyQuantities(undo.previousQuantities);
      setDailyPayments(undo.previousPayments);
      setDailySalesEntry(undo.previousSales);
      setDailyLogs((current) =>
        (undo.previousLog ? [undo.previousLog, ...current.filter((log) => log.date !== completedDate)] : current.filter((log) => log.date !== completedDate))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      setCloseRecap(null);
      toast.success("Completion undone. The day is back as it was.");
    } catch (err) {
      if (err instanceof ConflictError) {
        toast.error(err.message);
      } else {
        console.error("Failed to undo the completed day:", err);
        toast.error("Could not undo this completion.");
      }
    } finally {
      setUndoing(false);
    }
  }

  // Unsaved quantities are guarded: leaving the day, the tab or the app asks first.
  const dailyDirty = dailyHasChanges && !dailyLoading;

  function discardDailyChanges() {
    clearSessionDraft(closeDraftKey(date));
    setDailyQuantities(
      Object.fromEntries(Object.entries(dailyLog?.quantities ?? {}).map(([itemId, value]) => [itemId, String(value)]))
    );
    setDailyPayments(closePaymentsText(dailySalesEntry));
    setDraftNotice(null);
  }

  const { confirmLeave } = useUnsavedChangesGuard({
    dirty: dailyDirty,
    message: `You have unsaved quantities for ${formatDisplay(date)}.`,
    onSave: () => saveDailyLog("draft"),
    onDiscard: discardDailyChanges,
  });

  // The scanner wrote this day's quantities and revenue. Show that day reloaded, so
  // the scanned values are what the close screen displays. Any unsaved draft for the
  // day is dropped, because the scan replaces it.
  function handleScanSaved(savedDate: string, savedLog: DailyItemLog) {
    refresh();
    clearSessionDraft(closeDraftKey(savedDate));
    setActiveView("daily");
    setDate(savedDate);
    setDailyRetryKey((key) => key + 1);
    void calculateSavedDailyUsage(savedLog);
  }

  async function switchView(view: ItemsView) {
    if (view === activeView) return;
    if (dailyDirty && !(await confirmLeave())) return;
    setActiveView(view);
  }

  // Keep unsaved quantities per date for this browser session, so a reload or an
  // accidental navigation does not lose them. Cleared once they are saved or discarded.
  useEffect(() => {
    if (dailyLoadedDate !== date || dailyLoadError) return;
    const key = closeDraftKey(date);
    if (dailyHasChanges) writeSessionDraft(key, { quantities: dailyQuantities, payments: dailyPayments });
    else clearSessionDraft(key);
  }, [dailyHasChanges, dailyLoadError, dailyLoadedDate, dailyPayments, dailyQuantities, date]);

  function setDailyPayment(key: keyof ClosePaymentsText, value: string) {
    setDailyPayments((current) => ({ ...current, [key]: value }));
  }

  // The day moved on another device. Reloading replaces the screen's values with the
  // saved day, so the next save is checked against the version now on screen.
  async function reloadLatestDaily() {
    if (dailyHasChanges) {
      const ok = await confirm({
        title: "Load the latest saved day?",
        body: "Your unsaved entries for this day will be replaced with the saved version.",
        confirmLabel: "Load latest",
        tone: "danger",
      });
      if (!ok) return;
    }
    clearSessionDraft(closeDraftKey(date));
    setDailyConflict(false);
    setDailyLoadedDate("");
    setDailyRetryKey((key) => key + 1);
  }

  // Resolves true only when the day was saved, so guards can decide whether to leave.
  async function saveDailyLog(
    status: "draft" | "complete" | "no_sales",
    quantities = dailyQuantities
  ): Promise<boolean> {
    if (activeMenuItems.length === 0) {
      toast.error("Add a menu item first");
      return false;
    }

    if (status === "no_sales" && dailyTotal > 0) {
      const ok = await confirm({
        title: "Mark this day as no sales?",
        body: "Entered quantities will be cleared.",
        confirmLabel: "Mark no sales",
        tone: "danger",
      });
      if (!ok) return false;
    }

    const nextQuantities = { ...(dailyLog?.quantities ?? {}) };
    for (const item of activeMenuItems) {
      const value = parseFloat(quantities[item.id] ?? "");
      if (status === "no_sales" || !Number.isFinite(value) || value <= 0) {
        delete nextQuantities[item.id];
      } else {
        nextQuantities[item.id] = value;
      }
    }

    const savedQuantities = status === "no_sales" ? {} : nextQuantities;

    // Payments are written only when they changed, so an untouched day keeps its revenue record as is.
    const paymentsChanged = closePaymentsDiffer(dailyPayments, savedClosePayments(dailySalesEntry));
    const parsedPayments = paymentsChanged ? parseClosePayments(dailyPayments) : null;
    if (paymentsChanged && !parsedPayments) {
      toast.error("Check the payment amounts. Use digits, for example 1.500.000 or 1,5jt.");
      return false;
    }
    const payments = parsedPayments ?? undefined;

    const beforeSave = { previousLog: dailyLog, previousQuantities: dailyQuantities, previousPayments: dailyPayments, previousSales: dailySalesEntry };
    setDailySaving(true);
    try {
      const result = await saveDailyClose({
        date,
        status,
        source: "manual",
        quantities: savedQuantities,
        payments,
        expected: {
          logUpdatedAt: dailyLog ? dailyLog.updatedAt : null,
          salesUpdatedAt: dailySalesEntry ? recordVersion(dailySalesEntry) : null,
        },
        salesEntryId: dailySalesEntry?.id ?? null,
      });
      const usage = await calculateSavedDailyUsage(result.log);
      setDailyLog(result.log);
      setDailyLogs((current) => [result.log, ...current.filter((log) => log.date !== date)].sort((a, b) => b.date.localeCompare(a.date)));
      setDailyQuantities(
        Object.fromEntries(Object.entries(result.log.quantities).map(([itemId, value]) => [itemId, String(value)]))
      );
      if (payments) {
        setDailySalesEntry(result.salesEntry);
        setDailyPayments(closePaymentsText(result.salesEntry));
      }
      setDailyConflict(false);
      setDraftNotice(null);
      if (status === "complete") {
        const revenue = payments
          ? payments.cash + payments.bca + payments.soundbox + payments.other
          : (beforeSave.previousSales?.total ?? 0);
        setCloseRecap({
          date,
          portions: result.log.totalQty,
          revenue,
          stockStatus: usage?.status === "needs-review"
            ? "stock needs review"
            : usage && usageStatusDeductsStock(usage.status) ? "stock updated" : "stock unchanged",
          undo: {
            completedVersion: result.log.updatedAt,
            previousLog: beforeSave.previousLog,
            previousQuantities: beforeSave.previousQuantities,
            previousPayments: beforeSave.previousPayments,
            previousSales: beforeSave.previousSales,
            revenue: payments && result.salesEntry
              ? { salesId: result.salesEntry.id, previous: beforeSave.previousSales ? savedClosePayments(beforeSave.previousSales) : null }
              : null,
          },
        });
      }
      toast.success(status === "no_sales" ? "No sales saved" : `Day ${status === "complete" ? "completed" : "saved"}`);
      return true;
    } catch (err) {
      if (err instanceof ConflictError) {
        setDailyConflict(true);
        toast.error(err.message);
      } else {
        console.error("Failed to save daily item log:", err);
        toast.error(err instanceof Error ? `Could not save day: ${err.message}` : "Could not save this day");
      }
      return false;
    } finally {
      setDailySaving(false);
    }
  }

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
      <PageHeader
        title="Daily close"
        description={activeView === "daily" ? "Record portions and confirm revenue for one operating day." : "Review recorded item sales."}
        actions={
          <>
        <ScanSheet menuItems={menuItems} onSaved={handleScanSaved} primary />
        {activeView === "daily" && (
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href="/reports?tab=revenue">
              <ExternalLink className="size-4" /> Open revenue
            </Link>
          </Button>
        )}
          </>
        }
      />

      {loadError && (
        <Card className="border-danger/20 bg-danger/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium text-foreground">Item data could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">Your current view and filters are preserved. Try again when the connection is available.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => refresh()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      <Tabs
        value={activeView}
        onValueChange={(value) => void switchView(value as ItemsView)}
        className="w-full"
      >
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl bg-muted/80 p-1 sm:w-fit sm:min-w-[20rem]">
          <TabsTrigger id="items-tab-daily" aria-controls="items-panel-daily" value="daily" className="rounded-lg px-3">Daily close</TabsTrigger>
          <TabsTrigger id="items-tab-history" aria-controls="items-panel-history" value="history" className="rounded-lg px-3">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeView === "history" && legacyEditable && (
        <p className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-foreground">
          {legacyOnlyDates.length} {legacyOnlyDates.length === 1 ? "date is" : "dates are"} still stored only as legacy item rows, so they stay editable here. Copy them into Daily close in{" "}
          <Link href="/setup?tab=data" className="font-medium underline underline-offset-2">Setup → Data maintenance</Link>.
        </p>
      )}

      {activeView === "daily" && (
      <div id="items-panel-daily" role="tabpanel" aria-labelledby="items-tab-daily" tabIndex={0} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateStepper
            id="daily-log-date"
            label="Choose close date"
            value={date}
            onChange={setDate}
            onBeforeChange={async () => !dailyDirty || (await confirmLeave())}
          />
        </div>

        {dailyConflict && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/25 bg-warning/10 px-4 py-2 text-sm text-warning">
            <span>This day was changed on another device — reload to see the latest. Nothing was saved.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void reloadLatestDaily()}>Load latest</Button>
          </div>
        )}

        {draftNotice !== null && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/25 bg-warning/10 px-4 py-2 text-sm text-warning">
            <span>Restored unsaved entries from {formatTimeOfDay(draftNotice)}.</span>
            <Button type="button" size="sm" variant="ghost" onClick={discardDailyChanges}>Discard them</Button>
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70">
              <div>
                <CardTitle className="text-lg">Items sold</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Enter every item sold for this operating day.</p>
              </div>
              <StatusBadge view={closeStatusView(dailyLog?.status ?? null, { unsaved: dailyHasChanges })} />
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              {dailyLoading ? (
                <div className="space-y-4" aria-label="Loading daily close">
                  {[1, 2, 3, 4, 5].map((row) => (
                    <div key={row} className="flex animate-pulse items-center justify-between gap-4 border-b border-border/60 pb-4">
                      <div className="h-4 w-2/5 rounded bg-muted" />
                      <div className="h-11 w-28 rounded-lg bg-muted" />
                    </div>
                  ))}
                </div>
              ) : dailyLoadError ? (
                <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 text-center">
                  <p className="font-medium text-foreground">Couldn&apos;t load this day</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your date is still selected. Try loading it again.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setDailyLoadError(false);
                      setDailyLoadedDate("");
                      setDailyRetryKey((key) => key + 1);
                    }}
                  >
                    <RotateCcw className="size-4" /> Retry
                  </Button>
                </div>
              ) : activeMenuItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="font-medium text-foreground">No active menu items</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add an active menu item in Setup to start logging sales.</p>
                  <Button asChild variant="outline" className="mt-4">
                    <Link href="/setup?tab=menu">Open Menu setup</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label="Find an item"
                      placeholder="Type to find…"
                      value={closeQuery}
                      onChange={(event) => setCloseQuery(event.target.value)}
                      className="h-11 max-w-xs sm:h-9"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={closeOnlyQuantities ? "secondary" : "outline"}
                      aria-pressed={closeOnlyQuantities}
                      onClick={() => setCloseOnlyQuantities((current) => !current)}
                      className="min-h-11 sm:min-h-8"
                    >
                      Only items with quantity
                    </Button>
                  </div>
                  {dailySections.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No items match. Clear the find box or the filter.</p>
                  )}
                  <div className="space-y-6">
                  {dailySections.map((section) => (
                    <section key={section.category} aria-labelledby={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}>
                      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                        <h2
                          id={`daily-${section.category.toLowerCase().replaceAll(" ", "-")}`}
                          className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
                        >
                          {section.category}
                        </h2>
                        <span className="text-xs font-medium text-muted-foreground">Qty</span>
                      </div>
                      <div className="divide-y divide-border/70">
                        {section.items.map((item) => {
                          const quantity = dailyQuantities[item.id] ?? "";
                          const numericQuantity = parseFloat(quantity) || 0;
                          return (
                            <div key={item.id} className="flex min-h-14 items-center justify-between gap-4 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground sm:text-base">{item.name}</p>
                                {item.price === null && <p className="text-xs font-medium text-warning">Missing price reference</p>}
                                {item.price !== null && <p className="text-xs text-muted-foreground">Ref. {idr(item.price)}</p>}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 sm:size-10"
                                  onClick={() => setDailyQuantities((current) => ({ ...current, [item.id]: String(Math.max(0, numericQuantity - 1)) }))}
                                  aria-label={`Decrease ${item.name} quantity`}
                                  disabled={numericQuantity === 0}
                                >
                                  −
                                </button>
                                <Input
                                  aria-label={`${item.name} quantity`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  placeholder="0"
                                  value={quantity}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    if (value === "" || /^\d*(\.\d*)?$/.test(value)) {
                                      setDailyQuantities((current) => ({ ...current, [item.id]: value }));
                                    }
                                  }}
                                  className="h-11 w-16 bg-surface text-right tabular-nums sm:w-20"
                                />
                                <button
                                  type="button"
                                  className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:size-10"
                                  onClick={() => setDailyQuantities((current) => ({ ...current, [item.id]: String(numericQuantity + 1) }))}
                                  aria-label={`Increase ${item.name} quantity`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-accent lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle className="text-lg">Day summary</CardTitle>
              <p className="text-sm text-muted-foreground">{formatDisplay(date)}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-sm font-medium text-foreground">Portion split</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-primary/10 bg-surface/70 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Main</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{dailyCategoryTotals.main}</p>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-surface/70 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Add On</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{dailyCategoryTotals.addOn}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  All items: {dailyTotal}{dailyCategoryTotals.other > 0 ? ` · Other: ${dailyCategoryTotals.other}` : ""} portions
                </p>
              </div>
              <div className="space-y-3 border-t border-primary/10 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Payments</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">{idr(dailyPaymentsTotal)}</p>
                </div>
                {DAILY_PAYMENT_METHODS.map(({ key, label }) => (
                  <MoneyInput
                    key={key}
                    id={`daily-payment-${key}`}
                    label={label}
                    value={dailyPayments[key]}
                    onChange={(value) => setDailyPayment(key, value)}
                    disabled={dailyLoading}
                  />
                ))}
                <p className="text-xs text-muted-foreground">Leave a method blank for zero. Saved together with the items.</p>
              </div>
              <div className="border-t border-primary/10 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium text-foreground">{dailyLog?.source === "scan" ? "Scanned" : "Manual"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Last saved</span>
                  {dailyLog ? <RelativeSavedAt savedAt={dailyLog.updatedAt} prefix="" className="font-medium text-foreground" /> : <span className="font-medium text-foreground">Not saved yet</span>}
                </div>
              </div>
              <Button asChild variant="outline" className="w-full border-primary/20 bg-surface text-primary hover:bg-surface-elevated">
                <Link href="/reports?tab=revenue">
                  Open revenue <ExternalLink className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {activeMenuItems.length > 0 && !dailyLoading && !dailyLoadError && (
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-y border-border bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgb(31_58_47_/_50%)] backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {closeRecap?.date === date ? (
                <CloseRecap
                  date={closeRecap.date}
                  portions={closeRecap.portions}
                  revenue={closeRecap.revenue}
                  stockStatus={closeRecap.stockStatus}
                  undoing={undoing}
                  onUndo={() => void undoClose()}
                />
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-foreground">{dailySaving ? "Saving changes…" : dailyHasChanges ? "Unsaved changes" : dailyLog ? "Saved for this day" : "Ready to close"}</p>
                    <p className="text-xs text-muted-foreground">Blank or 0 means this item did not sell.</p>
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                    <Button variant="outline" onClick={() => saveDailyLog("no_sales")} disabled={dailySaving} className="min-h-11">
                      No sales
                    </Button>
                    <Button variant="secondary" onClick={() => saveDailyLog("draft")} disabled={dailySaving} className="min-h-11">
                      {dailySaving ? "Saving…" : "Save draft"}
                    </Button>
                    <Button onClick={() => setCompleteReviewOpen(true)} disabled={dailySaving} className="min-h-11 bg-primary hover:bg-primary-hover">
                      {dailySaving ? "Saving…" : "Complete day"}
                    </Button>
                  </div>
                </>
              )}
              <CompleteDayReview
                open={completeReviewOpen}
                onOpenChange={setCompleteReviewOpen}
                warnings={completeWarnings}
                busy={dailySaving}
                onConfirm={async () => {
                  if (await saveDailyLog("complete")) setCompleteReviewOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
      )}

      {activeView === "history" && (
      /* Recent item sales */
      <Card id="items-panel-history" role="tabpanel" aria-labelledby="items-tab-history" tabIndex={0}>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>History</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{legacyEditable ? "Legacy rows can be edited until their dates are copied into Daily close. Daily close records are read-only here." : "Read-only. To change a day, open it in Daily close."}</p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              label="History period"
              value={recentFilter}
              options={[
                { value: "all", label: "All" },
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
              onChange={(value) => {
                setRecentFilter(value);
                setRecentCursor(todayISO());
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentFilter !== "all" && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button variant="outline" size="icon-lg" onClick={() => navigateRecent(-1)} aria-label="Previous history period">
                <ChevronLeft className="size-4" />
              </Button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{recentFilterLabel}</p>
                {recentCursor !== todayISO() && (
                  <Button variant="ghost" size="sm" onClick={() => setRecentCursor(todayISO())}>
                    Today
                  </Button>
                )}
              </div>
              <Button variant="outline" size="icon-lg" onClick={() => navigateRecent(1)} aria-label="Next history period">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem]">
            <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
              <Label htmlFor="history-search" className="text-xs text-muted-foreground">Search</Label>
              <Input
                id="history-search"
                aria-label="Search item history"
                placeholder="Search item or category…"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
              />
            </div>
            <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
              <Label htmlFor="history-category" className="text-xs text-muted-foreground">Category</Label>
              <Select value={historyCategory} onValueChange={setHistoryCategory}>
                <SelectTrigger id="history-category" className="w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {historyCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="history-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="history-from"
                aria-label={`History start date${historyFrom ? `: ${formatDisplay(historyFrom)}` : ""}`}
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
              />
              {historyFrom && <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(historyFrom)}</p>}
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="history-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="history-to"
                aria-label={`History end date${historyTo ? `: ${formatDisplay(historyTo)}` : ""}`}
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
              />
              {historyTo && <p className="text-xs leading-4 text-muted-foreground">{formatDayDisplay(historyTo)}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              {sortedRecentSales.length} {sortedRecentSales.length === 1 ? "entry" : "entries"}
              {historyHasFilters ? " match the current filters" : " shown"}
            </p>
            <div className="flex items-center gap-2">
              {historyHasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryCategory("all");
                    setHistoryFrom("");
                    setHistoryTo("");
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={exportHistoryCSV} disabled={sortedRecentSales.length === 0}>
                <Download className="size-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading item history…
            </div>
          ) : (
          <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Item sales history">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Date" sortKey="date" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead label="Item" sortKey="item" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead label="Category" sortKey="category" sort={saleSort} onSort={(k) => toggleSort(saleSort, k, setSaleSort)} />
                  <SortableHead
                    label="Qty"
                    sortKey="qty"
                    sort={saleSort}
                    onSort={(k) => toggleSort(saleSort, k, setSaleSort)}
                    className="text-right"
                  />
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecentSales.map((s) => (
                  <EditableItemSaleRow
                    key={s.id}
                    sale={s}
                    category={categoryByItemId.get(s.itemId) ?? s.category}
                    menuItems={menuItems}
                    onSaved={refresh}
                    onDelete={removeSale}
                    readOnly={s.id.startsWith("daily-") || !legacyEditable}
                  />
                ))}
              </TableBody>
            </Table>
            {recentFilteredSales.length === 0 && !loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {recentFilter === "all" ? "No item sales yet" : "No item sales in this period"}
              </p>
            )}
          </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
