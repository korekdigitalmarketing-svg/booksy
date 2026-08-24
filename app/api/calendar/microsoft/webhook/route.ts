import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { performSync } from "@/lib/calendar-sync-microsoft";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";

export const runtime = "nodejs";

// GET /api/calendar/microsoft/webhook — Graph's subscription-creation
// validation handshake (https://learn.microsoft.com/graph/webhooks#notification-endpoint-validation).
// Google has no equivalent step; Graph requires this URL to prove it's
// live by echoing back `validationToken` as plain text within 10 seconds
// before it will accept the subscription POST that's waiting on it.
export async function GET(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (!validationToken) {
    return NextResponse.json({ ok: true });
  }
  return new NextResponse(validationToken, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// POST /api/calendar/microsoft/webhook — Graph's change-notification
// receiver. Necessarily public (no session), so clientState — a shared
// secret set at subscription-creation time, carried in the JSON body of
// every notification rather than a header like Google's
// X-Goog-Channel-Token — is the entire authentication story here.
export async function POST(request: NextRequest) {
  let body: { value?: Array<{ subscriptionId?: string; clientState?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  for (const notification of body.value ?? []) {
    if (
      !notification.subscriptionId ||
      notification.clientState !== process.env.MICROSOFT_CALENDAR_WEBHOOK_TOKEN
    ) {
      // Same reasoning as the Google webhook: silently accept rather than
      // signal which check failed to an unauthenticated caller.
      continue;
    }

    const { data: connection } = await supabase
      .from("calendar_connections")
      .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
      .eq("channel_id", notification.subscriptionId)
      .maybeSingle();

    if (!connection) {
      // A stale notification for a subscription that's since been
      // disconnected — not an error, just nothing to do.
      continue;
    }

    try {
      await performSync(connection as CalendarConnectionRow);
    } catch (err) {
      // Graph retries failed webhook deliveries on its own schedule — log
      // and let that retry mechanism do its job rather than inventing ours.
      console.error("Microsoft calendar sync webhook failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
