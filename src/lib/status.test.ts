import assert from "node:assert/strict";
import test from "node:test";
import {
  closeStatusView,
  orderStatusView,
  recipeStatusView,
  reviewStatusView,
  stockStatusView,
  usageStatusView,
} from "./status";
import { STOCK_STATUS_META, type StockStatus } from "./stock-status";

test("a close shows its saved status, unsaved edits first, and a missing day as not started", () => {
  assert.deepEqual(closeStatusView("complete"), { label: "Complete", tone: "success" });
  assert.deepEqual(closeStatusView("draft"), { label: "Draft", tone: "neutral" });
  assert.deepEqual(closeStatusView("no_sales"), { label: "No sales", tone: "neutral" });
  assert.deepEqual(closeStatusView(null), { label: "Not started", tone: "neutral" });
  assert.deepEqual(closeStatusView("complete", { unsaved: true }), { label: "Unsaved changes", tone: "warning" });
});

test("stock status uses the same label and tone as the stock table for every status", () => {
  const statuses = Object.keys(STOCK_STATUS_META) as StockStatus[];
  for (const status of statuses) {
    assert.deepEqual(stockStatusView(status), {
      label: STOCK_STATUS_META[status].label,
      tone: STOCK_STATUS_META[status].tone,
    });
  }
  assert.equal(stockStatusView("to-order").tone, "warning");
  assert.equal(stockStatusView("negative").tone, "danger");
});

test("order, recipe, usage and review statuses keep their existing labels", () => {
  assert.deepEqual(orderStatusView("ordered"), { label: "Ordered / On the Way", tone: "info" });
  assert.deepEqual(orderStatusView("partially_received"), { label: "Partially Received", tone: "primary" });
  assert.deepEqual(orderStatusView("cancelled"), { label: "Cancelled", tone: "danger" });
  assert.deepEqual(recipeStatusView("needs-review"), { label: "Needs review", tone: "warning" });
  assert.deepEqual(recipeStatusView("active"), { label: "Active", tone: "success" });
  assert.deepEqual(usageStatusView("pending-draft"), { label: "Waiting for close", tone: "neutral" });
  assert.deepEqual(usageStatusView("calculated-with-exclusions"), { label: "Calculated with exclusions", tone: "info" });
  assert.deepEqual(reviewStatusView("approved"), { label: "Approved", tone: "success" });
  assert.deepEqual(reviewStatusView("needs-review"), { label: "Needs review", tone: "warning" });
});
