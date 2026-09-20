import type { InventoryUnit, RecipeTargetType } from "./types";

export type InventorySourceRowStatus = "ready" | "needs-review" | "excluded";
export type InventorySourceIngredientType = "material" | "component";

export type InventorySourceRow = {
  id: string;
  sourceGroup: string;
  targetLabel: string;
  targetName: string;
  targetType: RecipeTargetType;
  ingredientSourceLabel: string;
  ingredientName: string;
  ingredientType: InventorySourceIngredientType;
  amount: number | null;
  sourceUnit: string | null;
  unit: InventoryUnit | null;
  sourceRef: string;
  status: InventorySourceRowStatus;
  reviewReason: string | null;
};

type SourceLine = [string, number | null, string | null];
type SourceGroup = {
  id: string;
  targetLabel: string;
  targetName: string;
  targetType: RecipeTargetType;
  lines: SourceLine[];
};

const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: "1",
    targetLabel: "Pork satay & egg",
    targetName: "Pork satay & egg",
    targetType: "menu_item",
    lines: [
      ["Sate", 2, "tusuk"],
      ["Nasi", 75, "gr"],
      ["Telur", 1, "butir"],
      ["Kailan", 20, "g"],
      ["Matah", 10, "g"],
    ],
  },
  {
    id: "2",
    targetLabel: "Pork Belly satay & egg",
    targetName: "Pork Belly satay & egg",
    targetType: "menu_item",
    lines: [
      ["Taichan", 2, "tusuk"],
      ["Nasi", 75, "gr"],
      ["Telur", 1, "butir"],
      ["Kailan", 20, "gr"],
      ["Matah", 10, "g"],
    ],
  },
  {
    id: "3",
    targetLabel: "Crispy Pork Belly & egg",
    targetName: "Crispy Pork Belly & egg",
    targetType: "menu_item",
    lines: [
      ["SPG", 40, "gr"],
      ["Nasi", 75, "gr"],
      ["Telur", 1, "butir"],
      ["Kailan", 20, "gr"],
      ["Matah", 10, "ge"],
    ],
  },
  {
    id: "4",
    targetLabel: "Crispy Pork Belly mentai",
    targetName: "Crispy Pork Belly mentai",
    targetType: "menu_item",
    lines: [
      ["SPG", 40, "gr"],
      ["Nasi", 75, "gr"],
      ["Kailan", 20, "gr"],
      ["Mentai", 25, "gr"],
    ],
  },
  {
    id: "5",
    targetLabel: "Smokey Pork",
    targetName: "Smokey Pork",
    targetType: "menu_item",
    lines: [
      ["Babi geprek", 50, "gr"],
      ["Nasi", 75, "gr"],
      ["Kailan", 20, "gr"],
      ["Telur", 1, "butir"],
      ["Sambal", 10, "gr"],
    ],
  },
  {
    id: "6",
    targetLabel: "Crispy Pork Belly & satay",
    targetName: "Crispy Pork Belly & satay",
    targetType: "menu_item",
    lines: [
      ["SPG", 40, "gr"],
      ["Sate", 1, "tusuk"],
      ["Nasi", 75, "gr"],
      ["Telur", 1, "butir"],
      ["Kailan", 20, "gr"],
      ["Matah", 10, "gr"],
    ],
  },
  {
    id: "7",
    targetLabel: "Nanban",
    targetName: "Chicken Nanban",
    targetType: "menu_item",
    lines: [
      ["Chicken", 90, "gr"],
      ["Nasi", 75, "gr"],
      ["Egg salad", 30, "gr"],
      ["Tare", 10, "gr"],
    ],
  },
  {
    id: "8",
    targetLabel: "Sambal Matah",
    targetName: "Sambal Matah",
    targetType: "prepared_component",
    lines: [
      ["Bawang merah iris", 100, "gr"],
      ["Cabe rawit merah", 5, "gr"],
      ["Cabe merah kriting", 5, "gr"],
      ["Bawang putih", 3, "gr"],
      ["Daun jeruk", 3, "lbr"],
      ["Sereh muda", 2, "gr"],
      ["Jeruk limo", 2, "butir"],
      ["Bumbu (garam, gula, aji)", 10, "gr"],
    ],
  },
  {
    id: "9",
    targetLabel: "Saus Mentai",
    targetName: "Saus Mentai",
    targetType: "prepared_component",
    lines: [
      ["Mentai", 100, "gr"],
      ["Mayo", 50, "gr"],
      ["Plastik segitiga", null, null],
    ],
  },
  {
    id: "10",
    targetLabel: "Sambal Geprek",
    targetName: "Sambal Geprek",
    targetType: "prepared_component",
    lines: [
      ["Rawit hijau", 30, "gr"],
      ["Rawit merah", 25, "gr"],
      ["Bawang putih", 15, "gr"],
      ["Teri medan asin", 10, "gr"],
      ["Bumbu (garam, gula, aji)", 7, "gr"],
      ["Minyak panas", 15, "gr"],
    ],
  },
  {
    id: "11",
    targetLabel: "Marinade Nanban",
    targetName: "Marinade Nanban",
    targetType: "prepared_component",
    lines: [
      ["Mirin", 55, "gr"],
      ["Soy Sauce", 55, "gr"],
      ["Garlic", 13, "gr"],
      ["Sugar", 10, "gr"],
      ["Ginger", 4, "gr"],
      ["Corn Starch", 20, "gr"],
    ],
  },
  {
    id: "12",
    targetLabel: "Dry Mix coating",
    targetName: "Dry Mix coating",
    targetType: "prepared_component",
    lines: [
      ["Corn Starch", 100, "gr"],
      ["Flour", 50, "gr"],
      ["Salt", 2, "gr"],
    ],
  },
  {
    id: "13",
    targetLabel: "Tare",
    targetName: "Tare",
    targetType: "prepared_component",
    lines: [
      ["Soy Sauce", 25, "gr"],
      ["Mirin", 22, "gr"],
      ["Sugar", 16, "gr"],
      ["Rice vinegar", 9, "gr"],
      ["Sesame oil", 1, "gr"],
    ],
  },
  {
    id: "14",
    targetLabel: "Egg Salad",
    targetName: "Egg Salad",
    targetType: "prepared_component",
    lines: [
      ["Egg", 6, "pcs"],
      ["Mayo", 72, "gr"],
      ["Salt", 2.5, "gr"],
      ["Sugar", 3, "gr"],
      ["Rice vinegar", 5.5, "gr"],
      ["White pepper", null, null],
      ["Onion powder", null, null],
    ],
  },
];

const INGREDIENT_ALIASES: Record<string, { name: string; type: InventorySourceIngredientType }> = {
  sate: { name: "Pork satay", type: "material" },
  nasi: { name: "Rice", type: "material" },
  telur: { name: "Egg", type: "material" },
  egg: { name: "Egg", type: "material" },
  kailan: { name: "Kailan", type: "material" },
  matah: { name: "Sambal Matah", type: "component" },
  taichan: { name: "Taichan", type: "material" },
  spg: { name: "Samcan Pork", type: "material" },
  "babi geprek": { name: "Smokey Pork", type: "material" },
  chicken: { name: "Chicken", type: "material" },
  "egg salad": { name: "Egg Salad", type: "component" },
  tare: { name: "Tare", type: "component" },
  "bawang merah iris": { name: "Red onion", type: "material" },
  "cabe rawit merah": { name: "Red bird's eye chili", type: "material" },
  "cabe merah kriting": { name: "Curly red chili", type: "material" },
  "bawang putih": { name: "Garlic", type: "material" },
  garlic: { name: "Garlic", type: "material" },
  "daun jeruk": { name: "Kaffir lime leaves", type: "material" },
  "sereh muda": { name: "Young lemongrass", type: "material" },
  "jeruk limo": { name: "Calamansi", type: "material" },
  "bumbu (garam, gula, aji)": { name: "Seasoning (salt, sugar, MSG)", type: "material" },
  mentai: { name: "Mentai", type: "material" },
  mayo: { name: "Mayo", type: "material" },
  sambal: { name: "Sambal Geprek", type: "component" },
  "rawit hijau": { name: "Green bird's eye chili", type: "material" },
  "rawit merah": { name: "Red bird's eye chili", type: "material" },
  "teri medan asin": { name: "Salted anchovies", type: "material" },
  "minyak panas": { name: "Oil", type: "material" },
  mirin: { name: "Mirin", type: "material" },
  "soy sauce": { name: "Soy Sauce", type: "material" },
  sugar: { name: "Sugar", type: "material" },
  ginger: { name: "Ginger", type: "material" },
  "corn starch": { name: "Cornstarch", type: "material" },
  flour: { name: "Flour", type: "material" },
  salt: { name: "Salt", type: "material" },
  "rice vinegar": { name: "Rice Vinegar", type: "material" },
  "sesame oil": { name: "Sesame oil", type: "material" },
  "plastik segitiga": { name: "Plastic piping bag", type: "material" },
  "white pepper": { name: "White pepper", type: "material" },
  "onion powder": { name: "Onion powder", type: "material" },
};

const EXCLUDED_INGREDIENTS = new Map<string, string>([
  ["plastik segitiga", "Packaging is excluded from the first inventory release."],
  ["white pepper", "Explicitly ignored in the approved Phase 0 source interpretation."],
  ["onion powder", "Explicitly ignored in the approved Phase 0 source interpretation."],
]);

export function normalizeSourceLabel(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function normalizeInventoryUnit(value: string | null): InventoryUnit | null {
  if (!value) return null;
  const unit = normalizeSourceLabel(value);
  if (["gr", "g", "ge"].includes(unit)) return "g";
  if (["ml", "milliliter", "milliliters"].includes(unit)) return "ml";
  if (["pcs", "butir", "tusuk", "lbr", "lembar"].includes(unit)) return "pcs";
  return null;
}

export function canonicalizeSourceIngredient(sourceLabel: string): {
  name: string;
  type: InventorySourceIngredientType;
} {
  return INGREDIENT_ALIASES[normalizeSourceLabel(sourceLabel)] ?? {
    name: sourceLabel.trim(),
    type: "material",
  };
}

export function slugifyInventoryId(value: string): string {
  return normalizeSourceLabel(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function inventoryMaterialId(name: string): string {
  return `material-${slugifyInventoryId(name)}`;
}

export function inventoryComponentId(name: string): string {
  return `component-${slugifyInventoryId(name)}`;
}

export function inventoryRecipeId(targetType: RecipeTargetType, targetId: string, version: number): string {
  return `recipe-${targetType === "menu_item" ? "menu" : "component"}-${slugifyInventoryId(targetId)}-v${version}`;
}

export function inventoryAliasId(entityType: "menu_item" | "material" | "prepared_component", sourceLabel: string): string {
  const entityPrefix = entityType === "menu_item" ? "menu" : entityType === "prepared_component" ? "component" : "material";
  return `${entityPrefix}-alias-${slugifyInventoryId(sourceLabel)}`;
}

function buildSourceRow(group: SourceGroup, rowNumber: number, line: SourceLine): InventorySourceRow {
  const [ingredientSourceLabel, amount, sourceUnit] = line;
  const ingredient =
    group.id === "4" && normalizeSourceLabel(ingredientSourceLabel) === "mentai"
      ? { name: "Saus Mentai", type: "component" as const }
      : canonicalizeSourceIngredient(ingredientSourceLabel);
  const excludedReason = EXCLUDED_INGREDIENTS.get(normalizeSourceLabel(ingredientSourceLabel));
  const unit = normalizeInventoryUnit(sourceUnit);
  let status: InventorySourceRowStatus = "ready";
  let reviewReason: string | null = null;

  if (excludedReason) {
    status = "excluded";
    reviewReason = excludedReason;
  } else if (amount === null || unit === null) {
    status = "needs-review";
    reviewReason = amount === null ? "Quantity is blank in the source." : `Unit "${sourceUnit}" is not recognized.`;
  }

  return {
    id: `inventory-source-${rowNumber}`,
    sourceGroup: group.id,
    targetLabel: group.targetLabel,
    targetName: group.targetName,
    targetType: group.targetType,
    ingredientSourceLabel,
    ingredientName: ingredient.name,
    ingredientType: ingredient.type,
    amount,
    sourceUnit,
    unit,
    sourceRef: `D${rowNumber}:F${rowNumber}`,
    status,
    reviewReason,
  };
}

let currentRow = 4;
export const INVENTORY_SOURCE_ROWS: InventorySourceRow[] = SOURCE_GROUPS.flatMap((group) =>
  group.lines.map((line) => buildSourceRow(group, currentRow++, line))
);

export const INVENTORY_SOURCE_GROUPS = SOURCE_GROUPS.map(({ id, targetLabel, targetName, targetType }) => ({
  id,
  targetLabel,
  targetName,
  targetType,
}));

export const INVENTORY_SOURCE_BOUNDARY = "Rows 1–75 of Kebutuhan Bahan Baku per Porsi";

export function sourceRowIsImportable(row: InventorySourceRow): boolean {
  return row.status === "ready" && row.amount !== null && row.unit !== null;
}
