import assert from "node:assert/strict";
import test from "node:test";
import { filterSheetItems, moveWithinCategory, parseAliases, sortForSheet, type SheetItem } from "./menu-sheet";

const items: SheetItem[] = [
  { id: "nanban", name: "Chicken Nanban", category: "Main", sheetOrder: 2, sheetAliases: ["Nanban", "Nanban ayam"] },
  { id: "taichan", name: "Taichan", category: "Main", sheetOrder: 1 },
  { id: "tahu", name: "Tahu crispy", category: "Main" },
  { id: "telur", name: "Telur", category: "Add On", sheetOrder: 1 },
];

test("sorts by sheet order, then name, with unordered items last", () => {
  // The close sorts each category on its own: sheet numbers restart per category.
  const main = items.filter((item) => item.category === "Main");
  assert.deepEqual(sortForSheet(main).map((item) => item.id), ["taichan", "nanban", "tahu"]);
});

test("moves an item within its category and renumbers that category from 1", () => {
  const down = moveWithinCategory(items, "taichan", 1);
  assert.deepEqual([...down], [["nanban", 1], ["taichan", 2], ["tahu", 3]]);
  const up = moveWithinCategory(items, "nanban", -1);
  assert.deepEqual([...up], [["nanban", 1], ["taichan", 2], ["tahu", 3]]);
});

test("does not move past the first or last item of a category, or an unknown item", () => {
  assert.equal(moveWithinCategory(items, "taichan", -1).size, 0);
  assert.equal(moveWithinCategory(items, "telur", 1).size, 0);
  assert.equal(moveWithinCategory(items, "missing", 1).size, 0);
});

test("parses sheet names from comma-separated text, dropping blanks and repeats", () => {
  assert.deepEqual(parseAliases(" Nanban, nanban ayam ,, Nanban "), ["Nanban", "nanban ayam"]);
  assert.deepEqual(parseAliases(""), []);
});

test("filters by name or sheet name, and can keep only items with a quantity", () => {
  assert.deepEqual(filterSheetItems(items, "ayam").map((item) => item.id), ["nanban"]);
  assert.deepEqual(filterSheetItems(items, "TAI").map((item) => item.id), ["taichan"]);
  assert.deepEqual(
    filterSheetItems(items, "", { onlyWithQuantity: true, quantities: { taichan: 2, telur: 0 } }).map((item) => item.id),
    ["taichan"]
  );
});
