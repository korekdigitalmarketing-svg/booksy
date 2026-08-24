import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshAccessToken as ensureFreshGoogleToken, registerWatchChannel } from "@/lib/calendar-sync";
import {
  ensureFreshAccessToken as ensureFreshMicrosoftToken,
  registerSubscription,
} from "@/lib/calendar-sync-microsoft";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Runs daily (vercel.json). Google's channels last up to 30 days, so a
// 3-day renewal threshold is comfortable; Graph's subscriptions last at
// most ~2.94 days, so they need a much shorter threshold to guarantee a
// daily cron catches every one before it lapses — 36 hours leaves a full
// day of slack even if one day's run fails outright. A missed renewal
// doesn't lose data either way: the local cache just goes stale until the
// next successful webhook, which never arrives once the channel's dead —
// this cron is what prevents that.
const GOOGLE_RENEWAL_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const MICROSOFT_RENEWAL_THRESHOLD_MS = 36 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const supabase = createServiceClient();
  let renewed = 0;
  let failed = 0;

  const googleSoon = new Date(Date.now() + GOOGLE_RENEWAL_THRESHOLD_MS).toISOString();
  const { data: googleConnections, error: googleError } = await supabase
    .from("calendar_connections")
    .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
    .eq("provider", "google")
    .lt("channel_expires_at", googleSoon);

  if (googleError) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: googleError.message } }, { status: 500 });
  }

  for (const connection of googleConnections ?? []) {
    try {
      const accessToken = await ensureFreshGoogleToken(connection as CalendarConnectionRow);
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
      console.error(`Failed to renew Google calendar channel for connection ${connection.id}`, err);
      failed++;
    }
  }

  const microsoftSoon = new Date(Date.now() + MICROSOFT_RENEWAL_THRESHOLD_MS).toISOString();
  const { data: microsoftConnections, error: microsoftError } = await supabase
    .from("calendar_connections")
    .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
    .eq("provider", "microsoft")
    .lt("channel_expires_at", microsoftSoon);

  if (microsoftError) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: microsoftError.message } }, { status: 500 });
  }

  for (const connection of microsoftConnections ?? []) {
    try {
      const accessToken = await ensureFreshMicrosoftToken(connection as CalendarConnectionRow);
      const subscription = await registerSubscription(
        accessToken,
        `${appUrl()}/api/calendar/microsoft/webhook`,
      );
      await supabase
        .from("calendar_connections")
        .update({
          channel_id: subscription.id,
          channel_expires_at: subscription.expirationDateTime,
        })
        .eq("id", connection.id);
      renewed++;
    } catch (err) {
      console.error(`Failed to renew Microsoft calendar subscription for connection ${connection.id}`, err);
      failed++;
    }
  }

  return NextResponse.json({ renewed, failed });
}
