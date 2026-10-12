import assert from "node:assert/strict";
import test from "node:test";
import { quantitiesDiffer } from "./close-draft";

test("typed quantities that match the saved log are not a change", () => {
  assert.equal(quantitiesDiffer({ a: "3", b: "" }, { a: 3 }), false);
  assert.equal(quantitiesDiffer({ a: "0" }, {}), false);
  assert.equal(quantitiesDiffer({}, {}), false);
});

test("a changed, added or removed quantity is a change", () => {
  assert.equal(quantitiesDiffer({ a: "4" }, { a: 3 }), true);
  assert.equal(quantitiesDiffer({ a: "3", b: "1" }, { a: 3 }), true);
  assert.equal(quantitiesDiffer({ a: "" }, { a: 3 }), true);
});
