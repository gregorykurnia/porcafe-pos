// Writes are refused while the device is offline. Firestore would otherwise queue a plain write and send it
// later, when the day may have changed on another phone. Transactions already fail offline. Reads still
// come from the device cache (see src/lib/firebase.ts).

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function assertOnline(): void {
  if (isOffline()) throw new Error("You're offline. Connect to save. Nothing was changed.");
}
