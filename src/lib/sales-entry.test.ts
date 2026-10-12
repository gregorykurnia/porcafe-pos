import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_SALES_AMOUNTS,
  EMPTY_SALES_FORM,
  isSalesFormDirty,
  parseSalesForm,
  salesAmountsFromEntry,
  salesChangeRows,
  salesFormFromEntry,
  salesTotal,
} from "./sales-entry";
import type { SalesEntry } from "./types";

const saved: SalesEntry = {
  id: "sales-2026-10-11",
  date: "2026-10-11",
  bca: 1_200_000,
  cash: 0,
  soundbox: 350_000,
  other: 0,
  total: 1_550_000,
  note: "rain",
  createdAt: 100,
};

test("a blank day shows an empty form and zero amounts", () => {
  assert.deepEqual(salesFormFromEntry(null), EMPTY_SALES_FORM);
  assert.deepEqual(salesAmountsFromEntry(null), EMPTY_SALES_AMOUNTS);
});

test("a saved entry fills the form with grouped amounts and leaves zeros blank", () => {
  assert.deepEqual(salesFormFromEntry(saved), {
    bca: "1.200.000",
    cash: "",
    soundbox: "350.000",
    other: "",
    note: "rain",
  });
});

test("parses the form into stored amounts and trims the note", () => {
  const parsed = parseSalesForm({ bca: "1,2jt", cash: "", soundbox: "350.000", other: "5rb", note: "  rain  " });
  assert.deepEqual(parsed, { bca: 1_200_000, cash: 0, soundbox: 350_000, other: 5_000, note: "rain" });
});

test("an unreadable amount makes the whole form unparseable", () => {
  assert.equal(parseSalesForm({ ...EMPTY_SALES_FORM, cash: "abc" }), null);
});

test("the form is clean when it matches the saved values", () => {
  const form = salesFormFromEntry(saved);
  assert.equal(isSalesFormDirty(form, salesAmountsFromEntry(saved)), false);
  // Re-typing the same amount in another format is not a change.
  assert.equal(isSalesFormDirty({ ...form, bca: "1200000" }, salesAmountsFromEntry(saved)), false);
  // Spaces around the note are not a change either.
  assert.equal(isSalesFormDirty({ ...form, note: "rain " }, salesAmountsFromEntry(saved)), false);
});

test("any changed amount or note makes the form dirty", () => {
  const base = salesFormFromEntry(saved);
  const amounts = salesAmountsFromEntry(saved);
  assert.equal(isSalesFormDirty({ ...base, cash: "10rb" }, amounts), true);
  assert.equal(isSalesFormDirty({ ...base, note: "sunny" }, amounts), true);
  assert.equal(isSalesFormDirty({ ...base, note: "" }, amounts), true);
});

test("an unreadable amount is treated as dirty so it is never discarded silently", () => {
  assert.equal(isSalesFormDirty({ ...EMPTY_SALES_FORM, bca: "abc" }, EMPTY_SALES_AMOUNTS), true);
});

test("a blank form is clean against a blank day", () => {
  assert.equal(isSalesFormDirty(EMPTY_SALES_FORM, EMPTY_SALES_AMOUNTS), false);
});

test("the total adds the four payment methods", () => {
  assert.equal(salesTotal(salesAmountsFromEntry(saved)), 1_550_000);
});

test("change rows list every stored field in form order with the changed values", () => {
  const next = { ...salesAmountsFromEntry(saved), cash: 40_000, note: "" };
  const rows = salesChangeRows(salesAmountsFromEntry(saved), next);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["BCA", "Cash", "Soundbox", "Other", "Note"]
  );
  assert.deepEqual(rows[1], { label: "Cash", kind: "amount", current: 0, next: 40_000 });
  assert.deepEqual(rows[4], { label: "Note", kind: "note", current: "rain", next: null });
});
