import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SalesEntry, MenuItem, ItemSale } from "./types";

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
    await setDoc(doc(db, "salesEntries", id), { ...rest, total }, { merge: true });
    return id;
  }
  const ref = await addDoc(salesCol, { ...entry, total, createdAt: Date.now() });
  return ref.id;
}

export async function deleteSalesEntry(id: string) {
  await deleteDoc(doc(db, "salesEntries", id));
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
    await setDoc(doc(db, "menuItems", id), rest, { merge: true });
    return id;
  }
  const ref = await addDoc(itemsCol, { ...item, createdAt: Date.now() });
  return ref.id;
}

export async function deleteMenuItem(id: string) {
  await deleteDoc(doc(db, "menuItems", id));
}

// ---------- Item Sales ----------

const itemSalesCol = collection(db, "itemSales");

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
    await setDoc(doc(db, "itemSales", id), rest, { merge: true });
    return id;
  }
  const ref = await addDoc(itemSalesCol, { ...sale, createdAt: Date.now() });
  return ref.id;
}

export async function deleteItemSale(id: string) {
  await deleteDoc(doc(db, "itemSales", id));
}
