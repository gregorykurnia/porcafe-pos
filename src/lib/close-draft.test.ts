import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_CLOSE_PAYMENTS_TEXT,
  closePaymentsDiffer,
  closePaymentsText,
  normalizeCloseDraft,
  parseClosePayments,
  quantitiesDiffer,
  savedClosePayments,
} from "./close-draft";

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

test("a day with no revenue record saves as zero payments and shows blank fields", () => {
  assert.deepEqual(savedClosePayments(null), { cash: 0, bca: 0, soundbox: 0, other: 0 });
  assert.deepEqual(closePaymentsText(null), EMPTY_CLOSE_PAYMENTS_TEXT);
  assert.deepEqual(closePaymentsText({ bca: 1_500_000, cash: 0 }).bca, "1.500.000");
  assert.equal(closePaymentsText({ bca: 1_500_000, cash: 0 }).cash, "");
});

test("payments are compared after parsing, so formats do not count as changes", () => {
  const saved = { cash: 0, bca: 1_500_000, soundbox: 0, other: 0 };
  assert.equal(closePaymentsDiffer({ ...EMPTY_CLOSE_PAYMENTS_TEXT, bca: "1500000" }, saved), false);
  assert.equal(closePaymentsDiffer({ ...EMPTY_CLOSE_PAYMENTS_TEXT, bca: "1,5jt" }, saved), false);
  assert.equal(closePaymentsDiffer({ ...EMPTY_CLOSE_PAYMENTS_TEXT, bca: "1.600.000" }, saved), true);
});

test("an unreadable payment is a change and does not parse", () => {
  assert.equal(parseClosePayments({ ...EMPTY_CLOSE_PAYMENTS_TEXT, cash: "abc" }), null);
  assert.equal(closePaymentsDiffer({ ...EMPTY_CLOSE_PAYMENTS_TEXT, cash: "abc" }, savedClosePayments(null)), true);
});

test("reads the current draft shape and the older quantities-only shape", () => {
  assert.deepEqual(
    normalizeCloseDraft({ quantities: { a: "2" }, payments: { ...EMPTY_CLOSE_PAYMENTS_TEXT, cash: "10rb" } }),
    { quantities: { a: "2" }, payments: { ...EMPTY_CLOSE_PAYMENTS_TEXT, cash: "10rb" } }
  );
  assert.deepEqual(normalizeCloseDraft({ a: "2" }), { quantities: { a: "2" }, payments: EMPTY_CLOSE_PAYMENTS_TEXT });
});

test("rejects values that are not a draft", () => {
  assert.equal(normalizeCloseDraft(null), null);
  assert.equal(normalizeCloseDraft("draft"), null);
  assert.equal(normalizeCloseDraft({ a: 2 }), null);
});
