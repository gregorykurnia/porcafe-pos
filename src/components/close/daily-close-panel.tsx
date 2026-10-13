"use client";

import Link from "next/link";
import { Dispatch, SetStateAction } from "react";
import { Search } from "lucide-react";
import type { CloseWarning } from "@/lib/close-checks";
import type { ClosePaymentKey, ClosePaymentsText } from "@/lib/close-draft";
import { closeStatusView } from "@/lib/status";
import { cn } from "@/lib/utils";
import { idr, formatDisplay, formatTimeOfDay } from "@/lib/dates";
import type { DailyItemLog, MenuItem, SalesEntry } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/patterns/banner";
import { EmptyState, ErrorBanner, LoadingSkeleton } from "@/components/patterns/states";
import { SaveState, type SaveStateKind } from "@/components/patterns/save-state";
import { StatusChip, ToneShape, type StatusTone as ChipTone } from "@/components/patterns/status-chip";
import { DateStepper } from "@/components/fields/date-stepper";
import { MoneyInput } from "@/components/fields/money-input";
import { QuantityInput } from "@/components/fields/quantity-input";
import { RelativeSavedAt } from "@/components/state/relative-saved-at";
import { CompleteDayReview } from "@/components/close/complete-day-review";
import { CloseRecap } from "@/components/close/close-recap";

export type CloseUndo = {
  completedVersion: number;
  previousLog: DailyItemLog | null;
  previousQuantities: Record<string, string>;
  previousPayments: ClosePaymentsText;
  previousSales: SalesEntry | null;
  revenue: { salesId: string; previous: { cash: number; bca: number; soundbox: number; other: number } | null } | null;
};

export type CloseRecapState = {
  date: string;
  portions: number;
  revenue: number;
  stockStatus: string;
  undo: CloseUndo;
};

const DAILY_PAYMENT_METHODS: { key: ClosePaymentKey; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "bca", label: "BCA" },
  { key: "soundbox", label: "Soundbox" },
  { key: "other", label: "Other" },
];

export type DailyClosePanelProps = {
  confirmLeave: () => Promise<boolean>;
  activeMenuItems: MenuItem[];
  closeOnlyQuantities: boolean;
  closeQuery: string;
  closeRecap: CloseRecapState | null;
  completeReviewOpen: boolean;
  completeWarnings: CloseWarning[];
  dailyCategoryTotals: { main: number; addOn: number; other: number };
  dailyConflict: boolean;
  dailyDirty: boolean;
  dailyHasChanges: boolean;
  dailyLoadError: boolean;
  dailyLoading: boolean;
  dailyLog: DailyItemLog | null;
  dailyPayments: ClosePaymentsText;
  dailyPaymentsTotal: number;
  dailyQuantities: Record<string, string>;
  dailySaving: boolean;
  dailySections: { items: MenuItem[]; category: string }[];
  dailyTotal: number;
  date: string;
  discardDailyChanges: () => void;
  draftNotice: number | null;
  reloadLatestDaily: () => Promise<void>;
  saveDailyLog: (status: "draft" | "complete" | "no_sales", quantities?: Record<string, string>) => Promise<boolean>;
  setCloseOnlyQuantities: Dispatch<SetStateAction<boolean>>;
  setCloseQuery: Dispatch<SetStateAction<string>>;
  setCompleteReviewOpen: Dispatch<SetStateAction<boolean>>;
  setDailyLoadError: Dispatch<SetStateAction<boolean>>;
  setDailyLoadedDate: Dispatch<SetStateAction<string>>;
  setDailyPayment: (key: ClosePaymentKey, value: string) => void;
  setDailyQuantities: Dispatch<SetStateAction<Record<string, string>>>;
  setDailyRetryKey: Dispatch<SetStateAction<number>>;
  setDate: (next: string) => void;
  undoClose: () => Promise<void>;
  undoing: boolean;
};

/** A typed or stored quantity as a number. Blank or unreadable counts as 0, as the saved day does. */
function quantityOf(value: string | undefined): number {
  return parseFloat(value ?? "") || 0;
}

function formatCount(value: number): string {
  return value.toLocaleString("id-ID");
}

/**
 * One item row in sheet order: the name and its menu reference, the line amount (qty × menu price, desk and tablet only)
 * and the portions stepper. The stepper and its rules come from the shared QuantityInput.
 */
function CloseItemRow({
  item,
  quantity,
  edited,
  onQuantityChange,
}: {
  item: MenuItem;
  quantity: string;
  edited: boolean;
  onQuantityChange: (value: string) => void;
}) {
  const numeric = quantityOf(quantity);
  const lineAmount = item.price !== null && numeric > 0 ? numeric * item.price : null;

  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2 tablet:gap-4 tablet:px-6">
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2 text-body font-medium text-ink">
          {edited ? (
            <>
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn-mark" aria-hidden="true" />
              <span className="sr-only">Edited since last save: </span>
            </>
          ) : null}
          <span className="min-w-0 break-words">{item.name}</span>
        </p>
        {item.price === null ? (
          <p className="flex items-center gap-1.5 text-small font-medium text-warn">
            <ToneShape tone="warn" className="text-warn-mark" />
            Missing price reference
          </p>
        ) : (
          <p className="text-small text-ink-muted">Ref. {idr(item.price)}</p>
        )}
      </div>
      <p
        className={cn(
          "hidden w-28 shrink-0 text-right text-table tabular-nums tablet:block",
          "text-ink-muted"
        )}
      >
        {lineAmount === null ? "—" : formatCount(lineAmount)}
      </p>
      <QuantityInput
        id={`daily-quantity-${item.id}`}
        label={item.name}
        value={quantity}
        onChange={onQuantityChange}
      />
    </li>
  );
}

/**
 * The Daily close screen (DESIGN_SYSTEM §10, R3.2). One column in paper-sheet order with a summary card of portions,
 * payments, total, actions and save state. From 1024 px the summary sits beside the items. On phone a sticky totals bar
 * sits above the tab bar and holds Complete day, and the recap replaces it in place. The logic is in use-daily-close.ts.
 */
export function DailyClosePanel({
  confirmLeave,
  activeMenuItems,
  closeOnlyQuantities,
  closeQuery,
  closeRecap,
  completeReviewOpen,
  completeWarnings,
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
  date,
  discardDailyChanges,
  draftNotice,
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
  setDate,
  undoClose,
  undoing,
}: DailyClosePanelProps) {
  const showActions = activeMenuItems.length > 0 && !dailyLoading && !dailyLoadError;
  const recapShown = closeRecap !== null && closeRecap.date === date;
  const savedQuantities = dailyLog?.quantities ?? {};

  const editedCount = activeMenuItems.filter(
    (item) => quantityOf(dailyQuantities[item.id]) !== (savedQuantities[item.id] ?? 0)
  ).length;

  // The estimate uses only items that have a menu price, so it is partial when a sold item has none.
  let pricedEstimate = 0;
  let hasPricedSale = false;
  for (const item of activeMenuItems) {
    const quantity = quantityOf(dailyQuantities[item.id]);
    if (quantity > 0 && item.price !== null) {
      pricedEstimate += quantity * item.price;
      hasPricedSale = true;
    }
  }

  const dayView = closeStatusView(dailyLog?.status ?? null, { unsaved: dailyHasChanges });
  const dayTone: ChipTone = dailyHasChanges
    ? "warn"
    : dailyLog?.status === "complete"
      ? "ok"
      : dailyLog?.status === "draft"
        ? "info"
        : "neutral";

  const saveKind: SaveStateKind = dailySaving ? "saving" : dailyHasChanges ? "unsaved" : dailyLog ? "saved" : "ready";

  const portionCells = [
    { label: "Main", value: dailyCategoryTotals.main },
    { label: "Add On", value: dailyCategoryTotals.addOn },
    ...(dailyCategoryTotals.other > 0 ? [{ label: "Other", value: dailyCategoryTotals.other }] : []),
  ];

  const recap = recapShown && closeRecap ? (
    <CloseRecap
      date={closeRecap.date}
      portions={closeRecap.portions}
      revenue={closeRecap.revenue}
      stockStatus={closeRecap.stockStatus}
      undoing={undoing}
      onUndo={() => void undoClose()}
    />
  ) : null;

  function retryLoad() {
    setDailyLoadError(false);
    setDailyLoadedDate("");
    setDailyRetryKey((key) => key + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap tablet:items-center tablet:justify-between">
        <DateStepper
          id="daily-log-date"
          label="Choose close date"
          value={date}
          onChange={setDate}
          onBeforeChange={async () => !dailyDirty || (await confirmLeave())}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small text-ink-muted">
          <StatusChip tone={dayTone} header>
            {dayView.label}
          </StatusChip>
          <span>
            Source: <span className="font-medium text-ink">{dailyLog?.source === "scan" ? "Scanned" : "Manual"}</span>
          </span>
          {dailyLog ? (
            <RelativeSavedAt savedAt={dailyLog.updatedAt} prefix="Last saved" className="font-medium text-ink" />
          ) : (
            <span className="font-medium text-ink">Not saved yet</span>
          )}
        </div>
      </div>

      {dailyConflict && (
        <div role="alert">
          <Banner tone="warn" action={{ label: "Load latest", onClick: () => void reloadLatestDaily() }}>
            This day was changed on another device — reload to see the latest. Nothing was saved.
          </Banner>
        </div>
      )}

      {draftNotice !== null && (
        <Banner tone="info" action={{ label: "Discard them", onClick: discardDailyChanges }}>
          Restored unsaved entries from {formatTimeOfDay(draftNotice)}.
        </Banner>
      )}

      <div className="grid gap-5 min-[1024px]:grid-cols-[minmax(0,1fr)_340px] min-[1024px]:items-start">
        <section aria-label="Items sold" className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {dailyLoading ? (
            <LoadingSkeleton rows={5} label="Loading daily close" />
          ) : dailyLoadError ? (
            <div className="p-4">
              <ErrorBanner onRetry={retryLoad}>Couldn&apos;t load this day. Your date is still selected.</ErrorBanner>
            </div>
          ) : activeMenuItems.length === 0 ? (
            <EmptyState
              title="No active menu items"
              action={
                <Button asChild variant="secondary">
                  <Link href="/setup?tab=menu">Open Menu setup</Link>
                </Button>
              }
            >
              Add an active menu item in Setup to start logging sales.
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 tablet:px-6">
                <div className="relative min-w-0 flex-1 basis-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
                  <Input
                    aria-label="Find an item"
                    placeholder="Find an item"
                    value={closeQuery}
                    onChange={(event) => setCloseQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={closeOnlyQuantities}
                  onClick={() => setCloseOnlyQuantities((current) => !current)}
                  className="flex min-h-11 items-center gap-3 rounded-full text-body text-ink"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-fast",
                      closeOnlyQuantities ? "bg-brand-soft" : "bg-sunken"
                    )}
                  >
                    <span
                      className={cn(
                        "size-4 rounded-full transition-transform duration-fast",
                        closeOnlyQuantities ? "translate-x-5 bg-brand" : "translate-x-1 border border-line-input bg-surface"
                      )}
                    />
                  </span>
                  Only items with a quantity
                </button>
              </div>

              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_auto] gap-4 border-b border-line px-6 py-2 text-small text-ink-muted tablet:grid">
                <span>Item</span>
                <span className="text-right">Amount · Rp</span>
                <span className="justify-self-end">Portions</span>
              </div>

              {dailySections.length === 0 ? (
                <p className="px-4 py-10 text-center text-body text-ink-muted tablet:px-6">No items match. Clear the find box or the filter.</p>
              ) : (
                dailySections.map((section) => {
                  const headingId = `daily-${section.category.toLowerCase().replaceAll(" ", "-")}`;
                  const sectionPortions = section.items.reduce((total, item) => total + quantityOf(dailyQuantities[item.id]), 0);
                  return (
                    <section key={section.category} aria-labelledby={headingId} className="border-t border-line first:border-t-0">
                      <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-5 tablet:px-6">
                        <h3 id={headingId} className="text-title-3 text-ink">
                          {section.category}
                        </h3>
                        <span className="text-small text-ink-muted">{formatCount(sectionPortions)} portions</span>
                      </div>
                      <ul className="divide-y divide-line border-t border-line">
                        {section.items.map((item) => (
                          <CloseItemRow
                            key={item.id}
                            item={item}
                            quantity={dailyQuantities[item.id] ?? ""}
                            edited={dailyHasChanges && quantityOf(dailyQuantities[item.id]) !== (savedQuantities[item.id] ?? 0)}
                            onQuantityChange={(value) => setDailyQuantities((current) => ({ ...current, [item.id]: value }))}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}

              <p className="border-t border-line px-4 py-3 text-micro text-ink-muted tablet:px-6">Blank or 0 means this item did not sell.</p>
            </>
          )}
        </section>

        <section
          aria-labelledby="daily-summary-heading"
          className="overflow-hidden rounded-xl border border-line bg-surface shadow-card min-[1024px]:sticky min-[1024px]:top-6"
        >
          <div className="p-5 tablet:p-6">
            <h2 id="daily-summary-heading" className="font-display text-title-2 text-ink">
              {formatDisplay(date)}
            </h2>
            <dl className="mt-4 grid divide-x divide-line overflow-hidden rounded-md border border-line" style={{ gridTemplateColumns: `repeat(${portionCells.length}, minmax(0, 1fr))` }}>
              {portionCells.map((cell) => (
                <div key={cell.label} className="px-3 py-3 text-center">
                  <dt className="text-small text-ink-muted">{cell.label}</dt>
                  <dd className="font-display text-fig-m tabular-nums text-ink">{formatCount(cell.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-center text-small text-ink-muted">
              All items: <span className="font-semibold text-ink">{formatCount(dailyTotal)} portions</span>
            </p>
          </div>

          <div className="border-t border-line px-5 py-5 tablet:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-title-3 text-ink">Payments</h3>
              {hasPricedSale ? <span className="text-small text-ink-muted">≈ {idr(pricedEstimate)} at menu prices</span> : null}
            </div>
            <div className="mt-3 space-y-2.5">
              {DAILY_PAYMENT_METHODS.map(({ key, label }) => (
                <MoneyInput
                  key={key}
                  id={`daily-payment-${key}`}
                  label={label}
                  layout="row"
                  value={dailyPayments[key]}
                  onChange={(value) => setDailyPayment(key, value)}
                  disabled={dailyLoading}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-3 border-t border-line pt-3">
              <span className="text-table font-semibold text-ink">Total</span>
              <span className="pr-3 text-right font-display text-fig-m tabular-nums text-ink">{idr(dailyPaymentsTotal)}</span>
            </div>
            <p className="mt-2 text-micro text-ink-muted">Leave a method blank for zero. Saved together with the items.</p>
          </div>

          {showActions ? (
            <div className="border-t border-line px-5 pb-5 pt-5 tablet:px-6">
              {recap ? (
                <div className="hidden tablet:block">{recap}</div>
              ) : (
                <div className="space-y-4">
                  <div className="hidden tablet:block">
                    <Button size="lg" className="w-full" loading={dailySaving} onClick={() => setCompleteReviewOpen(true)}>
                      {dailySaving ? "Saving…" : "Complete day"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button variant="secondary" onClick={() => void saveDailyLog("draft")} disabled={dailySaving}>
                      {dailySaving ? "Saving…" : "Save draft"}
                    </Button>
                    <Button variant="ghost" onClick={() => void saveDailyLog("no_sales")} disabled={dailySaving}>
                      No sales
                    </Button>
                  </div>
                  <div className="hidden space-y-1 tablet:block">
                    <SaveState kind={saveKind} />
                    {dailyHasChanges && editedCount > 0 ? (
                      <p className="text-small text-ink-muted">
                        {editedCount === 1 ? "1 item edited" : `${editedCount} items edited`}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {showActions ? (
        <div
          className={cn(
            "sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-4 px-4 py-3 tablet:hidden",
            recapShown ? "" : "border-t border-line bg-surface shadow-raised"
          )}
        >
          {recap ? (
            recap
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-fig-m tabular-nums text-ink">{idr(dailyPaymentsTotal)}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-muted">
                  <span>{formatCount(dailyTotal)} portions</span>
                  <span aria-hidden="true">·</span>
                  <SaveState kind={saveKind} />
                </p>
              </div>
              <Button size="lg" loading={dailySaving} onClick={() => setCompleteReviewOpen(true)}>
                {dailySaving ? "Saving…" : "Complete day"}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {showActions ? (
        <CompleteDayReview
          open={completeReviewOpen}
          onOpenChange={setCompleteReviewOpen}
          date={date}
          portions={dailyTotal}
          payments={dailyPaymentsTotal}
          warnings={completeWarnings}
          busy={dailySaving}
          onConfirm={async () => {
            if (await saveDailyLog("complete")) setCompleteReviewOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
