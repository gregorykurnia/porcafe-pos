import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { AsyncSection } from "./async-section";
import { Stat } from "./stat";
import { StatusBadge } from "./status-badge";

// Rendered to static markup, so the components are checked without a browser.

test("Stat shows its label, period, value and a signed change with the colour that matches the move", () => {
  const up = renderToStaticMarkup(createElement(Stat, { label: "Reported total", range: "1–12 Oct 2026", value: "Rp 1", delta: 0.12, deltaLabel: "vs 1–12 Sep" }));
  assert.match(up, /Reported total/);
  assert.match(up, / · 1–12 Oct 2026/);
  assert.match(up, /12%/);
  assert.match(up, /text-success/);
  assert.match(up, /vs 1–12 Sep/);

  const downBad = renderToStaticMarkup(createElement(Stat, { label: "Net", value: "Rp 1", delta: -0.2 }));
  assert.match(downBad, /text-danger/);

  const downGoodForStock = renderToStaticMarkup(createElement(Stat, { label: "To order", value: "3", delta: -0.2, deltaUpIsGood: false }));
  assert.match(downGoodForStock, /text-success/);
});

test("Stat without a delta shows no change line", () => {
  const markup = renderToStaticMarkup(createElement(Stat, { label: "Average", value: "Rp 2", delta: null }));
  assert.doesNotMatch(markup, /%/);
});

test("AsyncSection shows the skeleton while loading, and never the children or an empty state", () => {
  const markup = renderToStaticMarkup(createElement(AsyncSection, { status: "loading", emptyTitle: "Nothing yet", label: "Loading revenue" }, createElement("p", null, "figures")));
  assert.match(markup, /aria-label="Loading revenue"/);
  assert.doesNotMatch(markup, /figures/);
  assert.doesNotMatch(markup, /Nothing yet/);
});

test("AsyncSection offers a retry only when a retry handler is given", () => {
  const withRetry = renderToStaticMarkup(createElement(AsyncSection, { status: "error", onRetry: () => undefined }));
  assert.match(withRetry, /role="alert"/);
  assert.match(withRetry, />Retry</);
  const withoutRetry = renderToStaticMarkup(createElement(AsyncSection, { status: "error" }));
  assert.doesNotMatch(withoutRetry, />Retry</);
});

test("AsyncSection shows its empty title and action, and the children once ready", () => {
  const empty = renderToStaticMarkup(createElement(AsyncSection, { status: "empty", emptyTitle: "No entries yet", emptyAction: createElement("a", { href: "/items" }, "Open Daily close") }));
  assert.match(empty, /No entries yet/);
  assert.match(empty, /Open Daily close/);
  const ready = renderToStaticMarkup(createElement(AsyncSection, { status: "ready" }, createElement("p", null, "figures")));
  assert.match(ready, /figures/);
});

test("StatusBadge shows the label with its tone colour", () => {
  const markup = renderToStaticMarkup(createElement(StatusBadge, { view: { label: "Partially Received", tone: "primary" } }));
  assert.match(markup, /Partially Received/);
  assert.match(markup, /text-primary/);
  const warning = renderToStaticMarkup(createElement(StatusBadge, { view: { label: "Needs review", tone: "warning" } }));
  assert.match(warning, /text-warning/);
});
