import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TicketSchema = z.object({
  date: z
    .string()
    .nullable()
    .describe(
      "The date written next to 'Tanggal', converted to ISO YYYY-MM-DD. Null if illegible."
    ),
  items: z.array(
    z.object({
      menuItemId: z
        .string()
        .nullable()
        .describe(
          "The id of the best-matching item from the provided menu item catalog. Null if there is no good match."
        ),
      rawName: z.string().describe("The item name exactly as written on the sheet."),
      cashQty: z.number().describe("Cash tally count for this row."),
      bcaQty: z.number().describe("BCA tally count for this row."),
      nobuQty: z.number().describe("Nobu tally count for this row."),
      qty: z.number().describe("Grand total quantity for this row (cashQty + bcaQty + nobuQty)."),
    })
  ),
  cashFromSheet: z
    .number()
    .nullable()
    .describe(
      "Sum of the 'Jumlah cash' rupiah column across all rows, if that column has printed values. Null if not present."
    ),
  grandTotal: z
    .number()
    .nullable()
    .describe("The 'Grand total' rupiah figure written at the bottom of the sheet, if present."),
});

export type ScanTicketResult = z.infer<typeof TicketSchema> & {
  cash: number;
  bca: number;
  nobu: number;
};

export async function POST(req: Request) {
  const body = await req.json();
  const { imageBase64, mediaType, menuItems } = body as {
    imageBase64: string;
    mediaType: string;
    menuItems: { id: string; name: string; category: string; price: number | null }[];
  };

  if (!imageBase64) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (mediaType && !SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json(
      {
        error: `Unsupported image format "${mediaType}". Please use JPEG, PNG, GIF, or WEBP (on iPhone, switch Camera > Formats to "Most Compatible" so photos save as JPEG instead of HEIC).`,
      },
      { status: 400 }
    );
  }

  try {
    return await scanTicket(imageBase64, mediaType, menuItems);
  } catch (err) {
    console.error("scan-ticket failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}

async function scanTicket(
  imageBase64: string,
  mediaType: string,
  menuItems: { id: string; name: string; category: string; price: number | null }[]
) {
  const catalog = menuItems
    .map((m) => `${m.id} | ${m.name} | ${m.category} | price=${m.price ?? "unknown"}`)
    .join("\n");

  // Pass 1: force a slow, explicit row-by-row transcription with extended thinking
  // before any totaling. Reading tally marks (turus) and aligning ~9 narrow columns
  // in a rotated photo is error-prone if the model jumps straight to final numbers
  // in one shot without deliberately double-checking each row's arithmetic.
  const { text: transcript } = await generateText({
    model: anthropic("claude-sonnet-5"),
    maxOutputTokens: 16000,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This is a photo of a handwritten daily sales ticker sheet from an Indonesian cafe (Pork Cafe). The sheet may be rotated (sideways or upside down) — mentally rotate it upright before reading.

The sheet is a table with these columns left to right: MENU | CASH (turus/tally marks) | Total qty | Harga satuan | Jumlah cash | BCA (turus/tally marks) | Total qty | Nobu (turus/tally marks) | Total qty | Grand Total | Keterangan.

Tally marks (turus) are drawn in groups of 5: four vertical strokes, then a fifth stroke diagonally crossing them. Count strokes per group carefully, don't estimate.

The top section (numbered 1-7 or so) is the Main menu items, one row per number, in order. Below a blank gap is an unlabeled Add-On items section (e.g. Taichan sate, Pork satay, Telur, Soy milk, Crispy Banana, Otak-otak) — do not skip or merge any row here, even if a row's marks are faint.

Work through this in two explicit stages:

STAGE 1 — Raw observation. Go row by row, top to bottom (Main section first in its printed numeric order, then every Add-On row top to bottom, none skipped or merged). For each row that has any marks at all, describe literally what you see in each of the 3 tally columns before converting anything to a number, e.g. "cash column: one group of 5 strokes plus 2 more single strokes".

STAGE 2 — Numbers + self-check. Convert each row's observation to numbers and output ONE line per row in exactly this format:

ROW | section=<MAIN or ADDON> | <item name as written> | cash_qty=<number> | bca_qty=<number> | nobu_qty=<number> | grand_total_qty=<number written in the Grand Total column for this row> | jumlah_cash_rupiah=<number or blank>

"section" is MAIN for every row in the numbered top section, ADDON for every row in the unlabeled section below the gap — this matters downstream for matching each row to the correct catalog category, so never mix them up.

Then explicitly verify, for every row, that cash_qty + bca_qty + nobu_qty == grand_total_qty. If any row fails this check, go back to your Stage 1 observation for that row, re-examine it, and correct the numbers before finalizing — do not output a row where the arithmetic doesn't match what's printed in its Grand Total cell.

Finally output these two summary lines:

DATE | <the value written next to 'Tanggal', as written, e.g. 02-08-26>
GRAND_TOTAL_RUPIAH | <the rupiah figure written at the very bottom next to "Grand total", if present, else blank>

After Stage 1 and Stage 2 reasoning, your final answer must contain ONLY the ROW lines followed by the two summary lines — no preamble, no extra commentary.`,
          },
          {
            type: "image",
            image: imageBase64,
            mediaType: mediaType || "image/jpeg",
          },
        ],
      },
    ],
  });

  // Pass 2: parse the plain-text transcript (no image) into the structured schema,
  // matching each row's item name to the app's actual menu catalog.
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: TicketSchema,
    prompt: `Here is a row-by-row transcript of a handwritten sales ticker sheet (already tally-counted and self-verified):

${transcript}

Current menu item catalog in this app (id | name | category | price):
${catalog}

For each ROW line, produce one item entry: match its item name to the closest catalog entry by meaning (sheet "Nanban" = catalog "Chicken Nanban", sheet "Crispy Pork Belly Mentai" must NOT be read as "Mental" — match to "Crispy Pork Belly Mentai"; if genuinely no close match, set menuItemId to null). A row's "section" restricts which catalog entries it may match: section=MAIN may only match a catalog entry whose category is "Main", section=ADDON may only match one whose category is "Add On" — never cross-match between them even if a name superficially resembles an item in the other category; if the correctly-categorized catalog has no good match, set menuItemId to null rather than matching the wrong category. Carry over cashQty/bcaQty/nobuQty/qty exactly as given. Skip rows where grand_total_qty is 0 or blank.

Sum every row's jumlah_cash_rupiah into cashFromSheet (null if none of the rows had a value). Convert DATE to ISO YYYY-MM-DD (sheet format is DD-MM-YY, e.g. "02-08-26" = 2026-08-02).`,
  });

  // Revenue by payment method isn't fully printed on the sheet — only Cash has a
  // per-row rupiah column ("Jumlah cash"). BCA and Nobu are tally counts only, so
  // their rupiah value is computed here deterministically from qty × catalog price
  // rather than trusting the model to invent numbers that aren't on the page.
  const priceById = new Map(menuItems.map((m) => [m.id, m.price ?? 0]));
  let bca = 0;
  let nobu = 0;
  let cashComputed = 0;
  for (const item of object.items) {
    const price = item.menuItemId ? (priceById.get(item.menuItemId) ?? 0) : 0;
    bca += item.bcaQty * price;
    nobu += item.nobuQty * price;
    cashComputed += item.cashQty * price;
  }
  const cash = object.cashFromSheet ?? cashComputed;

  return NextResponse.json({ ...object, cash, bca, nobu, _transcript: transcript });
}
