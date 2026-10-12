import assert from "node:assert/strict";
import test from "node:test";
import { formatRupiahDraft, formatRupiahText, groupThousands, parseRupiah } from "./money";

test("parses dotted and plain rupiah amounts", () => {
  assert.equal(parseRupiah("1.500.000"), 1_500_000);
  assert.equal(parseRupiah("1500000"), 1_500_000);
  assert.equal(parseRupiah("1 500 000"), 1_500_000);
  assert.equal(parseRupiah("Rp 12.000"), 12_000);
  assert.equal(parseRupiah("rp12.000"), 12_000);
});

test("reads juta, jt, rb, ribu and k shorthand", () => {
  assert.equal(parseRupiah("1,5jt"), 1_500_000);
  assert.equal(parseRupiah("1.5 juta"), 1_500_000);
  assert.equal(parseRupiah("2,25 jt"), 2_250_000);
  assert.equal(parseRupiah("150rb"), 150_000);
  assert.equal(parseRupiah("150 ribu"), 150_000);
  assert.equal(parseRupiah("150k"), 150_000);
  assert.equal(parseRupiah("1.500jt"), 1_500_000);
});

test("treats separators as thousands when there is no unit", () => {
  // Rupiah has no fractions, so a bare decimal comma is not a decimal.
  assert.equal(parseRupiah("1,5"), 15);
  assert.equal(parseRupiah("1,500,000"), 1_500_000);
});

test("blank input is zero and non-amounts are rejected", () => {
  assert.equal(parseRupiah(""), 0);
  assert.equal(parseRupiah("   "), 0);
  assert.equal(parseRupiah("abc"), null);
  assert.equal(parseRupiah("12abc"), null);
  assert.equal(parseRupiah("-5"), null);
  assert.equal(parseRupiah("99999999999999999999"), null);
});

test("groups digits with dots", () => {
  assert.equal(groupThousands("7"), "7");
  assert.equal(groupThousands("1234"), "1.234");
  assert.equal(groupThousands("1234567"), "1.234.567");
});

test("formats stored amounts for display, with zero as an empty field", () => {
  assert.equal(formatRupiahText(1_500_000), "1.500.000");
  assert.equal(formatRupiahText(0), "");
  assert.equal(formatRupiahText(999.6), "1.000");
});

test("groups plain digits while typing and leaves unit text alone", () => {
  assert.equal(formatRupiahDraft("1500"), "1.500");
  assert.equal(formatRupiahDraft("1.5"), "15");
  assert.equal(formatRupiahDraft("007"), "7");
  assert.equal(formatRupiahDraft("0"), "0");
  assert.equal(formatRupiahDraft(""), "");
  assert.equal(formatRupiahDraft("1,5jt"), "1,5jt");
  assert.equal(formatRupiahDraft("150k"), "150k");
});
