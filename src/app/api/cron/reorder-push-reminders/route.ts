import { jakartaDateTime, runDueReorderReminders } from "@/lib/push-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "Scheduled runner is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const now = new Date();
    const result = await runDueReorderReminders(now);
    const { date, time } = jakartaDateTime(now);
    return Response.json({ ...result, checkedAt: `${date}T${time}`, timeZone: "Asia/Jakarta" });
  } catch (error) {
    console.error("Failed to send scheduled reorder push reminders", error);
    return Response.json({ error: "Scheduled reorder reminders could not be processed." }, { status: 500 });
  }
}
