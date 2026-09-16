export type SalesEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  bca: number;
  cash: number;
  soundbox: number;
  other: number;
  total: number;
  note?: string;
  createdAt: number;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number | null;
  active: boolean;
  createdAt: number;
};

// A bank-reconciliation discrepancy ("selisih") for a given month. Folded only
// into month/grand totals — never into daily entries, so it can't appear as a
// spike in any day/week chart or skew per-day stats (mean/stddev/min/max/best day).
export type MonthlyAdjustment = {
  id: string; // = month, "YYYY-MM"
  month: string; // YYYY-MM
  amount: number; // selisih, can be negative
  note?: string;
  createdAt: number;
};

export type ItemSale = {
  id: string;
  date: string; // YYYY-MM-DD
  itemId: string;
  itemName: string;
  category: string;
  qty: number;
  createdAt: number;
};

export type DailyItemLogStatus = "draft" | "complete" | "no_sales";

export type DailyItemLogSource = "manual" | "scan";

// One document per calendar day. Quantities are keyed by stable menu item id;
// zero-quantity items do not need their own stored row.
export type DailyItemLog = {
  id: string; // = date, "YYYY-MM-DD"
  date: string; // YYYY-MM-DD
  quantities: Record<string, number>;
  totalQty: number;
  status: DailyItemLogStatus;
  source: DailyItemLogSource;
  createdAt: number;
  updatedAt: number;
};
