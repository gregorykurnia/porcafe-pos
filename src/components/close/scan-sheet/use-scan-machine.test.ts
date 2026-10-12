import assert from "node:assert/strict";
import test from "node:test";
import { initialScanMachine, scanMachineReducer } from "./use-scan-machine";

const file = new File(["photo"], "sheet.jpg", { type: "image/jpeg" });
const chosen = scanMachineReducer(initialScanMachine, { type: "photo-chosen", file, photoUrl: "blob:sheet" });

test("walks through a successful scan to review", () => {
  assert.equal(chosen.phase, "compressing");
  const scanning = scanMachineReducer(chosen, { type: "compressed" });
  assert.equal(scanning.phase, "scanning");
  const review = scanMachineReducer(scanning, { type: "scan-succeeded" });
  assert.equal(review.phase, "review");
  assert.equal(review.photoUrl, "blob:sheet");
});

test("a failed scan keeps the photo so it can be retried", () => {
  const failed = scanMachineReducer(scanMachineReducer(chosen, { type: "compressed" }), { type: "scan-failed", message: "No connection." });
  assert.equal(failed.phase, "error");
  assert.equal(failed.error, "No connection.");
  assert.equal(failed.file, file);
  const retrying = scanMachineReducer(failed, { type: "retry" });
  assert.equal(retrying.phase, "compressing");
  assert.equal(retrying.error, null);
});

test("a failed save returns to review with the review kept", () => {
  const review = scanMachineReducer(scanMachineReducer(chosen, { type: "compressed" }), { type: "scan-succeeded" });
  const saving = scanMachineReducer(review, { type: "save-started" });
  assert.equal(saving.phase, "saving");
  assert.equal(scanMachineReducer(saving, { type: "save-failed" }).phase, "review");
  assert.equal(scanMachineReducer(saving, { type: "save-succeeded" }).phase, "idle");
});

test("ignores transitions that do not apply to the current phase", () => {
  assert.equal(scanMachineReducer(initialScanMachine, { type: "scan-succeeded" }), initialScanMachine);
  assert.equal(scanMachineReducer(initialScanMachine, { type: "retry" }), initialScanMachine);
  assert.equal(scanMachineReducer(chosen, { type: "save-started" }), chosen);
  // A late result from a cancelled scan must not reopen it.
  const cancelled = scanMachineReducer(chosen, { type: "scan-failed", message: "Scan cancelled." });
  assert.equal(scanMachineReducer(cancelled, { type: "scan-succeeded" }).phase, "error");
});

test("a new photo can be chosen only when idle or after an error", () => {
  const other = new File(["other"], "other.jpg", { type: "image/jpeg" });
  const reviewing = scanMachineReducer(scanMachineReducer(chosen, { type: "compressed" }), { type: "scan-succeeded" });
  assert.equal(scanMachineReducer(reviewing, { type: "photo-chosen", file: other, photoUrl: "blob:other" }), reviewing);
  assert.equal(scanMachineReducer(reviewing, { type: "reset" }).phase, "idle");
});
