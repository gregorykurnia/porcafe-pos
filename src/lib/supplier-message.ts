// The order message sent to a supplier, and the WhatsApp link that opens it.

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-10-12" → "12 Okt". Anything unreadable is returned as it was. */
export function shortDateId(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return isoDate;
  return `${Number(match[3])} ${MONTHS_ID[month - 1]}`;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

export function buildSupplierOrderMessage(
  order: { orderedOn: string; expectedOn?: string; lines: { materialName: string; quantity: number; unit: string }[] },
  supplier: { name: string; contactPerson?: string }
): string {
  const contact = supplier.contactPerson?.trim();
  const greeting = `Halo ${contact || supplier.name}`;
  const parts = [
    `${greeting}, order Porcafe tgl ${shortDateId(order.orderedOn)}:`,
    ...order.lines.map((line) => `- ${line.materialName} ${formatQuantity(line.quantity)} ${line.unit}`),
  ];
  if (order.expectedOn) parts.push(`Kirim tgl ${shortDateId(order.expectedOn)}.`);
  parts.push("Terima kasih.");
  return parts.join("\n");
}

/**
 * An Indonesian mobile or landline number as WhatsApp expects it: digits only, with the
 * country code 62. Returns null when the number cannot be read.
 */
export function normalizeIndonesianPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!digits.startsWith("62")) return null;
  if (digits.length < 10 || digits.length > 14) return null;
  return digits;
}

export function toWhatsAppLink(phone: string | undefined, text: string): string | null {
  const digits = normalizeIndonesianPhone(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
