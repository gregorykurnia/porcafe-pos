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

export type ItemSale = {
  id: string;
  date: string; // YYYY-MM-DD
  itemId: string;
  itemName: string;
  category: string;
  qty: number;
  createdAt: number;
};
