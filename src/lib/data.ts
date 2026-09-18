import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { formatDisplay } from "./dates";
import type {
  SalesEntry,
  MenuItem,
  ItemSale,
  MonthlyAdjustment,
  DailyItemLog,
  InventoryAliasMapping,
  InventoryMaterial,
  InventoryRecipeLine,
  InventoryRecipeVersion,
  InventoryUsageEvent,
} from "./types";

// Firestore rejects `undefined` field values (e.g. an omitted optional field).
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// ---------- Sales Entries ----------

const salesCol = collection(db, "salesEntries");

export type DuplicateSalesDate = {
  date: string;
  entries: SalesEntry[];
};

// Read-only audit helper. Existing duplicates are deliberately returned intact
// so an operator can review them before any future merge or cleanup action.
export function findDuplicateSalesDates(entries: SalesEntry[]): DuplicateSalesDate[] {
  const byDate = new Map<string, SalesEntry[]>();
  for (const entry of entries) {
    const dateEntries = byDate.get(entry.date) ?? [];
    dateEntries.push(entry);
    byDate.set(entry.date, dateEntries);
  }

  return [...byDate.entries()]
    .filter(([, dateEntries]) => dateEntries.length > 1)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dateEntries]) => ({ date, entries: dateEntries }));
}

export async function resolveDuplicateSalesDate(date: string, keepId: string) {
  const entries = await listSalesEntriesByDate(date);
  const keepEntry = entries.find((entry) => entry.id === keepId);
  if (!keepEntry) throw new Error("The selected sales entry no longer exists.");
  const deleteIds = entries.filter((entry) => entry.id !== keepId).map((entry) => entry.id);
  if (deleteIds.length === 0) return { keptId: keepId, deletedIds: [] };

  const batch = writeBatch(db);
  for (const id of deleteIds) batch.delete(doc(db, "salesEntries", id));
  await batch.commit();
  return { keptId: keepId, deletedIds: deleteIds };
}

export async function listSalesEntries(): Promise<SalesEntry[]> {
  const snap = await getDocs(query(salesCol, orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SalesEntry, "id">) }));
}

type SalesEntryInput = Omit<SalesEntry, "id" | "total" | "createdAt"> & { id?: string };

async function writeSalesEntry(entry: SalesEntryInput, id: string, isNew: boolean) {
  const { id: _inputId, ...rest } = entry;
  const total = entry.bca + entry.cash + entry.soundbox + entry.other;
  await setDoc(
    doc(db, "salesEntries", id),
    omitUndefined({ ...rest, total, ...(isNew ? { createdAt: Date.now() } : {}) }),
    { merge: true }
  );
  return id;
}

export async function upsertSalesEntry(
  entry: SalesEntryInput
) {
  if (entry.id) {
    const sameDateEntries = await listSalesEntriesByDate(entry.date);
    const conflictingEntry = sameDateEntries.find((candidate) => candidate.id !== entry.id);
    if (conflictingEntry) {
      throw new Error(`A sales entry already exists for ${formatDisplay(entry.date)}. Edit that entry instead.`);
    }
    return writeSalesEntry(entry, entry.id, false);
  }

  const existing = await listSalesEntriesByDate(entry.date);
  return writeSalesEntry(entry, existing[0]?.id ?? `sales-${entry.date}`, existing.length === 0);
}

export async function deleteSalesEntry(id: string) {
  await deleteDoc(doc(db, "salesEntries", id));
}

export async function getSalesEntryByDate(date: string): Promise<SalesEntry | null> {
  const entries = await listSalesEntriesByDate(date);
  return entries[0] ?? null;
}

export async function listSalesEntriesByDate(date: string): Promise<SalesEntry[]> {
  const snap = await getDocs(query(salesCol, where("date", "==", date)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SalesEntry, "id">) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Scanner revenue is submitted as one complete record for a calendar date.
// It follows the same canonical date identity as manual saves. Existing
// records are updated; new records use a deterministic id.
export async function upsertSalesEntryByDate(
  entry: SalesEntryInput
) {
  const existing = await listSalesEntriesByDate(entry.date);
  return writeSalesEntry(entry, existing[0]?.id ?? `sales-${entry.date}`, existing.length === 0);
}

// ---------- Monthly Adjustments (bank reconciliation "selisih") ----------
// One doc per month, id = month ("YYYY-MM"). Deliberately separate from
// salesEntries so it never flows into daily totals, charts, or per-day stats.

const adjustmentsCol = collection(db, "monthlyAdjustments");

export async function listMonthlyAdjustments(): Promise<MonthlyAdjustment[]> {
  const snap = await getDocs(query(adjustmentsCol, orderBy("month", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MonthlyAdjustment, "id">) }));
}

export async function upsertMonthlyAdjustment(month: string, amount: number, note?: string) {
  await setDoc(
    doc(db, "monthlyAdjustments", month),
    omitUndefined({ month, amount, note, createdAt: Date.now() }),
    { merge: true }
  );
}

// ---------- Menu Items ----------

const itemsCol = collection(db, "menuItems");

export async function listMenuItems(): Promise<MenuItem[]> {
  const snap = await getDocs(query(itemsCol, orderBy("name", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }));
}

export async function upsertMenuItem(
  item: Omit<MenuItem, "id" | "createdAt"> & { id?: string }
) {
  if (item.id) {
    const { id, ...rest } = item;
    await setDoc(doc(db, "menuItems", id), omitUndefined(rest), { merge: true });
    return id;
  }
  const rest = { ...item };
  delete rest.id;
  const ref = await addDoc(itemsCol, omitUndefined({ ...rest, createdAt: Date.now() }));
  return ref.id;
}

export async function deleteMenuItem(id: string) {
  await deleteDoc(doc(db, "menuItems", id));
}

// ---------- Item Sales ----------

const itemSalesCol = collection(db, "itemSales");

// ---------- Daily Item Logs ----------
// The document id is the canonical date, so saving a day is idempotent and
// cannot create a second daily log for the same date.

const dailyItemLogsCol = collection(db, "dailyItemLogs");

function mapDailyItemLog(id: string, data: Record<string, unknown>): DailyItemLog {
  return { id, ...(data as Omit<DailyItemLog, "id">) };
}

export async function getDailyItemLog(date: string): Promise<DailyItemLog | null> {
  const snap = await getDoc(doc(db, "dailyItemLogs", date));
  return snap.exists() ? mapDailyItemLog(snap.id, snap.data()) : null;
}

export async function listDailyItemLogs(
  startDate?: string,
  endDate?: string
): Promise<DailyItemLog[]> {
  const constraints: QueryConstraint[] = [];
  if (startDate) constraints.push(where("date", ">=", startDate));
  if (endDate) constraints.push(where("date", "<=", endDate));
  constraints.push(orderBy("date", "desc"));

  const snap = await getDocs(query(dailyItemLogsCol, ...constraints));
  return snap.docs.map((d) => mapDailyItemLog(d.id, d.data()));
}

export async function upsertDailyItemLog(
  log: Omit<DailyItemLog, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
  }
) {
  const id = log.date;
  const now = Date.now();
  const { id: inputId, createdAt, updatedAt, ...rest } = log;
  const payload: Record<string, unknown> = { ...rest, updatedAt: updatedAt ?? now };

  // Preserve createdAt on updates through merge. New logs receive it without
  // requiring an extra read.
  if (createdAt !== undefined) payload.createdAt = createdAt;
  else if (!inputId) payload.createdAt = now;

  await setDoc(doc(db, "dailyItemLogs", id), omitUndefined(payload), { merge: true });
  return id;
}

export async function listItemSales(): Promise<ItemSale[]> {
  const snap = await getDocs(query(itemSalesCol, orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ItemSale, "id">) }));
}

export async function listItemSalesByDate(date: string): Promise<ItemSale[]> {
  const snap = await getDocs(query(itemSalesCol, where("date", "==", date)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ItemSale, "id">) }));
}

export async function upsertItemSale(
  sale: Omit<ItemSale, "id" | "createdAt"> & { id?: string }
) {
  if (sale.id) {
    const { id, ...rest } = sale;
    await setDoc(doc(db, "itemSales", id), omitUndefined(rest), { merge: true });
    return id;
  }
  const rest = { ...sale };
  delete rest.id;
  const ref = await addDoc(itemSalesCol, omitUndefined({ ...rest, createdAt: Date.now() }));
  return ref.id;
}

export async function deleteItemSale(id: string) {
  await deleteDoc(doc(db, "itemSales", id));
}

export type LegacyItemSalesMigrationResult = {
  datesFound: number;
  datesMigrated: number;
  datesSkipped: number;
  rowsMigrated: number;
  dryRun: boolean;
};

// Non-destructive migration helper for the eventual one-time data cleanup.
// Existing daily logs win, duplicate legacy rows are summed by date/item, and
// the legacy itemSales documents are never deleted.
export async function migrateLegacyItemSalesToDailyLogs(options?: {
  dryRun?: boolean;
}): Promise<LegacyItemSalesMigrationResult> {
  const dryRun = options?.dryRun ?? true;
  const [legacySales, existingLogs] = await Promise.all([
    listItemSales(),
    listDailyItemLogs(),
  ]);
  const existingDates = new Set(existingLogs.map((log) => log.date));
  const grouped = new Map<string, { quantities: Record<string, number>; createdAt: number }>();

  for (const sale of legacySales) {
    const day = grouped.get(sale.date) ?? { quantities: {}, createdAt: sale.createdAt ?? Date.now() };
    day.quantities[sale.itemId] = (day.quantities[sale.itemId] ?? 0) + sale.qty;
    day.createdAt = Math.min(day.createdAt, sale.createdAt ?? day.createdAt);
    grouped.set(sale.date, day);
  }

  let datesMigrated = 0;
  let datesSkipped = 0;
  let rowsMigrated = 0;
  for (const [date, group] of grouped) {
    if (existingDates.has(date)) {
      datesSkipped += 1;
      continue;
    }

    const rows = Object.entries(group.quantities).filter(([, qty]) => Number.isFinite(qty) && qty > 0);
    rowsMigrated += rows.length;
    if (dryRun) continue;

    await upsertDailyItemLog({
      id: date,
      date,
      quantities: Object.fromEntries(rows),
      totalQty: rows.reduce((total, [, qty]) => total + qty, 0),
      status: "complete",
      source: "manual",
      createdAt: group.createdAt,
    });
    datesMigrated += 1;
  }

  return {
    datesFound: grouped.size,
    datesMigrated,
    datesSkipped,
    rowsMigrated,
    dryRun,
  };
}

// ---------- Inventory foundation and usage ----------
// Phase 1 stores reviewed foundation records. Phase 2 adds calculated usage
// events only; these records never mutate stock balances or legacy sales data.

const inventoryMaterialsCol = collection(db, "inventoryMaterials");
const inventoryAliasesCol = collection(db, "inventoryAliasMappings");
const inventoryRecipesCol = collection(db, "inventoryRecipeVersions");
const inventoryRecipeLinesCol = collection(db, "inventoryRecipeLines");
const inventoryUsageEventsCol = collection(db, "inventoryUsageEvents");

function mapInventoryMaterial(id: string, data: Record<string, unknown>): InventoryMaterial {
  return { id, ...(data as Omit<InventoryMaterial, "id">) };
}

function mapInventoryAlias(id: string, data: Record<string, unknown>): InventoryAliasMapping {
  return { id, ...(data as Omit<InventoryAliasMapping, "id">) };
}

function mapInventoryRecipe(id: string, data: Record<string, unknown>): InventoryRecipeVersion {
  return { id, ...(data as Omit<InventoryRecipeVersion, "id">) };
}

function mapInventoryRecipeLine(id: string, data: Record<string, unknown>): InventoryRecipeLine {
  return { id, ...(data as Omit<InventoryRecipeLine, "id">) };
}

export async function listInventoryMaterials(): Promise<InventoryMaterial[]> {
  const snap = await getDocs(query(inventoryMaterialsCol, orderBy("name", "asc")));
  return snap.docs.map((d) => mapInventoryMaterial(d.id, d.data()));
}

export async function upsertInventoryMaterial(
  material: Omit<InventoryMaterial, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: number;
  }
) {
  const now = Date.now();
  const { id: inputId, createdAt, ...rest } = material;
  const payload: Record<string, unknown> = { ...rest, updatedAt: now };
  if (createdAt !== undefined) payload.createdAt = createdAt;

  if (inputId) {
    await setDoc(doc(db, "inventoryMaterials", inputId), omitUndefined(payload), { merge: true });
    return inputId;
  }

  const ref = await addDoc(inventoryMaterialsCol, omitUndefined({ ...payload, createdAt: now }));
  return ref.id;
}

export async function listInventoryAliasMappings(): Promise<InventoryAliasMapping[]> {
  const snap = await getDocs(query(inventoryAliasesCol, orderBy("sourceLabel", "asc")));
  return snap.docs.map((d) => mapInventoryAlias(d.id, d.data()));
}

export async function upsertInventoryAliasMapping(
  mapping: Omit<InventoryAliasMapping, "id" | "createdAt" | "updatedAt"> & {
    id: string;
    createdAt?: number;
  }
) {
  const now = Date.now();
  const { id, createdAt, ...rest } = mapping;
  await setDoc(
    doc(db, "inventoryAliasMappings", id),
    omitUndefined({ ...rest, updatedAt: now, createdAt: createdAt ?? now }),
    { merge: true }
  );
  return id;
}

export async function listInventoryRecipeVersions(): Promise<InventoryRecipeVersion[]> {
  const snap = await getDocs(inventoryRecipesCol);
  return snap.docs
    .map((d) => mapInventoryRecipe(d.id, d.data()))
    .sort((a, b) => a.targetName.localeCompare(b.targetName) || b.version - a.version);
}

export async function listInventoryRecipeLines(): Promise<InventoryRecipeLine[]> {
  const snap = await getDocs(inventoryRecipeLinesCol);
  return snap.docs
    .map((d) => mapInventoryRecipeLine(d.id, d.data()))
    .sort((a, b) => a.recipeId.localeCompare(b.recipeId) || a.ingredientName.localeCompare(b.ingredientName));
}

export async function saveInventoryRecipeVersion(
  recipe: InventoryRecipeVersion,
  lines: InventoryRecipeLine[],
  options?: { deleteLineIds?: string[] }
) {
  const batch = writeBatch(db);
  const now = Date.now();
  const recipePayload = { ...recipe, updatedAt: now };
  batch.set(doc(db, "inventoryRecipeVersions", recipe.id), omitUndefined(recipePayload), { merge: true });

  for (const line of lines) {
    batch.set(
      doc(db, "inventoryRecipeLines", line.id),
      omitUndefined({ ...line, recipeId: recipe.id, updatedAt: now }),
      { merge: true }
    );
  }

  for (const lineId of options?.deleteLineIds ?? []) {
    batch.delete(doc(db, "inventoryRecipeLines", lineId));
  }

  await batch.commit();
}

export type InventoryFoundationCommit = {
  materials: InventoryMaterial[];
  aliases: InventoryAliasMapping[];
  recipes: Array<{ recipe: InventoryRecipeVersion; lines: InventoryRecipeLine[] }>;
};

// The import preview is intentionally committed in one batch. The first
// rollout is small enough to stay well below Firestore's batch limit and this
// avoids charging one write round-trip per source row.
export async function commitInventoryFoundation(input: InventoryFoundationCommit) {
  const batch = writeBatch(db);
  const now = Date.now();

  for (const material of input.materials) {
    batch.set(
      doc(db, "inventoryMaterials", material.id),
      omitUndefined({ ...material, updatedAt: now }),
      { merge: true }
    );
  }
  for (const alias of input.aliases) {
    batch.set(
      doc(db, "inventoryAliasMappings", alias.id),
      omitUndefined({ ...alias, updatedAt: now }),
      { merge: true }
    );
  }
  for (const { recipe, lines } of input.recipes) {
    batch.set(
      doc(db, "inventoryRecipeVersions", recipe.id),
      omitUndefined({ ...recipe, updatedAt: now }),
      { merge: true }
    );
    for (const line of lines) {
      batch.set(
        doc(db, "inventoryRecipeLines", line.id),
        omitUndefined({ ...line, recipeId: recipe.id, updatedAt: now }),
        { merge: true }
      );
    }
  }

  await batch.commit();
}

function mapInventoryUsageEvent(id: string, data: Record<string, unknown>): InventoryUsageEvent {
  return { id, ...(data as Omit<InventoryUsageEvent, "id">) };
}

export async function getInventoryUsageEvent(date: string): Promise<InventoryUsageEvent | null> {
  const snap = await getDoc(doc(db, "inventoryUsageEvents", `usage-${date}`));
  return snap.exists() ? mapInventoryUsageEvent(snap.id, snap.data()) : null;
}

export async function listInventoryUsageEvents(
  startDate?: string,
  endDate?: string
): Promise<InventoryUsageEvent[]> {
  const constraints: QueryConstraint[] = [];
  if (startDate) constraints.push(where("sourceDate", ">=", startDate));
  if (endDate) constraints.push(where("sourceDate", "<=", endDate));
  constraints.push(orderBy("sourceDate", "desc"));

  const snap = await getDocs(query(inventoryUsageEventsCol, ...constraints));
  return snap.docs.map((d) => mapInventoryUsageEvent(d.id, d.data()));
}

// Replacement semantics are intentional. The date-derived document ID means
// recalculating a saved day replaces the prior calculation instead of adding a
// second event. This is a usage audit record, not an inventory movement.
export async function upsertInventoryUsageEvent(event: InventoryUsageEvent) {
  await setDoc(doc(db, "inventoryUsageEvents", event.id), omitUndefined(event));
  return event.id;
}
