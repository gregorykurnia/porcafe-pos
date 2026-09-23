import {
  applyInventoryConsumptionEvent,
  type InventoryConsumptionMaterial,
} from "./data";
import { normalizeInventoryName } from "./inventory";
import type {
  InventoryMaterial,
  InventoryMovement,
  InventoryStockSetup,
  InventoryUnit,
  InventoryUsageEvent,
} from "./types";

export type InventoryBalance = {
  materialId: string;
  materialName: string;
  unit: InventoryUnit;
  currentQuantity: number | null;
  movementQuantity: number;
  isNegative: boolean;
};

const CURRENT_STOCK_EXCLUDED_MATERIAL_NAMES = new Set(
  [
    "Calamansi",
    "Curly red chili",
    "Curly red chilli",
    "Ginger",
    "Green bird's eye chili",
    "Green bird's eye chilli",
    "Kaffir lime leaves",
    "Red bird's eye chili",
    "Red bird's eye chilli",
    "Salt",
    "Salted anchovies",
    "Seasoning",
    "Seasoning (salt, sugar, MSG)",
    "Young lemongrass",
  ].map(normalizeInventoryName),
);

export function filterCurrentStockBalances(balances: InventoryBalance[]): InventoryBalance[] {
  return balances.filter((balance) => !CURRENT_STOCK_EXCLUDED_MATERIAL_NAMES.has(normalizeInventoryName(balance.materialName)));
}

export function sumInventoryMovements(movements: InventoryMovement[], materialId: string): number {
  return movements
    .filter((movement) => movement.materialId === materialId)
    .reduce((total, movement) => total + movement.quantity, 0);
}

export function summarizeInventoryBalances(
  materials: InventoryMaterial[],
  movements: InventoryMovement[],
  setup: InventoryStockSetup | null
): InventoryBalance[] {
  const initialized = Boolean(setup?.initialized);
  return materials
    .filter((material) => material.active)
    .map((material) => {
      const movementQuantity = sumInventoryMovements(movements, material.id);
      const currentQuantity = initialized ? movementQuantity : null;
      return {
        materialId: material.id,
        materialName: material.name,
        unit: material.baseUnit,
        currentQuantity,
        movementQuantity,
        isNegative: currentQuantity !== null && currentQuantity < 0,
      };
    })
    .sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function aggregateUsageMaterials(event: InventoryUsageEvent): InventoryConsumptionMaterial[] {
  if (event.status !== "calculated") return [];
  const byMaterial = new Map<string, InventoryConsumptionMaterial>();
  for (const line of event.lines) {
    const existing = byMaterial.get(line.materialId) ?? {
      materialId: line.materialId,
      materialName: line.materialName,
      unit: line.unit,
      quantity: 0,
    };
    existing.quantity += line.quantity;
    byMaterial.set(line.materialId, existing);
  }
  return [...byMaterial.values()].filter((material) => Number.isFinite(material.quantity) && material.quantity > 0);
}

export async function syncInventoryConsumption(event: InventoryUsageEvent) {
  return applyInventoryConsumptionEvent(event, aggregateUsageMaterials(event));
}
