import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshAccessToken, registerWatchChannel, type CalendarConnectionRow } from "@/lib/calendar-sync";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Runs daily (vercel.json) — well within this before Google's channel
// expiry (max 30 days), so once-daily precision is genuinely fine here,
// unlike a would-be polling sync. Re-registers any channel expiring
// within the next 3 days; a missed renewal doesn't lose data (the local
// cache just goes stale until the host's NEXT webhook, which never
// arrives once the channel's dead — this cron is what prevents that).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const supabase = createServiceClient();
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connections, error } = await supabase
    .from("calendar_connections")
    .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
    .eq("provider", "google")
    .lt("channel_expires_at", soon);

  if (error) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error.message } }, { status: 500 });
  }

  let renewed = 0;
  let failed = 0;

  for (const connection of connections ?? []) {
    try {
      const accessToken = await ensureFreshAccessToken(connection as CalendarConnectionRow);
      const channel = await registerWatchChannel(
        accessToken,
        connection.external_calendar_id,
        `${appUrl()}/api/calendar/google/webhook`,
      );
      await supabase
        .from("calendar_connections")
        .update({
          channel_id: channel.id,
          resource_id: channel.resourceId,
          channel_expires_at: channel.expiration,
        })
        .eq("id", connection.id);
      renewed++;
    } catch (err) {
      // One host's expired/revoked refresh token shouldn't stop the rest
      // of the batch from renewing — log and keep going.
      console.error(`Failed to renew calendar channel for connection ${connection.id}`, err);
      failed++;
    }
  }

  return NextResponse.json({ renewed, failed });
}
