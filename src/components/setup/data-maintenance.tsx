"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DuplicateDatesCard } from "@/components/reports/duplicate-dates";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { StatusLine, ToneShape } from "@/components/patterns/status-chip";
import { AsyncSection, type AsyncStatus } from "@/components/state/async-section";
import { Button } from "@/components/ui/button";
import {
  findDuplicateSalesDates,
  listDailyItemLogs,
  listInventoryMaterials,
  listInventorySupplierItems,
  listInventorySuppliers,
  listItemSales,
  listSalesEntries,
  migrateLegacyItemSalesToDailyLogs,
  type LegacyItemSalesMigrationResult,
} from "@/lib/data";
import { findPreferredSupplierDisagreements, type PreferredSupplierDisagreement, type PreferredSupplierIssue } from "@/lib/preferred-supplier";
import type { DailyItemLog, InventoryMaterial, InventorySupplier, InventorySupplierItem, ItemSale, SalesEntry } from "@/lib/types";

const ISSUE_TEXT: Record<PreferredSupplierIssue, string> = {
  "missing-link": "The preferred supplier has no supplier link for this material. Add the link, or choose another preferred supplier.",
  "flag-disagrees": "A supplier link is marked preferred, but the material prefers another supplier. The material's setting is the one the app uses.",
};

/** One check: a heading, one sentence on what it checks, its status line, then its detail. Cards hold sections. */
function CheckCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card desk:p-6">
      <div>
        <h2 id={id} className="font-display text-title-2 text-ink">{title}</h2>
        <p className="mt-1 text-small text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Checks on the stored data. Data changes only when someone confirms a copy or a duplicate fix. */
export function DataMaintenance() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [itemSales, setItemSales] = useState<ItemSale[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyItemLog[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [links, setLinks] = useState<InventorySupplierItem[]>([]);
  const [migrationPreview, setMigrationPreview] = useState<LegacyItemSalesMigrationResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedEntries, loadedItemSales, loadedLogs, loadedMaterials, loadedSuppliers, loadedLinks] = await Promise.all([
        listSalesEntries(),
        listItemSales(),
        listDailyItemLogs(),
        listInventoryMaterials(),
        listInventorySuppliers(),
        listInventorySupplierItems(),
      ]);
      setEntries(loadedEntries);
      setItemSales(loadedItemSales);
      setDailyLogs(loadedLogs);
      setMaterials(loadedMaterials);
      setSuppliers(loadedSuppliers);
      setLinks(loadedLinks);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to load data checks", err);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const duplicates = useMemo(() => findDuplicateSalesDates(entries), [entries]);
  const disagreements = useMemo(() => findPreferredSupplierDisagreements(materials, links), [materials, links]);
  const supplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? "Unknown supplier";

  const dailyLogDates = new Set(dailyLogs.map((log) => log.date));
  const legacyDates = new Set(itemSales.map((sale) => sale.date));
  const legacyOnlyCount = [...legacyDates].filter((date) => !dailyLogDates.has(date)).length;
  const dailyOnlyCount = [...dailyLogDates].filter((date) => !legacyDates.has(date)).length;
  const datesToCopy = migrationPreview ? migrationPreview.datesFound - migrationPreview.datesSkipped : 0;

  async function previewMigration() {
    setPreviewing(true);
    try {
      setMigrationPreview(await migrateLegacyItemSalesToDailyLogs({ dryRun: true }));
      toast.success("Preview ready. Nothing was changed.");
    } catch (err) {
      console.error("Failed to preview the legacy copy", err);
      toast.error(err instanceof Error ? err.message : "Could not preview the copy");
    } finally {
      setPreviewing(false);
    }
  }

  async function applyMigration() {
    if (!migrationPreview || datesToCopy <= 0) return;
    const ok = await confirm({
      title: `Copy ${datesToCopy} legacy date${datesToCopy === 1 ? "" : "s"} into Daily close?`,
      body: "Existing legacy rows will be kept.",
      confirmLabel: "Copy dates",
    });
    if (!ok) return;

    setApplying(true);
    try {
      const result = await migrateLegacyItemSalesToDailyLogs({ dryRun: false });
      toast.success(`Copied ${result.datesMigrated} date${result.datesMigrated === 1 ? "" : "s"} into Daily close`);
      setMigrationPreview(null);
      void load();
    } catch (err) {
      console.error("Failed to copy legacy item sales", err);
      toast.error(err instanceof Error ? err.message : "Could not copy the legacy dates");
    } finally {
      setApplying(false);
    }
  }

  const duplicateCount = duplicates.length;
  // Legacy-only dates say whether a copy is needed, with the word, shape and tone together.
  const legacyNote = legacyOnlyCount > 0 ? (
    <span className="inline-flex items-center gap-1.5 text-warn"><ToneShape tone="warn" className="text-warn-mark" />Copy needed</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-ink-muted"><ToneShape tone="ok" className="text-ok" />None</span>
  );
  const legacyCells = [
    { label: "Daily-log dates", value: String(dailyLogDates.size), note: null },
    { label: "Legacy-only dates", value: String(legacyOnlyCount), note: legacyNote },
    { label: "Daily-only dates", value: String(dailyOnlyCount), note: null },
  ];

  const issueColumns: Column<PreferredSupplierDisagreement>[] = [
    { key: "material", label: "Material", phone: "title", cell: (item) => <span className="font-medium">{item.materialName}</span> },
    { key: "supplier", label: "Supplier", phone: "meta", cell: (item) => supplierName(item.supplierId) },
    { key: "check", label: "What to check", phone: "detail", cellClassName: "whitespace-normal", cell: (item) => ISSUE_TEXT[item.issue] },
  ];

  return (
    <AsyncSection status={status} label="Loading data checks" onRetry={() => void load()} errorTitle="Couldn't load the data checks">
      <div className="space-y-5">
        <CheckCard
          id="data-legacy-title"
          title="Legacy item sales"
          description="Older item rows from before Daily close. Copying a date creates its Daily close log. Existing logs and legacy rows are kept."
        >
          {/* Figures sit inside the check card, so they are not a second card: hairline dividers only. */}
          <dl className="grid grid-cols-3 gap-3">
            {legacyCells.map((cell) => (
              <div key={cell.label} className="min-w-0 border-l border-line pl-3 first:border-l-0 first:pl-0">
                <dt className="text-small text-ink-muted">{cell.label}</dt>
                <dd className="mt-1 font-display text-fig-m tabular-nums text-ink">{cell.value}</dd>
                {cell.note ? <dd className="mt-1 text-small">{cell.note}</dd> : null}
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void previewMigration()} disabled={previewing || applying} loading={previewing}>
              {previewing ? "Preparing preview…" : "Preview copy"}
            </Button>
            <p className="text-small text-ink-muted">Preview only. It does not write or delete data.</p>
          </div>
          {migrationPreview ? (
            <div className="space-y-3 rounded-md border border-line bg-canvas p-4">
              <h3 className="text-title-3 text-ink">Copy preview</h3>
              {datesToCopy > 0 ? (
                <>
                  <p className="text-body text-ink-muted">
                    Would copy {datesToCopy} date{datesToCopy === 1 ? "" : "s"} from {migrationPreview.rowsMigrated} legacy item row{migrationPreview.rowsMigrated === 1 ? "" : "s"}. Existing daily logs would be skipped and legacy rows would stay as they are.
                  </p>
                  <Button onClick={() => void applyMigration()} loading={applying} disabled={applying}>
                    {applying ? "Copying…" : "Copy dates into Daily close"}
                  </Button>
                </>
              ) : (
                <p className="text-body text-ink-muted">Nothing to copy. Every legacy date already has a Daily close log.</p>
              )}
            </div>
          ) : null}
        </CheckCard>

        {duplicateCount > 0 ? (
          <DuplicateDatesCard groups={duplicates} onResolved={() => void load()} />
        ) : (
          <CheckCard id="duplicate-dates-title" title="Duplicate sales dates" description="Each operating day should have one revenue record.">
            <StatusLine tone="ok">No duplicate dates.</StatusLine>
          </CheckCard>
        )}

        <CheckCard
          id="data-preferred-title"
          title="Preferred supplier check"
          description="Read-only. Each material's preferred supplier should match its supplier link. Nothing here is changed automatically."
        >
          {disagreements.length === 0 ? (
            <StatusLine tone="ok">Every preferred supplier matches its supplier link.</StatusLine>
          ) : (
            <>
              <StatusLine tone="warn">
                {disagreements.length} preferred supplier {disagreements.length === 1 ? "check" : "checks"} to review.
              </StatusLine>
              <div className="-mx-4 desk:-mx-6">
                <DataTable
                  caption="Preferred supplier disagreements"
                  columns={issueColumns}
                  rows={disagreements}
                  getKey={(item) => `${item.materialId}-${item.supplierId}-${item.issue}`}
                  density="comfortable"
                  listBelow="desk"
                />
              </div>
            </>
          )}
        </CheckCard>

        <CheckCard
          id="data-usage-title"
          title="Usage"
          description="Open a day in Usage recap and choose Recalculate day after menu items or recipes change."
        >
          <div>
            <Button asChild variant="secondary">
              <Link href="/inventory?tab=usage">Open Usage recap</Link>
            </Button>
          </div>
        </CheckCard>
      </div>
    </AsyncSection>
  );
}
