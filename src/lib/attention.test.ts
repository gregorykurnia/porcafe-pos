import assert from "node:assert/strict";
import test from "node:test";
import { getAttentionItems } from "./reporting";
import type { DailyItemLog, SalesEntry } from "./types";

const today = "2026-10-12";

function log(date: string, status: DailyItemLog["status"], quantities: Record<string, number>): DailyItemLog {
  return { id: date, date, quantities, totalQty: Object.values(quantities).reduce((a, b) => a + b, 0), status, source: "manual", createdAt: 1, updatedAt: 1 };
}

function sale(date: string, total: number): SalesEntry {
  return { id: `s-${date}`, date, bca: total, cash: 0, soundbox: 0, other: 0, total, createdAt: 1 };
}

test("today's close is flagged when it has not started, or is still a draft", () => {
  assert.deepEqual(getAttentionItems({ today, dailyLogs: [], salesEntries: [] }).map((i) => i.kind), ["today"]);
  assert.equal(getAttentionItems({ today, dailyLogs: [log(today, "draft", { a: 1 })], salesEntries: [] })[0].severity, "warning");
  const done = getAttentionItems({ today, dailyLogs: [log(today, "complete", { a: 1 }), ], salesEntries: [sale(today, 10)] });
  assert.equal(done.some((i) => i.kind === "today"), false);
});

test("drafts from the last 14 days are listed, older ones are not", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [log("2026-10-11", "draft", { a: 1 }), log("2026-09-29", "draft", { a: 1 }), log("2026-09-20", "draft", { a: 1 })],
    salesEntries: [],
  });
  // Fourteen days back from 12 October is 28 September: 29 September is listed, 20 September is not.
  assert.deepEqual(items.filter((i) => i.kind === "draft").map((i) => i.date), ["2026-10-11", "2026-09-29"]);
});

test("portions and revenue that disagree are flagged in both directions", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [log("2026-10-10", "complete", { a: 4 }), log("2026-10-09", "complete", { a: 2 })],
    salesEntries: [sale("2026-10-09", 80_000), sale("2026-10-08", 50_000)],
  });
  assert.deepEqual(items.filter((i) => i.kind === "portions-without-revenue").map((i) => i.date), ["2026-10-10"]);
  assert.deepEqual(items.filter((i) => i.kind === "revenue-without-portions").map((i) => i.date), ["2026-10-08"]);
});

test("stock and delivery items appear only when the counts are given and above zero", () => {
  const base = { today, dailyLogs: [log(today, "complete", { a: 1 })], salesEntries: [sale(today, 1)] };
  assert.equal(getAttentionItems(base).length, 0);
  const withStock = getAttentionItems({ ...base, stock: { toOrder: 3, negative: 1 }, scheduledToConfirm: 2 });
  assert.deepEqual(withStock.map((i) => i.kind), ["negative-stock", "to-order", "scheduled-to-confirm"]);
  assert.equal(withStock[1].href, "/inventory?tab=to-order");
  assert.equal(getAttentionItems({ ...base, stock: { toOrder: 0, negative: 0 }, scheduledToConfirm: 0 }).length, 0);
});

test("portions and revenue are compared only over the recent window", () => {
  const items = getAttentionItems({
    today,
    dailyLogs: [],
    salesEntries: [sale("2026-08-01", 90_000), sale("2026-10-08", 50_000)],
  });
  assert.deepEqual(items.filter((i) => i.kind === "revenue-without-portions").map((i) => i.date), ["2026-10-08"]);
});
