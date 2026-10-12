// Tab names for the Stock and Setup pages. The URL keeps the open tab (?tab=), so a link can open a section directly.

export const SETUP_TABS = [
  { key: "menu", label: "Menu" },
  { key: "materials", label: "Materials" },
  { key: "recipes", label: "Recipes" },
  { key: "suppliers", label: "Suppliers" },
  { key: "import", label: "Import" },
  { key: "notifications", label: "Notifications" },
  { key: "data", label: "Data maintenance" },
] as const;

export type SetupTab = (typeof SETUP_TABS)[number]["key"];

export function isSetupTab(value: string): value is SetupTab {
  return SETUP_TABS.some((tab) => tab.key === value);
}

/** The Setup tab for a URL value. Anything unknown opens the first tab. */
export function setupTabFromParam(value: string | null): SetupTab {
  return value !== null && isSetupTab(value) ? value : "menu";
}

export const STOCK_TABS = [
  { key: "stock", label: "Stock" },
  { key: "to-order", label: "To order" },
  { key: "orders", label: "Orders" },
  { key: "usage", label: "Usage recap" },
] as const;

export type StockTab = (typeof STOCK_TABS)[number]["key"];

export function isStockTab(value: string | null): value is StockTab {
  return STOCK_TABS.some((tab) => tab.key === value);
}

/**
 * The Stock tab for a URL value. Older links to the combined suppliers tab open To order. Materials,
 * Recipes and Import moved to Setup; next.config.ts redirects those links, so they never reach here.
 */
export function stockTabFromParam(value: string | null): StockTab {
  if (value === "suppliers") return "to-order";
  return isStockTab(value) ? value : "stock";
}
