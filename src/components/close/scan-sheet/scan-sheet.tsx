"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, RotateCcw, ScanLine, X, type LucideIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { ChangeDiff } from "@/components/change-diff";
import { useConfirm } from "@/components/confirm-dialog";
import { Banner } from "@/components/patterns/banner";
import { ToneShape } from "@/components/patterns/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CLOSE_PAYMENT_KEYS, EMPTY_CLOSE_PAYMENTS_TEXT, closePaymentsText, parseClosePayments, savedClosePayments, type ClosePaymentKey, type ClosePaymentsText } from "@/lib/close-draft";
import { ConflictError, recordVersion } from "@/lib/concurrency";
import { formatDisplay, idr, todayISO } from "@/lib/dates";
import { getDailyItemLog, getSalesEntryByDate, listItemSalesByDate, replaceLegacyItemSalesForDate, saveDailyClose } from "@/lib/data";
import { normalizeScanDate, planQuantities, quantityDiffRows, rowsFromScan, scanErrorMessage, type ScanRow, type ScanSheetItem } from "@/lib/scan-review";
import { cn } from "@/lib/utils";
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

// Shown when the browser cannot decode the photo (for example HEIC on an iPhone). The old screen showed the raw browser error.
const UNSUPPORTED_PHOTO_MESSAGE =
  "This image format isn't supported. On iPhone, set Camera → Formats → Most Compatible so photos save as JPEG.";

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function loadSavedDay(date: string): Promise<SavedDay> {
  const [log, sales, legacyRows] = await Promise.all([getDailyItemLog(date), getSalesEntryByDate(date), listItemSalesByDate(date)]);
  return { log, sales, legacyRows };
}

/** One photo choice. The file input sits inside a button-styled label, so it stays keyboard reachable. */
function PhotoPicker({
  id,
  label,
  icon: Icon,
  capture,
  variant,
  onFile,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  capture?: "environment";
  variant: "primary" | "secondary";
  onFile: (file: File) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        buttonVariants({ variant, size: "lg" }),
        "w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
      )}
    >
      <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      {label}
      <input
        id={id}
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear the value so choosing the same photo again still fires a change.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
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
      const photo = await prepareSheetPhoto(file).catch(() => {
        // The browser could not decode the photo. Say so, with the iPhone fix.
        throw Object.assign(new Error(UNSUPPORTED_PHOTO_MESSAGE), { unsupported: true });
      });
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
      const unsupported = (err as { unsupported?: unknown }).unsupported === true;
      dispatch({
        type: "scan-failed",
        message: unsupported
          ? UNSUPPORTED_PHOTO_MESSAGE
          : scanErrorMessage({
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
      // One table for items and payments, so the count in the sentence covers both.
      const diffRows = [...quantityDiffRows(saved?.log?.quantities ?? {}, plan.quantities, menuItems), ...paymentRows];
      const changedCount = diffRows.filter((row) => row.current !== row.next).length;
      const ok = await confirm({
        title: `Replace the saved day for ${formatDisplay(scanDate)}?`,
        body: "The saved day will be replaced by what you reviewed from the sheet.",
        confirmLabel: changedCount > 0 ? "Replace day" : "Save anyway",
        cancelLabel: "Keep reviewing",
        tone: "danger",
        wide: true,
        details: <ChangeDiff rows={diffRows} currentLabel="Saved" nextLabel="Sheet" />,
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

  // What stops Save from going through. The button is disabled for the first four; the last three are checked on
  // click, as before, and the bar says so before the click.
  const blockers: { tone: "warn" | "danger"; text: string }[] = [];
  if (saved === null) blockers.push({ tone: "warn", text: "Could not check the saved day for this date. Choose the date again." });
  if (conflict) blockers.push({ tone: "warn", text: "This day changed on another device. Check it again before saving." });
  if (plan.unmatched.length > 0) {
    blockers.push({ tone: "danger", text: `Match ${plan.unmatched.length} ${plan.unmatched.length === 1 ? "row" : "rows"} before saving.` });
  }
  if (plan.invalid.length > 0) blockers.push({ tone: "danger", text: "Quantities must be whole numbers. Fix the highlighted rows." });
  if (Object.keys(plan.quantities).length === 0) blockers.push({ tone: "danger", text: "Nothing to save. Add at least one item." });
  if (!parseClosePayments(payments)) {
    blockers.push({ tone: "danger", text: "Check the payment amounts. Use digits, for example 1.500.000 or 1,5jt." });
  }

  const saving = machine.phase === "saving";
  const viewPhotoButton = machine.photoUrl ? (
    <button
      type="button"
      onClick={() => setViewerOpen(true)}
      className="inline-flex min-h-11 items-center gap-2.5 rounded-md text-small font-semibold text-accent underline-offset-4 hover:underline"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, not optimised by next/image */}
      <img src={machine.photoUrl} alt="" className="h-11 w-8 rounded-sm border border-line object-cover" />
      View photo
    </button>
  ) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => void handleOpenChange(next)}>
        <SheetTrigger asChild>
          <Button size="sm" variant={primary ? "primary" : "secondary"}>
            <ScanLine className="size-4" strokeWidth={1.5} aria-hidden="true" /> Scan sheet
          </Button>
        </SheetTrigger>
        {/* The screen draws its own close control, so it can be disabled while the sheet is being read or saved. */}
        <SheetContent showCloseButton={false} className="gap-5">
          <SheetHeader className="flex-row items-start justify-between gap-3 pr-0">
            <div className="min-w-0 space-y-1">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>
                {machine.phase === "idle"
                  ? "Photograph or upload the handwritten sheet. Nothing is saved until you review it."
                  : "Items and payments are saved together, after you confirm."}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-2 shrink-0"
              disabled={busy}
              aria-label={busy ? "Close (unavailable while working)" : "Close"}
              onClick={() => void handleOpenChange(false)}
            >
              <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </SheetHeader>

          <div className="space-y-6">
            {machine.phase === "idle" && (
              <div className="space-y-5">
                <p className="text-table text-ink-muted">Lay the sheet flat in good light, with all four corners showing.</p>
                <div className="grid gap-2.5">
                  <PhotoPicker
                    id="scan-take-photo"
                    label="Take a photo"
                    icon={Camera}
                    capture="environment"
                    variant="primary"
                    onFile={(file) => void choosePhoto(file)}
                  />
                  <PhotoPicker
                    id="scan-choose-image"
                    label="Choose an image"
                    icon={ImageIcon}
                    variant="secondary"
                    onFile={(file) => void choosePhoto(file)}
                  />
                </div>
              </div>
            )}

            {machine.phase === "compressing" && (
              <p role="status" aria-live="polite" className="flex items-center gap-2.5 py-4 text-title-3 text-ink">
                <Loader2 className="size-5 animate-spin text-accent" strokeWidth={1.5} aria-hidden="true" />
                Preparing the photo…
              </p>
            )}

            {machine.phase === "scanning" && (
              <div className="flex flex-col gap-5">
                <div className="space-y-2.5">
                  <p role="status" aria-live="polite" className="flex items-center gap-2.5 text-title-3 text-ink">
                    <Loader2 className="size-5 animate-spin text-accent" strokeWidth={1.5} aria-hidden="true" />
                    Reading sheet… <span className="font-normal text-ink-muted">{formatElapsed(elapsed)}</span>
                  </p>
                  <p className="text-table text-ink-muted">
                    Counting tally marks usually takes 30–60 seconds. If you cancel, the photo is kept.
                  </p>
                </div>
                <ol className="space-y-2.5 text-table">
                  <li className="flex items-center gap-2.5 text-ink">
                    <ToneShape tone="ok" className="text-ok" />
                    Photo prepared
                  </li>
                  <li className="flex items-center gap-2.5 font-medium text-ink">
                    <ToneShape tone="info" className="text-info" />
                    Reading items and payments
                  </li>
                  <li className="flex items-center gap-2.5 text-ink-muted">
                    <ToneShape tone="neutral" />
                    Review before saving
                  </li>
                </ol>
                {viewPhotoButton}
                <Button variant="secondary" className="self-start" onClick={() => abortRef.current?.abort()}>
                  Cancel scan
                </Button>
              </div>
            )}

            {machine.phase === "error" && (
              <div className="space-y-5">
                <Banner tone="danger">{machine.error}</Banner>
                {viewPhotoButton}
                <div className="grid gap-2.5">
                  <Button size="lg" className="w-full" onClick={() => void retryScan()}>
                    <RotateCcw className="size-5" strokeWidth={1.5} aria-hidden="true" /> Try again
                  </Button>
                  <PhotoPicker
                    id="scan-other-photo"
                    label="Choose another photo"
                    icon={ImageIcon}
                    variant="secondary"
                    onFile={(file) => void choosePhoto(file)}
                  />
                </div>
              </div>
            )}

            {reviewing && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[12rem] flex-1 space-y-1.5">
                    <Label htmlFor="scan-date" className="text-small font-normal text-ink-muted">Date on the sheet</Label>
                    <Input
                      id="scan-date"
                      type="date"
                      value={scanDate}
                      disabled={saving}
                      onChange={(event) => {
                        if (event.target.value) void changeScanDate(event.target.value);
                      }}
                    />
                    <p className="text-body text-ink">{formatDisplay(scanDate)}</p>
                  </div>
                  {viewPhotoButton}
                </div>

                {conflict && (
                  <div className="space-y-2.5">
                    <Banner tone="warn">
                      This day changed on another device. Nothing was saved. Check it again, then review what changes.
                    </Banner>
                    <Button variant="secondary" onClick={() => void loadDayFor(scanDate)}>
                      <RotateCcw className="size-5" strokeWidth={1.5} aria-hidden="true" /> Check again
                    </Button>
                  </div>
                )}
                {saved === null && <Banner tone="warn">Could not check the saved day for this date. Choose the date again.</Banner>}
                {replacing && (
                  <Banner tone="warn">
                    This date already has a saved day. Saving replaces its items and payments, and you will see what changes first.
                  </Banner>
                )}

                <section aria-labelledby="scan-items-heading" className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2.5">
                    <h3 id="scan-items-heading" className="text-title-3 text-ink">Items</h3>
                    <p className="text-small text-ink-muted">
                      {Object.keys(plan.quantities).length} items · {totalPortions} portions
                      {plan.unmatched.length > 0 ? (
                        <>
                          {" · "}
                          <span className="font-semibold text-danger">
                            {plan.unmatched.length} {plan.unmatched.length === 1 ? "row needs" : "rows need"} a match
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {plan.merged.length > 0 && (
                    <p className="flex items-start gap-2 text-small text-info">
                      <ToneShape tone="info" className="mt-1" />
                      Rows for {plan.merged.join(", ")} were added together.
                    </p>
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
                </section>

                <ScanPayments values={payments} hints={paymentHints} onChange={updatePayment} disabled={saving} />
              </div>
            )}
          </div>

          {reviewing && (
            <SheetFooter className="flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-raised tablet:flex-row tablet:items-center tablet:justify-between">
              <div className="min-w-0 flex-1">
                {machine.phase === "review" && blockers.length > 0 ? (
                  <ul className="space-y-1.5">
                    {blockers.map((blocker) => (
                      <li
                        key={blocker.text}
                        className={cn("flex items-start gap-2 text-small font-semibold", blocker.tone === "danger" ? "text-danger" : "text-warn")}
                      >
                        <ToneShape tone={blocker.tone} className="mt-1" />
                        {blocker.text}
                      </li>
                    ))}
                  </ul>
                ) : machine.phase === "review" ? (
                  <p className="flex items-center gap-2 text-small font-semibold text-ok">
                    <ToneShape tone="ok" />
                    Ready to save.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 tablet:flex-row">
                <Button variant="secondary" className="hidden tablet:inline-flex" disabled={saving} onClick={() => void handleOpenChange(false)}>
                  Close
                </Button>
                <Button
                  size="lg"
                  className="w-full tablet:w-auto"
                  loading={saving}
                  disabled={saving || saved === null || conflict || plan.unmatched.length > 0}
                  onClick={() => void saveScan()}
                >
                  {saving ? "Saving…" : replacing ? "Replace day" : "Save day"}
                </Button>
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      {machine.photoUrl && <PhotoViewer src={machine.photoUrl} open={viewerOpen} onOpenChange={setViewerOpen} />}
    </>
  );
}
