import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import { sendReminder } from "@/lib/notifications";

export const runtime = "nodejs";

// Runs daily on Vercel Hobby. A 24–48 hour window catches every booking
// despite the once-daily cadence; notifications_log still guarantees
// at-most-once delivery when retries overlap.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const now = DateTime.utc();
  const windowStart = now.plus({ hours: 24 }).toISO() as string;
  const windowEnd = now.plus({ hours: 48 }).toISO() as string;

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
