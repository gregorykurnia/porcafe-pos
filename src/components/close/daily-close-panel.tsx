"use client";

import type { CloseWarning } from "@/lib/close-checks";
import type { ClosePaymentKey } from "@/lib/close-draft";
import { Banknote, CreditCard, QrCode } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { StatusBadge } from "@/components/state/status-badge";
import { closeStatusView } from "@/lib/status";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RelativeSavedAt } from "@/components/state/relative-saved-at";
import { DateStepper } from "@/components/fields/date-stepper";
import { type ClosePaymentsText } from "@/lib/close-draft";
import { CompleteDayReview } from "@/components/close/complete-day-review";
import { CloseRecap } from "@/components/close/close-recap";
import { MoneyInput } from "@/components/fields/money-input";
import type { DailyItemLog, MenuItem, SalesEntry } from "@/lib/types";
import { idr, formatDisplay, formatTimeOfDay } from "@/lib/dates";
import { RotateCcw, ExternalLink } from "lucide-react";

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

const DAILY_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "bca", label: "BCA", icon: CreditCard },
  { key: "soundbox", label: "Soundbox", icon: QrCode },
  { key: "other", label: "Other", icon: Banknote },
] as const;

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

/** The Daily close screen: portions, payments, the review and the day's actions. Moved out of the items page unchanged. */
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
  return (
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

          <Card className="border-primary/10 bg-brand-soft lg:sticky lg:top-24">
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
  );
}
