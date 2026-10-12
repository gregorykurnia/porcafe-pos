import assert from "node:assert/strict";
import test from "node:test";
import { findPreferredSupplierDisagreements } from "./preferred-supplier";

test("reports nothing when the material and its links agree", () => {
  assert.deepEqual(
    findPreferredSupplierDisagreements(
      [{ id: "kailan", name: "Kailan", preferredSupplierId: "sumber" }],
      [{ supplierId: "sumber", materialId: "kailan", preferred: true }]
    ),
    []
  );
});

test("flags a preferred supplier that has no link", () => {
  assert.deepEqual(
    findPreferredSupplierDisagreements([{ id: "kailan", name: "Kailan", preferredSupplierId: "sumber" }], []),
    [{ materialId: "kailan", materialName: "Kailan", supplierId: "sumber", issue: "missing-link" }]
  );
});

test("flags a link marked preferred that the material does not agree with", () => {
  assert.deepEqual(
    findPreferredSupplierDisagreements(
      [{ id: "kailan", name: "Kailan", preferredSupplierId: "sumber" }],
      [
        { supplierId: "sumber", materialId: "kailan", preferred: false },
        { supplierId: "segar", materialId: "kailan", preferred: true },
      ]
    ),
    [{ materialId: "kailan", materialName: "Kailan", supplierId: "segar", issue: "flag-disagrees" }]
  );
});

test("a material without a preferred supplier is never flagged for missing links", () => {
  assert.deepEqual(
    findPreferredSupplierDisagreements([{ id: "telur", name: "Telur" }], [{ supplierId: "segar", materialId: "telur", preferred: false }]),
    []
  );
});
