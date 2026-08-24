import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { performSync } from "@/lib/calendar-sync";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";

export const runtime = "nodejs";

// POST /api/calendar/google/webhook — Google's push-notification receiver.
// The request carries no event data, only headers saying "channel X
// changed, go look" (https://developers.google.com/calendar/api/guides/push).
// No session, no CSRF token — this endpoint is necessarily public, so the
// X-Goog-Channel-Token check (a shared secret set at registration time,
// see registerWatchChannel) is the entire authentication story here.
export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceState = request.headers.get("x-goog-resource-state");
  const channelToken = request.headers.get("x-goog-channel-token");

  if (!channelId || channelToken !== process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN) {
    // Deliberately a plain 200, not 401/403: telling an unauthenticated
    // caller which part of the check failed is free reconnaissance, and
    // Google itself doesn't care about the response body — only that a
    // channel doesn't get flagged unhealthy. Same reasoning applies below.
    return NextResponse.json({ ok: true });
  }

  // "sync" is Google's initial confirmation that the channel was created,
  // not a real change — nothing to sync yet.
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();
  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!connection) {
    // A stale notification for a channel that's since been disconnected
    // — not an error, just nothing to do.
    return NextResponse.json({ ok: true });
  }

  try {
    await performSync(connection as CalendarConnectionRow);
  } catch (err) {
    // Google retries failed webhook deliveries on its own schedule — log
    // and let that retry mechanism do its job rather than inventing ours.
    console.error("Calendar sync webhook failed", err);
  }

  return NextResponse.json({ ok: true });
}
