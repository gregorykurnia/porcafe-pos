"use client";

import { useMemo, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ChangeDiff } from "@/components/change-diff";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLOSE_PAYMENT_KEYS, EMPTY_CLOSE_PAYMENTS_TEXT, closePaymentsText, parseClosePayments, savedClosePayments, type ClosePaymentKey, type ClosePaymentsText } from "@/lib/close-draft";
import { ConflictError, recordVersion } from "@/lib/concurrency";
import { formatDisplay, idr, todayISO } from "@/lib/dates";
import { getDailyItemLog, getSalesEntryByDate, listItemSalesByDate, replaceLegacyItemSalesForDate, saveDailyClose } from "@/lib/data";
import { normalizeScanDate, planQuantities, quantityDiffRows, rowsFromScan, scanErrorMessage, type ScanRow, type ScanSheetItem } from "@/lib/scan-review";
import type { DailyItemLog, ItemSale, MenuItem, SalesEntry } from "@/lib/types";
import { prepareSheetPhoto } from "./compress-image";
import { PhotoViewer } from "./photo-viewer";
import { ScanPayments } from "./scan-payments";
import { ScanReviewTable } from "./scan-review-table";
import { useScanMachine } from "./use-scan-machine";

type SavedDay = {
  log: DailyItemLog | null;
  sales: SalesEntry | null;
  legacyRows: ItemSale[];
};

type SheetReading = {
  cash: number;
  bca: number;
  soundbox: number;
};

type ScanResponse = Partial<{
  date: string | null;
  items: ScanSheetItem[];
  cash: number;
  bca: number;
  nobu: number;
  grandTotal: number | null;
}> & { error?: string };

const PAYMENT_LABELS: Record<ClosePaymentKey, string> = { cash: "Cash", bca: "BCA", soundbox: "Soundbox", other: "Other" };

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function loadSavedDay(date: string): Promise<SavedDay> {
  const [log, sales, legacyRows] = await Promise.all([getDailyItemLog(date), getSalesEntryByDate(date), listItemSalesByDate(date)]);
  return { log, sales, legacyRows };
}

/**
 * Scans the daily ticker sheet. The sheet's items and payments are reviewed on one
 * screen and saved together. Nothing is saved until the review is confirmed.
 */
export function ScanSheet({
  menuItems,
  onSaved,
  primary = false,
}: {
  menuItems: MenuItem[];
  onSaved: (savedDate: string, savedLog: DailyItemLog) => void;
  /** Filled, for the page's main action. Otherwise a quieter outline button. */
  primary?: boolean;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [machine, dispatch] = useScanMachine();
  const [scanDate, setScanDate] = useState(todayISO());
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [payments, setPayments] = useState<ClosePaymentsText>(EMPTY_CLOSE_PAYMENTS_TEXT);
  const [sheet, setSheet] = useState<SheetReading | null>(null);
  const [saved, setSaved] = useState<SavedDay | null>(null);
  // The review as first shown. Anything different from it counts as unsaved review work.
  const [seed, setSeed] = useState("");
  const [conflict, setConflict] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const rowSequence = useRef(0);
  const dayRequest = useRef(0);

  const plan = useMemo(() => planQuantities(rows, menuItems), [rows, menuItems]);
  const unmatchedIds = useMemo(() => new Set(plan.unmatched.map((row) => row.id)), [plan]);
  const invalidIds = useMemo(() => new Set(plan.invalid.map((row) => row.id)), [plan]);
  const replacing = Boolean(saved && (saved.log || saved.sales || saved.legacyRows.length > 0));
  const busy = machine.phase === "compressing" || machine.phase === "scanning" || machine.phase === "saving";
  const reviewing = machine.phase === "review" || machine.phase === "saving";
  const reviewDirty = reviewing && seed !== "" && JSON.stringify({ scanDate, rows, payments }) !== seed;
  const totalPortions = Object.values(plan.quantities).reduce((sum, qty) => sum + qty, 0);

  function newRowId() {
    rowSequence.current += 1;
    return `sheet-row-${rowSequence.current}`;
  }

  // The saved day for a date, read again when the date changes or the day conflicts.
  async function loadDayFor(date: string): Promise<SavedDay | null> {
    const request = ++dayRequest.current;
    try {
      const day = await loadSavedDay(date);
      if (request !== dayRequest.current) return null;
      setSaved(day);
      setConflict(false);
      return day;
    } catch (err) {
      console.error("Could not check the saved day:", err);
      if (request === dayRequest.current) {
        setSaved(null);
        toast.error("Could not check the saved day for this date.");
      }
      return null;
    }
  }

  async function runScan(file: File) {
    const controller = new AbortController();
    abortRef.current = controller;
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    try {
      const photo = await prepareSheetPhoto(file);
      dispatch({ type: "compressed" });
      const response = await fetch("/api/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: photo.base64,
          mediaType: photo.mediaType,
          menuItems: menuItems.map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.price, sheetAliases: item.sheetAliases ?? [] })),
        }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as ScanResponse;
      if (!response.ok || !Array.isArray(data.items)) {
        throw Object.assign(new Error(data.error ?? `Scan failed (${response.status})`), { status: response.status });
      }

      const date = normalizeScanDate(data.date, todayISO());
      const reading: SheetReading = { cash: data.cash ?? 0, bca: data.bca ?? 0, soundbox: data.nobu ?? 0 };
      const day = await loadSavedDay(date);
      const nextRows = rowsFromScan(data.items, () => newRowId());
      // Payments the sheet does not show (Other) keep the saved day's value.
      const nextPayments = closePaymentsText({ ...reading, other: day.sales?.other ?? 0 });
      setScanDate(date);
      setSheet(reading);
      setSaved(day);
      setConflict(false);
      setRows(nextRows);
      setPayments(nextPayments);
      setSeed(JSON.stringify({ scanDate: date, rows: nextRows, payments: nextPayments }));
      dispatch({ type: "scan-succeeded" });
      toast.success("Sheet read. Review before saving.");
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      dispatch({
        type: "scan-failed",
        message: scanErrorMessage({
          aborted: controller.signal.aborted,
          status: typeof status === "number" ? status : undefined,
          message: err instanceof Error ? err.message : undefined,
        }),
      });
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;
      abortRef.current = null;
    }
  }

  async function choosePhoto(file: File) {
    if (machine.photoUrl) URL.revokeObjectURL(machine.photoUrl);
    dispatch({ type: "photo-chosen", file, photoUrl: URL.createObjectURL(file) });
    await runScan(file);
  }

  async function retryScan() {
    if (!machine.file) return;
    dispatch({ type: "retry" });
    await runScan(machine.file);
  }

  async function changeScanDate(next: string) {
    setScanDate(next);
    const day = await loadDayFor(next);
    if (day) setPayments((current) => ({ ...current, other: closePaymentsText({ other: day.sales?.other ?? 0 }).other }));
  }

  function updateRow(id: string, patch: Partial<Pick<ScanRow, "menuItemId" | "qty">>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function addRow() {
    const row: ScanRow = { id: newRowId(), rawName: "", menuItemId: "", qty: "" };
    setRows((current) => [...current, row]);
  }

  function updatePayment(key: ClosePaymentKey, value: string) {
    setPayments((current) => ({ ...current, [key]: value }));
  }

  function resetScan() {
    if (machine.photoUrl) URL.revokeObjectURL(machine.photoUrl);
    dispatch({ type: "reset" });
    setRows([]);
    setPayments(EMPTY_CLOSE_PAYMENTS_TEXT);
    setSheet(null);
    setSaved(null);
    setSeed("");
    setConflict(false);
    setScanDate(todayISO());
    setViewerOpen(false);
  }

  function legacyRowsFor(quantities: Record<string, number>) {
    return Object.entries(quantities).flatMap(([itemId, qty]) => {
      const item = menuItems.find((candidate) => candidate.id === itemId);
      return item ? [{ itemId: item.id, itemName: item.name, category: item.category, qty }] : [];
    });
  }

  async function saveScan() {
    if (plan.invalid.length > 0) {
      toast.error("Quantities must be whole numbers. Fix the highlighted rows, then save.");
      return;
    }
    if (plan.unmatched.length > 0) {
      toast.error(`Choose the menu item for ${plan.unmatched.length} row${plan.unmatched.length === 1 ? "" : "s"} first.`);
      return;
    }
    if (Object.keys(plan.quantities).length === 0) {
      toast.error("Nothing to save. Add at least one item.");
      return;
    }
    const amounts = parseClosePayments(payments);
    if (!amounts) {
      toast.error("Check the payment amounts. Use digits, for example 1.500.000 or 1,5jt.");
      return;
    }

    if (replacing) {
      const savedPayments = savedClosePayments(saved?.sales ?? null);
      const paymentRows = CLOSE_PAYMENT_KEYS.map((key) => ({
        label: PAYMENT_LABELS[key],
        current: savedPayments[key],
        next: amounts[key],
        format: (value: number | string) => idr(Number(value)),
      }));
      const ok = await confirm({
        title: `Replace the saved day for ${formatDisplay(scanDate)}?`,
        body: "Only the values below will change.",
        confirmLabel: "Replace day",
        tone: "danger",
        details: (
          <div className="space-y-4">
            <ChangeDiff rows={quantityDiffRows(saved?.log?.quantities ?? {}, plan.quantities, menuItems)} currentLabel="Saved" nextLabel="Sheet" />
            <ChangeDiff rows={paymentRows} currentLabel="Saved" nextLabel="Sheet" />
          </div>
        ),
      });
      if (!ok) return;
    }

    dispatch({ type: "save-started" });
    try {
      const result = await saveDailyClose({
        date: scanDate,
        status: "complete",
        source: "scan",
        quantities: plan.quantities,
        payments: amounts,
        expected: {
          logUpdatedAt: saved?.log ? saved.log.updatedAt : null,
          salesUpdatedAt: saved?.sales ? recordVersion(saved.sales) : null,
        },
        salesEntryId: saved?.sales?.id ?? null,
      });
      try {
        await replaceLegacyItemSalesForDate(scanDate, legacyRowsFor(plan.quantities));
      } catch (err) {
        console.error("Older item rows could not be updated:", err);
        toast.warning("Day saved. The older item rows could not be updated, so check the item history.");
      }
      toast.success("Daily close saved from the sheet");
      dispatch({ type: "save-succeeded" });
      const savedDate = scanDate;
      setOpen(false);
      resetScan();
      onSaved(savedDate, result.log);
    } catch (err) {
      dispatch({ type: "save-failed" });
      if (err instanceof ConflictError) {
        setConflict(true);
        toast.error(err.message);
      } else {
        console.error("Failed to save the scanned day:", err);
        toast.error(err instanceof Error ? `Failed to save: ${err.message}` : "Failed to save");
      }
    }
  }

  // Closing mid-scan or mid-save is blocked. Closing with unsaved review work asks first.
  async function handleOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    if (busy) return;
    if (reviewDirty) {
      const ok = await confirm({
        title: "Discard this scan?",
        body: "The items and payments you reviewed will be lost.",
        confirmLabel: "Discard",
        cancelLabel: "Keep reviewing",
        tone: "danger",
      });
      if (!ok) return;
    }
    setOpen(false);
    resetScan();
  }

  const thumbnail = machine.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={machine.photoUrl} alt="Ticker sheet thumbnail" className="h-20 w-20 shrink-0 rounded-md border object-cover" />
  ) : null;

  const paymentHints: Partial<Record<ClosePaymentKey, string>> = sheet
    ? {
        cash: `Sheet reads ${idr(sheet.cash)}`,
        bca: `Sheet reads ${idr(sheet.bca)}`,
        soundbox: `Nobu on the sheet: ${idr(sheet.soundbox)}`,
        other: saved?.sales ? "Kept from the saved day" : "Not on the sheet",
      }
    : {};

  const title =
    machine.phase === "review" || machine.phase === "saving"
      ? "Review the sheet"
      : machine.phase === "error"
        ? "The scan did not finish"
        : machine.phase === "idle"
          ? "Scan daily ticker sheet"
          : "Reading the sheet";

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => void handleOpenChange(next)}>
        <DialogTrigger asChild>
          <Button size="sm" variant={primary ? "default" : "outline"} className={primary ? "bg-primary shadow-sm shadow-primary/20 hover:bg-primary-hover" : undefined}>
            <ScanLine className="size-4" /> Scan sheet
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle className="pr-8">{title}</DialogTitle>
            <DialogDescription>
              {machine.phase === "idle"
                ? "Photograph or upload the handwritten sheet. Nothing is saved until you review it."
                : "Items and payments are saved together, after you confirm."}
            </DialogDescription>
          </DialogHeader>

          {machine.phase === "idle" && (
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Choose the sheet photo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void choosePhoto(file);
              }}
            />
          )}

          {machine.phase === "compressing" && (
            <p className="py-6 text-center text-sm text-muted-foreground" aria-live="polite">Preparing the photo…</p>
          )}

          {machine.phase === "scanning" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {thumbnail}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground" aria-live="polite">Reading sheet… {formatElapsed(elapsed)}</p>
                  <p className="text-xs text-muted-foreground">Counting tally marks usually takes 30–60 seconds.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel scan</Button>
            </div>
          )}

          {machine.phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {thumbnail}
                <p role="alert" className="text-sm text-destructive">{machine.error}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void retryScan()}>Try again</Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scan-other-photo" className="text-xs text-muted-foreground">Or choose another photo</Label>
                <Input
                  id="scan-other-photo"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void choosePhoto(file);
                  }}
                />
              </div>
            </div>
          )}

          {reviewing && (
            <div className="space-y-5">
              <div className="flex gap-3">
                {machine.photoUrl && (
                  <button type="button" onClick={() => setViewerOpen(true)} className="shrink-0 rounded-md" aria-label="View the full sheet photo">
                    {thumbnail}
                  </button>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="scan-date">Date <span className="font-normal text-muted-foreground">({formatDisplay(scanDate)})</span></Label>
                  <Input
                    id="scan-date"
                    type="date"
                    value={scanDate}
                    disabled={machine.phase === "saving"}
                    onChange={(event) => {
                      if (event.target.value) void changeScanDate(event.target.value);
                    }}
                    className="h-11 sm:h-9"
                  />
                </div>
              </div>

              {conflict && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <span>This day changed on another device. Nothing was saved. Check it again, then review what changes.</span>
                  <Button size="sm" variant="outline" onClick={() => void loadDayFor(scanDate)}>Check again</Button>
                </div>
              )}
              {saved === null && (
                <p className="text-xs text-warning">Could not check the saved day for this date. Choose the date again.</p>
              )}
              {replacing && (
                <p className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
                  This date already has a saved day. Saving replaces its items and payments, and you will see what changes first.
                </p>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Items</p>
                <p className="text-xs text-muted-foreground">Check each row against the correct menu item.</p>
                {plan.merged.length > 0 && (
                  <p className="text-xs text-muted-foreground">Rows for {plan.merged.join(", ")} were added together.</p>
                )}
                <ScanReviewTable
                  rows={rows}
                  menuItems={menuItems}
                  unmatchedIds={unmatchedIds}
                  invalidIds={invalidIds}
                  onChange={updateRow}
                  onRemove={removeRow}
                  onAdd={addRow}
                />
                <p className="text-xs text-muted-foreground">
                  {Object.keys(plan.quantities).length} items · {totalPortions} portions
                  {plan.unmatched.length > 0 ? ` · ${plan.unmatched.length} row${plan.unmatched.length === 1 ? "" : "s"} need a match` : ""}
                </p>
              </div>

              <ScanPayments values={payments} hints={paymentHints} onChange={updatePayment} disabled={machine.phase === "saving"} />
            </div>
          )}

          {reviewing && (
            <DialogFooter>
              <Button variant="outline" onClick={() => void handleOpenChange(false)} disabled={machine.phase === "saving"}>
                Close
              </Button>
              <Button
                onClick={() => void saveScan()}
                disabled={machine.phase === "saving" || saved === null || conflict || plan.unmatched.length > 0}
                className="bg-primary hover:bg-primary-hover"
              >
                {machine.phase === "saving" ? "Saving…" : replacing ? "Replace day" : "Save day"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {machine.photoUrl && <PhotoViewer src={machine.photoUrl} open={viewerOpen} onOpenChange={setViewerOpen} />}
    </>
  );
}
