import { createHash, randomUUID } from "node:crypto";
import * as webPush from "web-push";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  getReorderNotificationMessage,
  getInventoryReorderStatus,
  isReorderReminderDue,
  shouldSendInitialReorderAlert,
  type InventoryReorderStatus,
} from "@/lib/reorder-status";
import type { InventoryMaterial } from "@/lib/types";
import type { PushSubscription } from "web-push";

const PUSH_SUBSCRIPTIONS = "pushSubscriptions";
const PUSH_EPISODES = "pushNotificationEpisodes";
const INVENTORY_PATH = "/inventory?tab=suppliers#reorder-overview";

type StoredSubscription = PushSubscription & {
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

type ReorderEpisode = {
  materialId: string;
  materialName: string;
  active: boolean;
  episodeId: string;
  startedOn: string;
  firstReminderOn: string;
  lastReminderDate: string | null;
  lastReminderClaimDate?: string | null;
  lastInitialAlertKey?: string | null;
  updatedAt: number;
};

type InventoryState = {
  materials: InventoryMaterial[];
  stockInitialized: boolean;
  balances: Map<string, number>;
  openOrderMaterialIds: Set<string>;
};

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function subscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function getPushPublicKey(): string | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  return publicKey || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_SUBJECT?.trim() &&
      process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) throw new Error("Web Push is not configured.");
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

export function isSameOriginPushRequest(request: Request): boolean {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin || requestOrigin === "null") return false;
  try {
    const expectedOrigin = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).origin
      : new URL(request.url).origin;
    return new URL(requestOrigin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function normalizePushSubscription(value: unknown): PushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PushSubscription>;
  const endpoint = candidate.endpoint;
  const keys = candidate.keys;
  if (typeof endpoint !== "string" || endpoint.length > 4096) return null;
  if (!isSupportedPushEndpoint(endpoint)) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  if (!/^[A-Za-z0-9_-]+$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]+$/.test(keys.auth)) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function isSupportedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return host === "fcm.googleapis.com" ||
      host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" || host.endsWith(".push.apple.com") ||
      host === "notify.windows.com" || host.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(PUSH_SUBSCRIPTIONS).doc(subscriptionId(subscription.endpoint));
  const existing = await ref.get();
  const now = Date.now();
  const data: StoredSubscription = {
    ...subscription,
    active: true,
    createdAt: existing.exists ? Number(existing.get("createdAt") ?? now) : now,
    updatedAt: now,
  };
  await ref.set(data);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await getAdminFirestore().collection(PUSH_SUBSCRIPTIONS).doc(subscriptionId(endpoint)).delete();
}

export function jakartaDateTime(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  };
}

function nextDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

async function readInventoryState(): Promise<InventoryState> {
  const db = getAdminFirestore();
  const [materialsSnapshot, movementsSnapshot, setupSnapshot, ordersSnapshot] = await Promise.all([
    db.collection("inventoryMaterials").get(),
    db.collection("inventoryMovements").get(),
    db.collection("inventoryStockSetup").doc("default").get(),
    db.collection("inventorySupplierOrders").get(),
  ]);
  const materials = materialsSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as InventoryMaterial[];
  const balances = new Map<string, number>();
  for (const movement of movementsSnapshot.docs) {
    const data = movement.data();
    const materialId = data.materialId;
    const quantity = data.quantity;
    if (typeof materialId !== "string" || typeof quantity !== "number" || !Number.isFinite(quantity)) continue;
    balances.set(materialId, (balances.get(materialId) ?? 0) + quantity);
  }
  const openOrderMaterialIds = new Set<string>();
  for (const order of ordersSnapshot.docs) {
    const data = order.data();
    if (data.status !== "ordered" && data.status !== "partially_received") continue;
    if (!Array.isArray(data.lines)) continue;
    for (const line of data.lines) {
      if (line && typeof line.materialId === "string") openOrderMaterialIds.add(line.materialId);
    }
  }
  return {
    materials,
    stockInitialized: setupSnapshot.get("initialized") === true,
    balances,
    openOrderMaterialIds,
  };
}

function materialStatus(material: InventoryMaterial, state: InventoryState, quantity?: number) {
  const currentQuantity = state.stockInitialized ? quantity ?? state.balances.get(material.id) ?? 0 : null;
  return getInventoryReorderStatus(
    material,
    currentQuantity,
    state.stockInitialized,
    state.openOrderMaterialIds.has(material.id),
  );
}

function notificationMessage(material: InventoryMaterial): string | null {
  return getReorderNotificationMessage(material);
}

function notificationPayload(material: InventoryMaterial): PushPayload | null {
  const body = notificationMessage(material);
  if (!body) return null;
  return {
    title: "Stock needs reordering",
    body,
    url: INVENTORY_PATH,
    tag: `reorder-${material.id}`,
  };
}

async function listActiveSubscriptions(): Promise<Array<{ refId: string; subscription: PushSubscription }>> {
  const snapshot = await getAdminFirestore().collection(PUSH_SUBSCRIPTIONS).where("active", "==", true).get();
  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    const subscription = normalizePushSubscription(data);
    return subscription ? [{ refId: document.id, subscription }] : [];
  });
}

export async function sendPushToAllDevices(payload: PushPayload): Promise<{ sent: number; failed: number; removed: number }> {
  if (!isWebPushConfigured()) throw new Error("Web Push is not configured.");
  configureWebPush();
  const db = getAdminFirestore();
  const subscriptions = await listActiveSubscriptions();
  const results = await Promise.all(subscriptions.map(async ({ refId, subscription }) => {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload), { TTL: 86400 });
      return "sent" as const;
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await db.collection(PUSH_SUBSCRIPTIONS).doc(refId).delete().catch(() => {});
        return "removed" as const;
      }
      console.error("Web Push delivery failed", { subscriptionId: refId, statusCode });
      return "failed" as const;
    }
  }));
  return {
    sent: results.filter((result) => result === "sent").length,
    failed: results.filter((result) => result === "failed").length,
    removed: results.filter((result) => result === "removed").length,
  };
}

async function updateEpisodeAsInactive(materialId: string, now: number): Promise<void> {
  const ref = getAdminFirestore().collection(PUSH_EPISODES).doc(materialId);
  await getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("active") !== true) return;
    transaction.set(ref, { active: false, endedAt: now, updatedAt: now }, { merge: true });
  });
}

async function activateEpisode(
  material: InventoryMaterial,
  date: string,
  options: {
    dailyTriggerKey?: string;
    beforeStatus: InventoryReorderStatus;
    afterStatus: InventoryReorderStatus;
  },
): Promise<{ sendInitial: boolean; payload: PushPayload | null; episodeId: string | null }> {
  const db = getAdminFirestore();
  const ref = db.collection(PUSH_EPISODES).doc(material.id);
  const now = Date.now();
  const payload = notificationPayload(material);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() as Partial<ReorderEpisode> & { lastInitialAlertKey?: string | null } : null;
    const shouldSend = shouldSendInitialReorderAlert(
      options.beforeStatus,
      options.afterStatus,
      options.dailyTriggerKey ?? null,
      current?.lastInitialAlertKey,
      Boolean(payload),
    );

    if (current?.active === true && !shouldSend) return { sendInitial: false, payload: null, episodeId: null };

    const episodeId = randomUUID();
    transaction.set(ref, {
      materialId: material.id,
      materialName: material.name,
      active: true,
      episodeId,
      startedOn: date,
      firstReminderOn: nextDate(date),
      lastReminderDate: null,
      lastReminderClaimDate: null,
      startedAt: now,
      endedAt: null,
      sourceDate: options.dailyTriggerKey ? options.dailyTriggerKey.split(":")[0] : null,
      initialAlertStatus: options.beforeStatus !== "to-order" && options.afterStatus === "to-order"
        ? shouldSend ? "claimed" : payload ? "duplicate-suppressed" : "skipped-invalid-quantity"
        : "not-applicable",
      ...(options.dailyTriggerKey && payload ? { lastInitialAlertKey: options.dailyTriggerKey } : {}),
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    return { sendInitial: shouldSend, payload: shouldSend ? payload : null, episodeId };
  });
}

async function updateEpisodeDelivery(
  materialId: string,
  episodeId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(PUSH_EPISODES).doc(materialId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("episodeId") !== episodeId) return;
    transaction.set(ref, { ...values, updatedAt: Date.now() }, { merge: true });
  });
}

async function reconcileInactiveEpisodes(state: InventoryState, now: number): Promise<void> {
  const db = getAdminFirestore();
  const episodes = await db.collection(PUSH_EPISODES).where("active", "==", true).get();
  await Promise.all(episodes.docs.map(async (episode) => {
    const material = state.materials.find((candidate) => candidate.id === episode.id);
    if (!material || material.active !== true || materialStatus(material, state) !== "to-order") {
      await updateEpisodeAsInactive(episode.id, now);
    }
  }));
}

export async function processDailyCloseReorderNotifications(date: string) {
  const db = getAdminFirestore();
  const eventId = `usage-${date}`;
  const [usageSnapshot, consumptionSnapshot] = await Promise.all([
    db.collection("inventoryUsageEvents").doc(eventId).get(),
    db.collection("inventoryConsumptionEvents").doc(eventId).get(),
  ]);
  if (!usageSnapshot.exists || !consumptionSnapshot.exists) {
    return { processed: 0, sent: 0, skipped: "inventory-usage-not-found" };
  }
  const usage = usageSnapshot.data()!;
  const consumption = consumptionSnapshot.data()!;
  if (usage.sourceDate !== date || usage.sourceRevision !== consumption.sourceRevision) {
    return { processed: 0, sent: 0, skipped: "inventory-usage-out-of-date" };
  }

  const state = await readInventoryState();
  const now = new Date();
  const { date: today } = jakartaDateTime(now);
  await reconcileInactiveEpisodes(state, now.getTime());

  if (!isWebPushConfigured()) {
    return { processed: 0, sent: 0, skipped: "push-not-configured" };
  }

  const quantities = consumption.status === "calculated" && consumption.materialQuantities && typeof consumption.materialQuantities === "object"
    ? consumption.materialQuantities as Record<string, unknown>
    : {};
  const triggerMaterials = Object.entries(quantities)
    .filter(([, quantity]) => typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0)
    .map(([materialId, quantity]) => ({ materialId, quantity: quantity as number }));

  let sent = 0;
  let processed = 0;
  for (const { materialId, quantity } of triggerMaterials) {
    const material = state.materials.find((candidate) => candidate.id === materialId);
    if (!material || material.active !== true) continue;
    processed += 1;
    const afterStatus = materialStatus(material, state);
    const currentBalance = state.balances.get(materialId) ?? 0;
    const beforeStatus = materialStatus(material, state, currentBalance + quantity);
    if (afterStatus !== "to-order") continue;

    const triggerKey = `${date}:${materialId}:${quantity}`;
    const activation = await activateEpisode(material, today, {
      dailyTriggerKey: triggerKey,
      beforeStatus,
      afterStatus,
    });
    if (!activation.sendInitial || !activation.payload) continue;
    try {
      const delivery = await sendPushToAllDevices(activation.payload);
      sent += delivery.sent;
      if (activation.episodeId) {
        await updateEpisodeDelivery(materialId, activation.episodeId, {
          initialAlertStatus: delivery.sent > 0 ? "sent" : delivery.failed > 0 ? "failed" : "no-active-subscriptions",
          ...(delivery.sent > 0 ? { initialAlertSuccessDate: today, initialAlertSentAt: Date.now() } : {}),
        });
      }
      if (delivery.failed > 0) console.error("Some devices did not receive the initial reorder alert", { materialId, failed: delivery.failed });
    } catch (error) {
      if (activation.episodeId) {
        await updateEpisodeDelivery(materialId, activation.episodeId, { initialAlertStatus: "failed" }).catch(() => {});
      }
      console.error("Initial reorder push could not be delivered", { materialId, error });
    }
  }

  return { processed, sent };
}

async function readFreshMaterialStatus(materialId: string) {
  const db = getAdminFirestore();
  const [materialSnapshot, setupSnapshot, movementsSnapshot, ordersSnapshot] = await Promise.all([
    db.collection("inventoryMaterials").doc(materialId).get(),
    db.collection("inventoryStockSetup").doc("default").get(),
    db.collection("inventoryMovements").where("materialId", "==", materialId).get(),
    db.collection("inventorySupplierOrders").get(),
  ]);
  if (!materialSnapshot.exists) return { material: null, status: "not-initialized" as const };
  const material = { id: materialSnapshot.id, ...materialSnapshot.data() } as InventoryMaterial;
  const initialized = setupSnapshot.get("initialized") === true;
  const quantity = movementsSnapshot.docs.reduce((total, movement) => {
    const value = movement.get("quantity");
    return typeof value === "number" && Number.isFinite(value) ? total + value : total;
  }, 0);
  const hasOpenOrder = ordersSnapshot.docs.some((order) => {
    const data = order.data();
    return (data.status === "ordered" || data.status === "partially_received") &&
      Array.isArray(data.lines) && data.lines.some((line: { materialId?: unknown }) => line?.materialId === materialId);
  });
  return {
    material,
    status: material.active !== true
      ? "not-configured" as const
      : getInventoryReorderStatus(material, initialized ? quantity : null, initialized, hasOpenOrder),
  };
}

async function createBaselineEpisode(material: InventoryMaterial, date: string): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(PUSH_EPISODES).doc(material.id);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && snapshot.get("active") === true) return;
    transaction.set(ref, {
      materialId: material.id,
      materialName: material.name,
      active: true,
      episodeId: randomUUID(),
      startedOn: date,
      firstReminderOn: nextDate(date),
      lastReminderDate: null,
      lastReminderClaimDate: null,
      startedAt: now,
      endedAt: null,
      initialAlertStatus: "not-applicable",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  });
}

export async function runDueReorderReminders(now = new Date()) {
  const { date, time } = jakartaDateTime(now);
  if (time < "07:00") return { date, time, sent: 0, skipped: "before-reminder-time" };
  if (!isWebPushConfigured()) return { date, time, sent: 0, skipped: "push-not-configured" };

  const state = await readInventoryState();
  await reconcileInactiveEpisodes(state, now.getTime());
  const activeMaterials = state.materials.filter((material) => material.active === true && materialStatus(material, state) === "to-order");
  for (const material of activeMaterials) await createBaselineEpisode(material, date);

  const subscriptions = await listActiveSubscriptions();
  if (subscriptions.length === 0) return { date, time, sent: 0, skipped: "no-active-subscriptions" };

  const db = getAdminFirestore();
  let sent = 0;
  let due = 0;
  let skippedQuantity = 0;
  for (const material of activeMaterials) {
    const ref = db.collection(PUSH_EPISODES).doc(material.id);
    const episodeSnapshot = await ref.get();
    if (!episodeSnapshot.exists || episodeSnapshot.get("active") !== true) continue;
    const firstReminderOn = episodeSnapshot.get("firstReminderOn");
    const lastReminderClaimDate = episodeSnapshot.get("lastReminderClaimDate");
    if (!isReorderReminderDue({
      active: episodeSnapshot.get("active") === true,
      date,
      firstReminderOn: typeof firstReminderOn === "string" ? firstReminderOn : null,
      claimedReminderDate: typeof lastReminderClaimDate === "string" ? lastReminderClaimDate : null,
    })) continue;

    const fresh = await readFreshMaterialStatus(material.id);
    if (!fresh.material || fresh.status !== "to-order") {
      await updateEpisodeAsInactive(material.id, now.getTime());
      continue;
    }
    const payload = notificationPayload(fresh.material);
    if (!payload) {
      skippedQuantity += 1;
      console.warn("Skipped reorder reminder because the configured reorder quantity is missing or invalid", { materialId: material.id });
      continue;
    }

    const claim = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const nextReminderOn = snapshot.get("firstReminderOn");
      if (!isReorderReminderDue({
        active: snapshot.get("active") === true,
        date,
        firstReminderOn: typeof nextReminderOn === "string" ? nextReminderOn : null,
        claimedReminderDate: typeof snapshot.get("lastReminderClaimDate") === "string" ? snapshot.get("lastReminderClaimDate") as string : null,
      })) return false;
      transaction.set(ref, { lastReminderClaimDate: date, lastReminderAttemptAt: now.getTime(), updatedAt: now.getTime() }, { merge: true });
      return typeof snapshot.get("episodeId") === "string" ? snapshot.get("episodeId") as string : null;
    });
    if (!claim) continue;

    due += 1;
    try {
      const delivery = await sendPushToAllDevices(payload);
      sent += delivery.sent;
      if (delivery.sent > 0) {
        await updateEpisodeDelivery(material.id, claim, { lastReminderDate: date, lastReminderSentAt: now.getTime() });
      }
      if (delivery.failed > 0) console.error("Some devices did not receive the reorder reminder", { materialId: material.id, failed: delivery.failed });
    } catch (error) {
      console.error("Reorder reminder push could not be delivered", { materialId: material.id, error });
    }
  }
  return { date, time, sent, due, skippedQuantity };
}
