import assert from "node:assert/strict";
import test from "node:test";
import { buildSupplierOrderMessage, normalizeIndonesianPhone, shortDateId, toWhatsAppLink } from "./supplier-message";

test("formats short Indonesian dates", () => {
  assert.equal(shortDateId("2026-10-12"), "12 Okt");
  assert.equal(shortDateId("2026-01-05"), "5 Jan");
  assert.equal(shortDateId("not a date"), "not a date");
});

test("writes the order as a short message to the contact, with the delivery date", () => {
  const message = buildSupplierOrderMessage(
    {
      orderedOn: "2026-10-12",
      expectedOn: "2026-10-13",
      lines: [
        { materialName: "Telur", quantity: 5, unit: "pcs" },
        { materialName: "Kailan", quantity: 2.5, unit: "g" },
      ],
    },
    { name: "Sumber Segar", contactPerson: "Budi" }
  );
  assert.equal(
    message,
    "Halo Budi, order Porcafe tgl 12 Okt:\n- Telur 5 pcs\n- Kailan 2,5 g\nKirim tgl 13 Okt.\nTerima kasih."
  );
});

test("falls back to the supplier name when there is no contact, and omits a missing delivery date", () => {
  const message = buildSupplierOrderMessage(
    { orderedOn: "2026-10-12", lines: [{ materialName: "Telur", quantity: 1, unit: "pcs" }] },
    { name: "Sumber Segar" }
  );
  assert.equal(message, "Halo Sumber Segar, order Porcafe tgl 12 Okt:\n- Telur 1 pcs\nTerima kasih.");
});

test("normalises Indonesian numbers to the 62 country code", () => {
  assert.equal(normalizeIndonesianPhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizeIndonesianPhone("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizeIndonesianPhone("812 3456 7890"), "6281234567890");
  assert.equal(normalizeIndonesianPhone("12"), null);
  assert.equal(normalizeIndonesianPhone(""), null);
  assert.equal(normalizeIndonesianPhone(undefined), null);
});

test("builds a WhatsApp link with the message encoded, or nothing when the number is bad", () => {
  assert.equal(toWhatsAppLink("0812 3456 7890", "Halo & terima kasih"), "https://wa.me/6281234567890?text=Halo%20%26%20terima%20kasih");
  assert.equal(toWhatsAppLink("abc", "Halo"), null);
});
