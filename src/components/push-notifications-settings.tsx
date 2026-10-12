"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shouldShowIosHint } from "@/lib/push-alerts";
import { cn } from "@/lib/utils";

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

  const on = state === "enabled";
  const label = state === "loading" ? "Checking…" : on ? "On" : state === "denied" ? "Blocked" : "Off";
  return (
    <Link
      href="/setup?tab=notifications"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        on ? "border-success/25 bg-success/10 text-success" : "border-border bg-surface text-muted-foreground"
      )}
    >
      <Bell className="size-3.5" aria-hidden />
      Alerts on this phone: {label}
      {!on && state === "ready" && <span className="font-semibold text-primary">· Turn on</span>}
    </Link>
  );
}

export function PushNotificationsSettings() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        setMessage(permission === "denied"
          ? "Notifications are blocked for this site. Change the site permission in your browser or device settings to enable them."
          : "Notification permission was not granted.");
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
      setMessage("Push alerts are enabled on this device.");
    } catch (error) {
      console.error("Could not enable push notifications", error);
      setMessage(error instanceof Error ? error.message : "Could not enable push notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
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
      setMessage("Push alerts are disabled on this device.");
    } catch (error) {
      console.error("Could not disable push notifications", error);
      setMessage(error instanceof Error ? error.message : "Could not disable push notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="size-4" />Low-stock push notifications</CardTitle>
        <CardDescription>When a material enters To Order, all opted-in devices receive an alert. While it stays there, reminders arrive daily at 7:00 AM WIB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {state === "loading" ? (
            <Button type="button" variant="outline" disabled><Loader2 className="size-4 animate-spin" />Checking this device…</Button>
          ) : state === "enabled" ? (
            <Button type="button" variant="outline" onClick={() => void disable()} disabled={busy}><BellOff className="size-4" />{busy ? "Updating…" : "Disable on this device"}</Button>
          ) : state === "ready" ? (
            <Button type="button" onClick={() => void enable()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}{busy ? "Enabling…" : "Enable push notifications"}</Button>
          ) : state === "denied" ? (
            <Button type="button" variant="outline" disabled>Notifications are blocked</Button>
          ) : state === "not-configured" ? (
            <Button type="button" variant="outline" disabled>Push notifications are not configured</Button>
          ) : (
            <Button type="button" variant="outline" disabled>Push notifications are unavailable here</Button>
          )}
          {state === "enabled" && <span className="text-sm text-success">Enabled on this device</span>}
        </div>
        {state === "unsupported" && <p className="text-sm text-muted-foreground">This browser does not support Web Push. Try a current browser that supports service workers and push notifications.</p>}
        {state === "not-configured" && <p className="text-sm text-muted-foreground">The server has not been configured for push notifications yet.</p>}
        {state === "denied" && <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Change the site permission in your browser or device settings to enable them.</p>}
        {showIosHint && <p className="text-sm text-muted-foreground">On iPhone or iPad running iOS or iPadOS 16.4 or later, use Share → Add to Home Screen, then open Porcafe POS from its icon before enabling notifications. A regular bookmark does not support these push alerts.</p>}
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
