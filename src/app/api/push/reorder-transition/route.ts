import { isSameOriginPushRequest, processDailyCloseReorderNotifications } from "@/lib/push-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOriginPushRequest(request)) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const body = await request.json() as { date?: unknown };
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return Response.json({ error: "A valid daily close date is required." }, { status: 400 });
    }
    const result = await processDailyCloseReorderNotifications(body.date);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Could not process reorder push notifications", error);
    return Response.json({ error: "Reorder notifications could not be processed." }, { status: 500 });
  }
}
