import assert from "node:assert/strict";
import test from "node:test";
import { describeUnitChangeBlock, hasMaterialUsage } from "./material-usage";

const none = { movements: 0, recipeLines: 0, supplierItems: 0, schedules: 0 };

test("an unused material can change its unit", () => {
  assert.equal(hasMaterialUsage(none), false);
  assert.equal(describeUnitChangeBlock({ name: "Telur", baseUnit: "butir" }, none), null);
});

test("names the records that block a unit change", () => {
  assert.equal(
    describeUnitChangeBlock({ name: "Telur", baseUnit: "butir" }, { ...none, movements: 128, recipeLines: 6 }),
    "Telur has 128 stock movements and 6 recipe lines in butir. Create a new material instead."
  );
});

test("uses singular phrases for single records and lists every kind", () => {
  assert.equal(
    describeUnitChangeBlock({ name: "Kailan", baseUnit: "g" }, { ...none, supplierItems: 1 }),
    "Kailan has 1 supplier link in g. Create a new material instead."
  );
  assert.equal(
    describeUnitChangeBlock({ name: "Kailan", baseUnit: "g" }, { movements: 2, recipeLines: 1, supplierItems: 0, schedules: 1 }),
    "Kailan has 2 stock movements, 1 recipe line and 1 delivery schedule in g. Create a new material instead."
  );
});
