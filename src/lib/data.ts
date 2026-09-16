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
  const { id: _id, ...rest } = entry;
  const ref = await addDoc(salesCol, omitUndefined({ ...rest, total, createdAt: Date.now() }));
  return ref.id;
}

export async function deleteSalesEntry(id: string) {
  await deleteDoc(doc(db, "salesEntries", id));
}

export async function getSalesEntryByDate(date: string): Promise<SalesEntry | null> {
  const snap = await getDocs(query(salesCol, where("date", "==", date)));
  const d = snap.docs[0];
  return d ? { id: d.id, ...(d.data() as Omit<SalesEntry, "id">) } : null;
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
  const { id: _id, ...rest } = item;
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
  const { id: _id, ...rest } = sale;
  const ref = await addDoc(itemSalesCol, omitUndefined({ ...rest, createdAt: Date.now() }));
  return ref.id;
}

export async function deleteItemSale(id: string) {
  await deleteDoc(doc(db, "itemSales", id));
}
