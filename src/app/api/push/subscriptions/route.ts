import {
  deletePushSubscription,
  getPushPublicKey,
  isSameOriginPushRequest,
  isSupportedPushEndpoint,
  isWebPushConfigured,
  normalizePushSubscription,
  savePushSubscription,
} from "@/lib/push-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ publicKey: isWebPushConfigured() ? getPushPublicKey() : null }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginPushRequest(request)) return Response.json({ error: "Forbidden." }, { status: 403 });
  if (!isWebPushConfigured()) return Response.json({ error: "Push notifications are not configured." }, { status: 503 });
  try {
    const subscription = normalizePushSubscription(await request.json());
    if (!subscription) return Response.json({ error: "Invalid push subscription." }, { status: 400 });
    await savePushSubscription(subscription);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not save push subscription", error);
    return Response.json({ error: "Could not save this device's push subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginPushRequest(request)) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || body.endpoint.length > 4096) {
      return Response.json({ error: "Invalid subscription endpoint." }, { status: 400 });
    }
    if (!isSupportedPushEndpoint(body.endpoint)) {
      return Response.json({ error: "Invalid subscription endpoint." }, { status: 400 });
    }
    await deletePushSubscription(body.endpoint);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not remove push subscription", error);
    return Response.json({ error: "Could not remove this device's push subscription." }, { status: 500 });
  }
}
