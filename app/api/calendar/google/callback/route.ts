import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  exchangeCodeForTokens,
  registerWatchChannel,
  performSync,
  type CalendarConnectionRow,
} from "@/lib/calendar-sync";

export const runtime = "nodejs";

const STATE_COOKIE = "google_calendar_oauth_state";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function settingsRedirect(status: "connected" | "error"): NextResponse {
  const url = new URL("/dashboard/settings", appUrl());
  url.searchParams.set("calendar", status);
  return NextResponse.redirect(url);
}

// GET /api/calendar/google/callback — Google redirects here after the
// host approves (or denies) access. Every failure path redirects back to
// Settings with ?calendar=error rather than throwing: this is a browser
// navigation, not a JSON API, and a raw 500 here would strand the host
// on an unstyled error page mid-connect.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect("error");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Shouldn't happen with prompt=consent, but without a refresh token
      // sync would silently die the moment the access token expires — a
      // connection that can't stay connected is worse than none at all.
      return settingsRedirect("error");
    }

    const serviceClient = createServiceClient();
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { data: connection, error: upsertError } = await serviceClient
      .from("calendar_connections")
      .upsert(
        {
          owner_id: user.id,
          provider: "google",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: tokenExpiresAt,
          external_calendar_id: "primary",
        },
        { onConflict: "owner_id,provider" },
      )
      .select("id, owner_id, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
      .single();

    if (upsertError || !connection) {
      return settingsRedirect("error");
    }

    const channel = await registerWatchChannel(
      tokens.access_token,
      connection.external_calendar_id,
      `${appUrl()}/api/calendar/google/webhook`,
    );

    await serviceClient
      .from("calendar_connections")
      .update({
        channel_id: channel.id,
        resource_id: channel.resourceId,
        channel_expires_at: channel.expiration,
      })
      .eq("id", connection.id);

    await performSync(connection as CalendarConnectionRow);

    return settingsRedirect("connected");
  } catch (err) {
    console.error("Google Calendar connect failed", err);
    return settingsRedirect("error");
  }
}
