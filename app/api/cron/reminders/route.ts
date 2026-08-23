import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import { sendReminder } from "@/lib/notifications";

export const runtime = "nodejs";

// Runs hourly (vercel.json). Queries confirmed bookings starting in the
// next 24–25 hours — a 1-hour-wide window matching the cron's own
// frequency, so every booking is caught in exactly one run. The
// notifications_log dedupe insert inside sendReminder is what actually
// guarantees "at most once" even if this job's window overlaps a retry.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const now = DateTime.utc();
  const windowStart = now.plus({ hours: 24 }).toISO() as string;
  const windowEnd = now.plus({ hours: 25 }).toISO() as string;

  const supabase = createServiceClient();
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      { status: 500 },
    );
  }

  const results = await Promise.allSettled(
    (bookings ?? []).map((b) => sendReminder(b.id)),
  );
  const sent = results.filter((r) => r.status === "fulfilled" && r.value === "sent").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ checked: bookings?.length ?? 0, sent, failed });
}
