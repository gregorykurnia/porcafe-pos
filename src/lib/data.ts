import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  SalesEntry,
  MenuItem,
  ItemSale,
  MonthlyAdjustment,
  DailyItemLog,
} from "./types";

// Firestore rejects `undefined` field values (e.g. an omitted optional field).
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// ---------- Sales Entries ----------

const salesCol = collection(db, "salesEntries");

export async function listSalesEntries(): Promise<SalesEntry[]> {
  const snap = await getDocs(query(salesCol, orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SalesEntry, "id">) }));
}

export async function upsertSalesEntry(
  entry: Omit<SalesEntry, "id" | "total" | "createdAt"> & { id?: string }
) {
  const total = entry.bca + entry.cash + entry.soundbox + entry.other;
  if (entry.id) {
    const { id, ...rest } = entry;
    await setDoc(doc(db, "salesEntries", id), omitUndefined({ ...rest, total }), { merge: true });
    return id;
  }
  const rest = { ...entry };
  delete rest.id;
  const ref = await addDoc(salesCol, omitUndefined({ ...rest, total, createdAt: Date.now() }));
  return ref.id;
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
// Existing records are updated; new scanner records use a deterministic id so
// repeated submissions cannot create a second Sales document for that date.
export async function upsertSalesEntryByDate(
  entry: Omit<SalesEntry, "id" | "total" | "createdAt"> & { id?: string }
) {
  const existing = await listSalesEntriesByDate(entry.date);
  const existingId = existing[0]?.id;
  if (existingId) {
    return upsertSalesEntry({ ...entry, id: existingId });
  }

  const total = entry.bca + entry.cash + entry.soundbox + entry.other;
  const id = `scanner-${entry.date}`;
  await setDoc(
    doc(db, "salesEntries", id),
    omitUndefined({ ...entry, total, createdAt: Date.now() }),
    { merge: true }
  );
  return id;
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
  }
) {
  const id = log.date;
  const now = Date.now();
  const { id: inputId, createdAt, ...rest } = log;
  const payload: Record<string, unknown> = { ...rest, updatedAt: now };

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
