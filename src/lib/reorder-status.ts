import type { InventoryMaterial } from "./types";

export type InventoryReorderStatus =
  | "stock-high"
  | "to-order"
  | "on-way"
  | "not-configured"
  | "alerts-off"
  | "not-initialized";

export function getInventoryReorderStatus(
  material: InventoryMaterial,
  currentQuantity: number | null | undefined,
  stockInitialized: boolean,
  hasOpenOrder: boolean,
): InventoryReorderStatus {
  if (!stockInitialized || currentQuantity === null || currentQuantity === undefined) return "not-initialized";
  if (hasOpenOrder) return "on-way";
  if (material.reorderThreshold === undefined) return "not-configured";
  if (!material.lowStockAlertEnabled) return "alerts-off";
  return currentQuantity <= material.reorderThreshold ? "to-order" : "stock-high";
}

export function shouldSendInitialReorderAlert(
  beforeStatus: InventoryReorderStatus,
  afterStatus: InventoryReorderStatus,
  triggerKey: string | null,
  lastInitialAlertKey: string | null | undefined,
  hasValidOrderQuantity: boolean,
): boolean {
  return afterStatus === "to-order" &&
    beforeStatus !== "to-order" &&
    Boolean(triggerKey) &&
    triggerKey !== lastInitialAlertKey &&
    hasValidOrderQuantity;
}

export function getReorderNotificationMessage(
  material: InventoryMaterial,
  currentQuantity: number | null | undefined,
  supplierName?: string | null,
): string | null {
  if (!Number.isFinite(material.reorderQuantity) ||
    (material.reorderQuantity ?? 0) <= 0 ||
    !Number.isFinite(currentQuantity) ||
    !material.name.trim() ||
    !["g", "ml", "pcs"].includes(material.baseUnit)) return null;
  const formatQuantity = (quantity: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(quantity);
  const quantity = formatQuantity(material.reorderQuantity!);
  const stock = formatQuantity(currentQuantity!);
  const supplier = material.preferredSupplierId
    ? supplierName?.trim() || "Archived supplier"
    : null;
  const orderCopy = supplier
    ? `Order ${quantity} ${material.baseUnit} of ${material.name} from ${supplier}.`
    : `Order ${quantity} ${material.baseUnit} of ${material.name}. Preferred supplier not set.`;
  return `${orderCopy} Current stock: ${stock} ${material.baseUnit}.`;
}

export function isReorderReminderDue(input: {
  active: boolean;
  date: string;
  firstReminderOn: string | null | undefined;
  claimedReminderDate: string | null | undefined;
}): boolean {
  return input.active &&
    typeof input.firstReminderOn === "string" &&
    input.firstReminderOn <= input.date &&
    input.claimedReminderDate !== input.date;
}
