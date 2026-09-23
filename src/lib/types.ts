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

// ---------- Inventory foundation ----------

// Phase 1 deliberately keeps the unit system small and explicit. Quantities
// are stored in one base unit per material; conversion rules can be added in a
// later phase once they are backed by an approved business rule.
export type InventoryUnit = "g" | "ml" | "pcs";
export type RecipeYieldUnit = InventoryUnit | "portion";

export type InventoryMaterialType =
  | "raw_ingredient"
  | "prepared_component"
  | "packaging"
  | "other_supply";

export type InventoryReviewStatus = "approved" | "needs-review";

export type InventoryMaterial = {
  id: string;
  name: string;
  normalizedName: string;
  type: InventoryMaterialType;
  baseUnit: InventoryUnit;
  active: boolean;
  reviewStatus: InventoryReviewStatus;
  sourceRefs: string[];
  reorderThreshold?: number;
  reorderQuantity?: number;
  preferredSupplierId?: string;
  lowStockAlertEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type InventorySupplier = {
  id: string;
  name: string;
  normalizedName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type InventorySupplierItem = {
  id: string;
  supplierId: string;
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  costPerUnit: number;
  currency: string;
  supplierSku?: string;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  preferred: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type InventorySupplierOrderStatus = "ordered" | "partially_received" | "received" | "cancelled";

export type InventorySupplierOrderLine = {
  id: string;
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  currency: string;
};

export type InventorySupplierOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  orderReference: string;
  orderedOn: string;
  expectedOn?: string;
  status: InventorySupplierOrderStatus;
  notes?: string;
  totalCost: number;
  lines: InventorySupplierOrderLine[];
  receiptIds?: string[];
  receivedOn?: string;
  createdAt: number;
  updatedAt: number;
};

export type InventorySupplierDeliveryFrequency = "daily" | "weekly" | "monthly" | "custom";

export type InventorySupplierDeliverySchedule = {
  id: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
  frequency: InventorySupplierDeliveryFrequency;
  customIntervalDays?: number;
  startOn: string;
  nextRunOn: string;
  endOn?: string;
  active: boolean;
  lastRunOn?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type InventoryAliasEntityType =
  | "menu_item"
  | "material"
  | "prepared_component";

export type InventoryAliasMapping = {
  id: string;
  sourceLabel: string;
  normalizedSourceLabel: string;
  entityType: InventoryAliasEntityType;
  targetId: string | null;
  targetName: string | null;
  status: InventoryReviewStatus;
  sourceRefs: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export type RecipeTargetType = "menu_item" | "prepared_component";
export type RecipeVersionStatus = "draft" | "active" | "retired" | "needs-review";
export type RecipeBasis = "per_portion" | "batch";
export type RecipeIngredientType = "material" | "component";

export type InventoryRecipeVersion = {
  id: string;
  targetType: RecipeTargetType;
  targetId: string;
  targetName: string;
  version: number;
  status: RecipeVersionStatus;
  basis: RecipeBasis;
  effectiveFrom: string | null;
  yieldQuantity: number | null;
  yieldUnit: RecipeYieldUnit | null;
  reviewStatus: InventoryReviewStatus;
  sourceRefs: string[];
  createdAt: number;
  updatedAt: number;
};

export type InventoryRecipeLine = {
  id: string;
  recipeId: string;
  ingredientType: RecipeIngredientType;
  ingredientId: string;
  ingredientName: string;
  quantity: number | null;
  unit: InventoryUnit | null;
  sourceRef: string | null;
  reviewStatus: InventoryReviewStatus;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

// ---------- Inventory usage calculation ----------

export type InventoryUsageStatus = "calculated" | "needs-review" | "no-sales";

export type InventoryUsageIssueCode =
  | "missing-menu-item"
  | "missing-recipe"
  | "recipe-not-ready"
  | "missing-mapping"
  | "missing-component-basis"
  | "unit-mismatch"
  | "invalid-quantity"
  | "recipe-cycle";

export type InventoryUsageIssue = {
  code: InventoryUsageIssueCode;
  message: string;
  menuItemId?: string;
  menuItemName?: string;
  recipeId?: string;
  sourceRef?: string | null;
};

// A usage line is already expressed in the material's base unit. The path and
// source refs keep the calculation auditable without creating stock movements.
export type InventoryUsageLine = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  portionQuantity: number;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: InventoryUnit;
  rootRecipeId: string;
  rootRecipeVersion: number;
  recipePath: string[];
  sourceRefs: string[];
};

export type InventoryUsageEvent = {
  id: string; // = usage-{sourceDate}
  sourceDate: string;
  sourceDailyLogId: string;
  sourceRevision: number;
  sourceStatus: DailyItemLogStatus;
  status: InventoryUsageStatus;
  totalPortions: number;
  lines: InventoryUsageLine[];
  issues: InventoryUsageIssue[];
  recipeIds: string[];
  goLiveDate: string;
  calculatedAt: number;
};

// ---------- Inventory ledger ----------

export type InventoryMovementType =
  | "opening_balance"
  | "receiving"
  | "manual_adjustment"
  | "stock_count"
  | "waste_spoilage"
  | "recipe_consumption"
  | "reversal"
  | "correction";

// Every stock change is represented as a signed quantity in the material's
// base unit. Positive values add stock; negative values consume or remove it.
export type InventoryMovement = {
  id: string;
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  quantity: number;
  movementType: InventoryMovementType;
  occurredOn: string;
  reason: string;
  sourceRef: string;
  sourceRevision?: number;
  notes?: string;
  observedQuantity?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  createdAt: number;
};

export type InventoryStockSetup = {
  id: "default";
  initialized: boolean;
  openingDate: string | null;
  materialCount: number;
  initializedAt: number | null;
  updatedAt: number;
};

export type InventoryConsumptionEvent = {
  id: string;
  sourceDate: string;
  sourceDailyLogId: string;
  sourceRevision: number;
  sourceStatus: DailyItemLogStatus;
  status: InventoryUsageStatus;
  usageFingerprint: string;
  materialQuantities: Record<string, number>;
  materialDetails: Record<string, { name: string; unit: InventoryUnit }>;
  movementIds: string[];
  replacedSourceRevision: number | null;
  createdAt: number;
  updatedAt: number;
};
