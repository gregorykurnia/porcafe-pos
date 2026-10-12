import assert from "node:assert/strict";
import test from "node:test";
import { SETUP_TABS, STOCK_TABS, isSetupTab, setupTabFromParam, stockTabFromParam } from "./workspace-tabs";

test("every Setup tab key is unique and the first tab is the default", () => {
  const keys = SETUP_TABS.map((tab) => tab.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(setupTabFromParam(null), "menu");
  assert.equal(setupTabFromParam("nope"), "menu");
});

test("a known Setup tab opens that tab, and unknown values are not Setup tabs", () => {
  assert.equal(setupTabFromParam("notifications"), "notifications");
  assert.equal(setupTabFromParam("data"), "data");
  assert.equal(isSetupTab("usage"), false);
  assert.equal(isSetupTab(""), false);
});

test("Stock keeps its four tabs and opens Stock for anything else", () => {
  assert.deepEqual(STOCK_TABS.map((tab) => tab.key), ["stock", "to-order", "orders", "usage"]);
  assert.equal(stockTabFromParam(null), "stock");
  assert.equal(stockTabFromParam("usage"), "usage");
  assert.equal(stockTabFromParam("orders"), "orders");
  assert.equal(stockTabFromParam("to-order"), "to-order");
});

test("the combined suppliers link opens To order, and the moved sections fall back to Stock", () => {
  assert.equal(stockTabFromParam("suppliers"), "to-order");
  assert.equal(stockTabFromParam("materials"), "stock");
  assert.equal(stockTabFromParam("recipes"), "stock");
  assert.equal(stockTabFromParam("import"), "stock");
});
