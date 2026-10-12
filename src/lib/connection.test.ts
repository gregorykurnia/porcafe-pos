import assert from "node:assert/strict";
import test from "node:test";
import { assertOnline, isOffline } from "./connection";

// Runs a check with a stand-in for the browser's navigator, then puts the real one back.
function withNavigator(value: unknown, run: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value, configurable: true });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

test("a write is refused while the device reports offline", () => {
  withNavigator({ onLine: false }, () => {
    assert.throws(() => assertOnline(), /You're offline\. Connect to save/);
  });
});

test("a write goes ahead when the device is online, or when there is no browser", () => {
  withNavigator({ onLine: true }, () => assert.doesNotThrow(() => assertOnline()));
  withNavigator(undefined, () => assert.doesNotThrow(() => assertOnline()));
});

test("the device counts as offline only when the browser says so", () => {
  withNavigator({ onLine: false }, () => assert.equal(isOffline(), true));
  withNavigator({ onLine: true }, () => assert.equal(isOffline(), false));
  withNavigator(undefined, () => assert.equal(isOffline(), false));
});
