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
  runTransaction,
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
  InventoryConsumptionEvent,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockSetup,
  InventoryUnit,
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
const inventoryMovementsCol = collection(db, "inventoryMovements");
const inventoryConsumptionEventsCol = collection(db, "inventoryConsumptionEvents");
const inventoryStockSetupRef = doc(db, "inventoryStockSetup", "default");

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

// ---------- Inventory ledger ----------

function mapInventoryMovement(id: string, data: Record<string, unknown>): InventoryMovement {
  return { id, ...(data as Omit<InventoryMovement, "id">) };
}

function mapInventoryStockSetup(data: Record<string, unknown>): InventoryStockSetup {
  return { id: "default", ...(data as Omit<InventoryStockSetup, "id">) };
}

function mapInventoryConsumptionEvent(id: string, data: Record<string, unknown>): InventoryConsumptionEvent {
  return { id, ...(data as Omit<InventoryConsumptionEvent, "id">) };
}

export async function getInventoryStockSetup(): Promise<InventoryStockSetup | null> {
  const snap = await getDoc(inventoryStockSetupRef);
  return snap.exists() ? mapInventoryStockSetup(snap.data()) : null;
}

export async function listInventoryMovements(options?: {
  materialId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<InventoryMovement[]> {
  const snap = await getDocs(query(inventoryMovementsCol, orderBy("createdAt", "desc")));
  return snap.docs
    .map((d) => mapInventoryMovement(d.id, d.data()))
    .filter((movement) => {
      if (options?.materialId && movement.materialId !== options.materialId) return false;
      if (options?.startDate && movement.occurredOn < options.startDate) return false;
      if (options?.endDate && movement.occurredOn > options.endDate) return false;
      return true;
    });
}

export async function getInventoryConsumptionEvent(date: string): Promise<InventoryConsumptionEvent | null> {
  const snap = await getDoc(doc(inventoryConsumptionEventsCol, `consumption-${date}`));
  return snap.exists() ? mapInventoryConsumptionEvent(snap.id, snap.data()) : null;
}

function inventoryDocPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "material";
}

export type InventoryOpeningBalanceInput = {
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
};

// Opening balances are initialized in one transaction. Deterministic movement
// IDs make a retry safe while the setup document gates the numeric dashboard.
export async function initializeInventoryOpeningBalances(
  openingDate: string,
  balances: InventoryOpeningBalanceInput[]
): Promise<InventoryStockSetup> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) {
    throw new Error("Choose a valid opening date.");
  }
  if (balances.length === 0) throw new Error("Add at least one material opening balance.");

  const materialIds = new Set<string>();
  for (const balance of balances) {
    if (materialIds.has(balance.materialId)) throw new Error("A material appears more than once in opening stock.");
    materialIds.add(balance.materialId);
    if (!balance.materialId || !balance.materialName.trim()) throw new Error("Every opening balance needs a material.");
    if (!Number.isFinite(balance.quantity) || balance.quantity < 0) throw new Error(`Opening stock for ${balance.materialName} must be zero or greater.`);
  }

  const now = Date.now();
  const setup: InventoryStockSetup = {
    id: "default",
    initialized: true,
    openingDate,
    materialCount: balances.length,
    initializedAt: now,
    updatedAt: now,
  };

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(inventoryStockSetupRef);
    if (existing.exists() && (existing.data() as Partial<InventoryStockSetup>).initialized) {
      throw new Error("Opening stock is already initialized. Use a correction movement instead.");
    }

    for (const balance of balances) {
      const movementId = `opening-${inventoryDocPart(balance.materialId)}`;
      transaction.set(
        doc(db, "inventoryMovements", movementId),
        omitUndefined({
          materialId: balance.materialId,
          materialName: balance.materialName,
          unit: balance.unit,
          quantity: balance.quantity,
          movementType: "opening_balance" satisfies InventoryMovementType,
          occurredOn: openingDate,
          reason: "Opening stock initialization",
          sourceRef: `opening-balance:${openingDate}:${balance.materialId}`,
          balanceBefore: 0,
          balanceAfter: balance.quantity,
          createdAt: now,
        }),
        { merge: true }
      );
    }
    transaction.set(inventoryStockSetupRef, omitUndefined(setup), { merge: true });
  });

  return setup;
}

export type InventoryMovementInput = {
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
  movementType: Exclude<InventoryMovementType, "opening_balance" | "recipe_consumption" | "reversal" | "stock_count">;
  occurredOn: string;
  reason: string;
  sourceRef?: string;
  notes?: string;
};

function sumInventoryMaterialMovements(movements: InventoryMovement[], materialId: string): number {
  return movements
    .filter((movement) => movement.materialId === materialId)
    .reduce((total, movement) => total + movement.quantity, 0);
}

export async function createInventoryMovement(input: InventoryMovementInput): Promise<string> {
  const setup = await getInventoryStockSetup();
  if (!setup?.initialized) throw new Error("Initialize opening stock before recording manual movements.");
  if (!input.materialId || !input.materialName.trim()) throw new Error("Choose a material.");
  if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error("Enter a non-zero movement quantity.");
  if (!input.reason.trim()) throw new Error("Add a reason for this movement.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error("Choose a valid movement date.");

  const movements = await listInventoryMovements({ materialId: input.materialId });
  const balanceBefore = sumInventoryMaterialMovements(movements, input.materialId);
  const ref = doc(inventoryMovementsCol);
  await setDoc(
    ref,
    omitUndefined({
      materialId: input.materialId,
      materialName: input.materialName,
      unit: input.unit,
      quantity: input.quantity,
      movementType: input.movementType,
      occurredOn: input.occurredOn,
      reason: input.reason.trim(),
      sourceRef: input.sourceRef ?? `manual:${ref.id}`,
      notes: input.notes?.trim(),
      balanceBefore,
      balanceAfter: balanceBefore + input.quantity,
      createdAt: Date.now(),
    })
  );
  return ref.id;
}

export type InventoryStockCountInput = {
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  observedQuantity: number;
  occurredOn: string;
  reason: string;
};

export async function recordInventoryStockCount(input: InventoryStockCountInput): Promise<string> {
  const setup = await getInventoryStockSetup();
  if (!setup?.initialized) throw new Error("Initialize opening stock before recording a stock count.");
  if (!Number.isFinite(input.observedQuantity) || input.observedQuantity < 0) throw new Error("Stock count must be zero or greater.");
  if (!input.reason.trim()) throw new Error("Add a reason for this stock count.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error("Choose a valid count date.");

  const movements = await listInventoryMovements({ materialId: input.materialId });
  const balanceBefore = sumInventoryMaterialMovements(movements, input.materialId);
  const quantity = input.observedQuantity - balanceBefore;
  const ref = doc(inventoryMovementsCol);
  await setDoc(
    ref,
    omitUndefined({
      materialId: input.materialId,
      materialName: input.materialName,
      unit: input.unit,
      quantity,
      movementType: "stock_count" satisfies InventoryMovementType,
      occurredOn: input.occurredOn,
      reason: input.reason.trim(),
      sourceRef: `stock-count:${input.occurredOn}:${ref.id}`,
      observedQuantity: input.observedQuantity,
      balanceBefore,
      balanceAfter: input.observedQuantity,
      createdAt: Date.now(),
    })
  );
  return ref.id;
}

export type InventoryConsumptionMaterial = {
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
};

function inventoryUsageFingerprint(event: InventoryUsageEvent): string {
  return JSON.stringify({
    sourceRevision: event.sourceRevision,
    status: event.status,
    lines: event.lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      unit: line.unit,
      rootRecipeId: line.rootRecipeId,
      rootRecipeVersion: line.rootRecipeVersion,
      sourceRefs: line.sourceRefs,
    })),
    issues: event.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      menuItemId: issue.menuItemId,
      recipeId: issue.recipeId,
      sourceRef: issue.sourceRef,
    })),
  });
}

function inventoryConsumptionApplicationId(sourceDate: string): string {
  return `${inventoryDocPart(sourceDate)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function applyInventoryConsumptionEvent(
  event: InventoryUsageEvent,
  materials: InventoryConsumptionMaterial[]
): Promise<{ changed: boolean; movementIds: string[] }> {
  const consumptionRef = doc(db, "inventoryConsumptionEvents", event.id);
  const materialDetails = Object.fromEntries(materials.map((material) => [material.materialId, { name: material.materialName, unit: material.unit }]));
  const materialQuantities = Object.fromEntries(materials.map((material) => [material.materialId, material.quantity]));
  const fingerprint = inventoryUsageFingerprint(event);

  return runTransaction(db, async (transaction) => {
    const existingSnapshot = await transaction.get(consumptionRef);
    const existing = existingSnapshot.exists()
      ? mapInventoryConsumptionEvent(consumptionRef.id, existingSnapshot.data())
      : null;
    if (existing && existing.sourceRevision === event.sourceRevision && existing.status === event.status && existing.usageFingerprint === fingerprint) {
      return { changed: false, movementIds: existing.movementIds };
    }

    const applicationId = inventoryConsumptionApplicationId(event.sourceDate);
    const movementIds: string[] = [];
    const now = Date.now();

    if (existing?.status === "calculated") {
      for (const [materialId, quantity] of Object.entries(existing.materialQuantities)) {
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const detail = existing.materialDetails?.[materialId] ?? materialDetails[materialId];
        if (!detail) continue;
        const movementId = `reversal-${inventoryDocPart(event.sourceDate)}-${applicationId}-${inventoryDocPart(materialId)}`;
        movementIds.push(movementId);
        transaction.set(
          doc(db, "inventoryMovements", movementId),
          omitUndefined({
            materialId,
            materialName: detail.name,
            unit: detail.unit,
            quantity,
            movementType: "reversal" satisfies InventoryMovementType,
            occurredOn: event.sourceDate,
            reason: `Reverse recipe consumption for ${event.sourceDate} revision ${existing.sourceRevision}`,
            sourceRef: `consumption:${event.id}:reversal:${existing.sourceRevision}`,
            sourceRevision: existing.sourceRevision,
            createdAt: now,
          }),
          { merge: true }
        );
      }
    }

    if (event.status === "calculated") {
      for (const [materialId, quantity] of Object.entries(materialQuantities)) {
        if (!Number.isFinite(quantity) || quantity <= 0) continue;
        const detail = materialDetails[materialId];
        if (!detail) continue;
        const movementId = `consumption-${inventoryDocPart(event.sourceDate)}-${applicationId}-${inventoryDocPart(materialId)}`;
        movementIds.push(movementId);
        transaction.set(
          doc(db, "inventoryMovements", movementId),
          omitUndefined({
            materialId,
            materialName: detail.name,
            unit: detail.unit,
            quantity: -quantity,
            movementType: "recipe_consumption" satisfies InventoryMovementType,
            occurredOn: event.sourceDate,
            reason: `Recipe consumption from daily log ${event.sourceDate}`,
            sourceRef: `consumption:${event.id}:revision:${event.sourceRevision}`,
            sourceRevision: event.sourceRevision,
            createdAt: now,
          }),
          { merge: true }
        );
      }
    }

    const nextEvent: InventoryConsumptionEvent = {
      id: event.id,
      sourceDate: event.sourceDate,
      sourceDailyLogId: event.sourceDailyLogId,
      sourceRevision: event.sourceRevision,
      sourceStatus: event.sourceStatus,
      status: event.status,
      usageFingerprint: fingerprint,
      materialQuantities: event.status === "calculated" ? materialQuantities : {},
      materialDetails: event.status === "calculated" ? materialDetails : {},
      movementIds,
      replacedSourceRevision: existing?.sourceRevision ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    transaction.set(consumptionRef, omitUndefined(nextEvent), { merge: true });
    return { changed: true, movementIds };
  });
}
