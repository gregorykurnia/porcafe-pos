"use client";

import { useEffect, useMemo, useState, Dispatch, SetStateAction } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import { type CloseRecapState } from "@/components/close/daily-close-panel";
import { clearSessionDraft, closeDraftKey, readSessionDraft, writeSessionDraft } from "@/lib/session-draft";
import { closePaymentsDiffer, closePaymentsText, normalizeCloseDraft, parseClosePayments, quantitiesDiffer, savedClosePayments, type ClosePaymentsText, EMPTY_CLOSE_PAYMENTS_TEXT } from "@/lib/close-draft";
import { ConflictError, recordVersion } from "@/lib/concurrency";
import { getCloseWarnings } from "@/lib/close-checks";
import { ITEM_CATEGORIES, filterSheetItems, sortForSheet } from "@/lib/menu-sheet";
import { getDailyItemLog, saveDailyClose, undoDailyClose, getSalesEntryByDate } from "@/lib/data";
import type { DailyItemLog, MenuItem, SalesEntry } from "@/lib/types";
import { todayISO, formatDisplay } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { calculateAndPersistDailyInventoryUsage, usageStatusDeductsStock } from "@/lib/inventory-usage";
import type { ConfirmFn } from "@/components/confirm-dialog";

export type ItemsView = "daily" | "history";

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

export type UseDailyCloseArgs = {
  activeView: ItemsView;
  confirm: ConfirmFn;
  date: string;
  menuItems: MenuItem[];
  refresh: () => void;
  setActiveView: (next: ItemsView) => void;
  setDailyLogs: Dispatch<SetStateAction<DailyItemLog[]>>;
  setDate: (next: string) => void;
};

/**
 * The Daily close state for one day: the saved log, entries, payments, saving, undo, and the unsaved-change
 * guard. Moved out of the items page unchanged. The page passes in what it loads and what it navigates with.
 */
export function useDailyClose({
  activeView,
  confirm,
  date,
  menuItems,
  refresh,
  setActiveView,
  setDailyLogs,
  setDate,
}: UseDailyCloseArgs) {
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



  return {
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
    dailyLoadedDate,
    dailyLoading,
    dailyLog,
    dailyPayments,
    dailyPaymentsTotal,
    dailyQuantities,
    dailyRetryKey,
    dailySalesEntry,
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
    setCloseRecap,
    setCompleteReviewOpen,
    setDailyConflict,
    setDailyLoadError,
    setDailyLoadedDate,
    setDailyLog,
    setDailyPayment,
    setDailyPayments,
    setDailyQuantities,
    setDailyRetryKey,
    setDailySalesEntry,
    setDailySaving,
    setDraftNotice,
    setUndoing,
    switchView,
    undoClose,
    undoing,
  };
}
