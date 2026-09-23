import { getAdminFirestore } from "@/lib/firebase-admin";
import { runDueSupplierDeliverySchedules } from "@/lib/supplier-schedule-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jakartaDateTime(now: Date): { date: string; time: string } {
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

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "Scheduled runner is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const { date, time } = jakartaDateTime(new Date());
    const result = await runDueSupplierDeliverySchedules(getAdminFirestore(), date, time);
    return Response.json({ ...result, checkedAt: `${date}T${time}`, timeZone: "Asia/Jakarta" });
  } catch (error) {
    console.error("Failed to run scheduled supplier deliveries", error);
    return Response.json({ error: "Scheduled supplier deliveries could not be processed." }, { status: 500 });
  }
}
