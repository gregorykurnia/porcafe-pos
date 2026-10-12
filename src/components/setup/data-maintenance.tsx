"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { DuplicateDatesCard } from "@/components/reports/duplicate-dates";
import { AsyncSection, type AsyncStatus } from "@/components/state/async-section";
import { Stat } from "@/components/state/stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { findPreferredSupplierDisagreements, type PreferredSupplierIssue } from "@/lib/preferred-supplier";
import type { DailyItemLog, InventoryMaterial, InventorySupplier, InventorySupplierItem, ItemSale, SalesEntry } from "@/lib/types";

const ISSUE_TEXT: Record<PreferredSupplierIssue, string> = {
  "missing-link": "The preferred supplier has no supplier link for this material. Add the link, or choose another preferred supplier.",
  "flag-disagrees": "A supplier link is marked preferred, but the material prefers another supplier. The material's setting is the one the app uses.",
};

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

  return (
    <AsyncSection status={status} label="Loading data checks" onRetry={() => void load()} errorTitle="Couldn't load the data checks">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Legacy item sales</CardTitle>
            <CardDescription>
              Older item rows from before Daily close. Copying a date creates its Daily close log. Existing logs and legacy rows are kept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Daily-log dates" value={String(dailyLogDates.size)} />
              <Stat label="Legacy-only dates" value={String(legacyOnlyCount)} tone={legacyOnlyCount > 0 ? "warning" : "default"} />
              <Stat label="Daily-only dates" value={String(dailyOnlyCount)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void previewMigration()} disabled={previewing || applying}>
                {previewing ? "Preparing preview…" : "Preview copy"}
              </Button>
              <p className="text-xs text-muted-foreground">Preview only. It does not write or delete data.</p>
            </div>
            {migrationPreview && (
              <div className="rounded-xl border border-info/20 bg-info/5 p-4 text-sm text-foreground">
                <p className="font-medium">Copy preview</p>
                {datesToCopy > 0 ? (
                  <>
                    <p className="mt-1 text-muted-foreground">
                      Would copy {datesToCopy} date{datesToCopy === 1 ? "" : "s"} from {migrationPreview.rowsMigrated} legacy item row{migrationPreview.rowsMigrated === 1 ? "" : "s"}. Existing daily logs would be skipped and legacy rows would stay as they are.
                    </p>
                    <Button type="button" className="mt-3 bg-primary hover:bg-primary-hover" onClick={() => void applyMigration()} disabled={applying}>
                      {applying ? "Copying…" : "Copy dates into Daily close"}
                    </Button>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">Nothing to copy. Every legacy date already has a Daily close log.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {duplicates.length > 0 ? (
          <DuplicateDatesCard groups={duplicates} onResolved={() => void load()} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Duplicate sales dates</CardTitle>
              <CardDescription>Each operating day should have one revenue record.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No duplicate dates.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Preferred supplier check</CardTitle>
            <CardDescription>
              Read-only. Each material&apos;s preferred supplier should match its supplier link. Nothing here is changed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {disagreements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every preferred supplier matches its supplier link.</p>
            ) : (
              <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Preferred supplier disagreements">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>What to check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disagreements.map((item) => (
                      <TableRow key={`${item.materialId}-${item.supplierId}-${item.issue}`}>
                        <TableCell className="font-medium">{item.materialName}</TableCell>
                        <TableCell>{supplierName(item.supplierId)}</TableCell>
                        <TableCell className="whitespace-normal text-sm text-muted-foreground">{ISSUE_TEXT[item.issue]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Open a day in Usage recap and choose Recalculate day after menu items or recipes change.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory?tab=usage">Open Usage recap</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AsyncSection>
  );
}
