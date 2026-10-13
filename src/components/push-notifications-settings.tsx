"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Banner } from "@/components/patterns/banner";
import { StatusChip, ToneShape, type StatusTone } from "@/components/patterns/status-chip";
import { Button } from "@/components/ui/button";
import { shouldShowIosHint } from "@/lib/push-alerts";

export type PushState = "loading" | "ready" | "enabled" | "unsupported" | "not-configured" | "denied";

function decodeVapidKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

async function readPublicKey(): Promise<string | null> {
  const response = await fetch("/api/push/subscriptions", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { publicKey?: unknown };
  return typeof data.publicKey === "string" && data.publicKey.length > 0 ? data.publicKey : null;
}

/** What this device can do for push alerts right now, and the server's public key for subscribing. */
export async function readPushState(): Promise<{ state: PushState; publicKey: string | null }> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { state: "unsupported", publicKey: null };
  try {
    const [key, registration] = await Promise.all([readPublicKey(), navigator.serviceWorker.getRegistration()]);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) return { state: "enabled", publicKey: key };
    if (Notification.permission === "denied") return { state: "denied", publicKey: key };
    return { state: key ? "ready" : "not-configured", publicKey: key };
  } catch (error) {
    console.error("Could not load push notification settings", error);
    return { state: "not-configured", publicKey: null };
  }
}

/** A compact status for the Stock header. Turning alerts on happens in Setup, under Notifications. */
export function PushAlertsChip() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const result = await readPushState();
      if (!cancelled) setState(result.state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden where alerts cannot work at all, so the header stays uncluttered.
  if (state === "unsupported" || state === "not-configured") return null;

  // Canopy push status (DESIGN_SYSTEM §6): word, shape and tone together. Checking is info, Blocked is danger.
  const on = state === "enabled";
  const label = state === "loading" ? "Checking…" : on ? "On" : state === "denied" ? "Blocked" : "Off";
  const tone: StatusTone = state === "loading" ? "info" : on ? "ok" : state === "denied" ? "danger" : "neutral";
  return (
    <Link
      href="/setup?tab=notifications"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2 pl-4 text-small whitespace-nowrap text-ink shadow-card hover:bg-sunken"
    >
      <Bell className="size-4 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
      <span>Alerts on this phone</span>
      <StatusChip tone={tone}>{label}</StatusChip>
      {!on && state === "ready" && <span className="font-medium text-accent underline underline-offset-4">Turn on</span>}
    </Link>
  );
}

type MessageTone = "ok" | "neutral" | "danger";

// Device states (inventory §3.12) with the Push chip set (DESIGN_SYSTEM §6): word, shape and tone together.
const DEVICE_STATE: Record<PushState, { label: string; tone: StatusTone; text: string }> = {
  loading: { label: "Checking", tone: "info", text: "Checking this device." },
  enabled: { label: "On", tone: "ok", text: "Enabled on this device." },
  ready: { label: "Off", tone: "neutral", text: "Ready to enable on this device." },
  denied: { label: "Blocked", tone: "danger", text: "Blocked for this site." },
  "not-configured": { label: "Unavailable", tone: "neutral", text: "Not configured on the server." },
  unsupported: { label: "Unavailable", tone: "neutral", text: "Unsupported browser." },
};

export function PushNotificationsSettings() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: MessageTone } | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      const result = await readPushState();
      if (cancelled) return;
      setPublicKey(result.publicKey);
      setState(result.state);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      setShowIosHint(shouldShowIosHint(navigator.userAgent, standalone));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey || state !== "ready") return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        setMessage(permission === "denied"
          ? { text: "Notifications are blocked for this site. Change the site permission in your browser or device settings to enable them.", tone: "danger" }
          : { text: "Notification permission was not granted.", tone: "neutral" });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("The device could not be registered with the notification service. Try again later.");
      }
      setState("enabled");
      setMessage({ text: "Push alerts are enabled on this device.", tone: "ok" });
    } catch (error) {
      console.error("Could not enable push notifications", error);
      setMessage({ text: error instanceof Error ? error.message : "Could not enable push notifications on this device.", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("The device could not be removed from the notification service. Try again.");
        await subscription.unsubscribe();
      }
      setState(publicKey ? "ready" : "not-configured");
      setMessage({ text: "Push alerts are disabled on this device.", tone: "ok" });
    } catch (error) {
      console.error("Could not disable push notifications", error);
      setMessage({ text: error instanceof Error ? error.message : "Could not disable push notifications on this device.", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const device = DEVICE_STATE[state];

  return (
    <section aria-labelledby="push-settings-title" className="space-y-5 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card desk:p-6">
      <div>
        <h2 id="push-settings-title" className="font-display text-title-2 text-ink">Low-stock push notifications</h2>
        <p className="mt-1 text-body text-ink-muted">
          When a material enters To order, all opted-in devices receive an alert. While it stays there, reminders arrive daily at 7:00 AM WIB.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="min-w-0">
          <p className="text-small text-ink-muted">Stock alerts on this device</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusChip tone={device.tone}>{device.label}</StatusChip>
            <span className="text-body text-ink">{device.text}</span>
          </div>
        </div>
        <div className="shrink-0">
          {state === "loading" ? (
            <Button variant="secondary" loading disabled>Checking this device…</Button>
          ) : state === "enabled" ? (
            <Button variant="secondary" onClick={() => void disable()} loading={busy} disabled={busy}>
              {busy ? "Updating…" : "Disable on this device"}
            </Button>
          ) : state === "ready" ? (
            <Button onClick={() => void enable()} loading={busy} disabled={busy}>
              {busy ? "Enabling…" : "Enable push notifications"}
            </Button>
          ) : state === "denied" ? (
            <Button variant="secondary" disabled>Notifications are blocked</Button>
          ) : state === "not-configured" ? (
            <Button variant="secondary" disabled>Push notifications are not configured</Button>
          ) : (
            <Button variant="secondary" disabled>Push notifications are unavailable here</Button>
          )}
        </div>
      </div>

      {state === "denied" ? (
        <Banner tone="danger">
          Notifications are blocked for this site. Change the site permission in your browser or device settings to enable them.
        </Banner>
      ) : null}
      {state === "not-configured" ? <p className="text-small text-ink-muted">The server has not been configured for push notifications yet.</p> : null}
      {state === "unsupported" ? (
        <p className="text-small text-ink-muted">This browser does not support Web Push. Try a current browser that supports service workers and push notifications.</p>
      ) : null}
      {showIosHint ? (
        <Banner tone="info">
          On iPhone or iPad running iOS or iPadOS 16.4 or later, use Share → Add to Home Screen, then open Porcafe POS from its icon before enabling notifications. A regular bookmark does not support these push alerts.
        </Banner>
      ) : null}
      {message ? (
        <p role="status" className="flex items-start gap-2 text-small text-ink">
          <ToneShape tone={message.tone} className={message.tone === "ok" ? "mt-1 text-ok" : message.tone === "danger" ? "mt-1 text-danger" : "mt-1 text-neutral"} />
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
