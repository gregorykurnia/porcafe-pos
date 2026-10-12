import assert from "node:assert/strict";
import test from "node:test";
import { draftFromMaterial, isDraftDirty, patchFromDraft, validateDraft } from "./reorder-settings";
import type { InventoryMaterial } from "./types";

const saved = {
  id: "kailan",
  name: "Kailan",
  normalizedName: "kailan",
  type: "raw_ingredient",
  baseUnit: "g",
  active: true,
  reviewStatus: "approved",
  sourceRefs: [],
  reorderThreshold: 5000,
  reorderQuantity: 10000,
  preferredSupplierId: "sumber",
  lowStockAlertEnabled: true,
  createdAt: 1,
  updatedAt: 1,
} as InventoryMaterial;

test("an untouched draft is clean; a changed field makes it dirty", () => {
  const draft = draftFromMaterial(saved);
  assert.equal(isDraftDirty(draft, saved), false);
  assert.equal(isDraftDirty({ ...draft, threshold: "6000" }, saved), true);
  assert.equal(isDraftDirty({ ...draft, alertEnabled: false }, saved), true);
  assert.equal(isDraftDirty({ ...draft, threshold: " 5000 " }, saved), false);
});

test("validates the same rules the single-row save used", () => {
  const draft = draftFromMaterial(saved);
  assert.equal(validateDraft({ ...draft, threshold: "-1" }), "Reorder threshold must be zero or greater.");
  assert.equal(validateDraft({ ...draft, quantity: "0" }), "Suggested reorder quantity must be greater than zero.");
  assert.equal(validateDraft({ ...draft, threshold: "", alertEnabled: true }), "Set a reorder threshold before turning on the alert.");
  assert.equal(validateDraft(draft), null);
});

test("a cleared number is written as null so the old value is removed, and no supplier is an empty string", () => {
  assert.deepEqual(patchFromDraft({ threshold: "", quantity: "", preferredSupplierId: "", alertEnabled: false }), {
    reorderThreshold: null,
    reorderQuantity: null,
    preferredSupplierId: "",
    lowStockAlertEnabled: false,
  });
  assert.equal(patchFromDraft({ threshold: "2,5", quantity: "3", preferredSupplierId: "x", alertEnabled: true }).reorderThreshold, 2.5);
});
