import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl } from "@/lib/calendar-sync";

export const runtime = "nodejs";

const STATE_COOKIE = "google_calendar_oauth_state";

// GET /api/calendar/google/connect — host-only. Starts the OAuth flow by
// redirecting to Google's consent screen. The state value is stored in a
// short-lived httpOnly cookie and re-checked in the callback — Google's
// OAuth flow provides no other CSRF protection, so this is the only thing
// standing between a host and a forged callback request.
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const state = crypto.randomUUID();
  let authUrl: string;
  try {
    // Throws if GOOGLE_CLIENT_ID isn't configured — a real possibility
    // before the host's Google Cloud OAuth app is set up, not just a
    // theoretical one. Caught here rather than left to crash into an
    // unstyled 500, same reasoning as every failure path in the callback.
    authUrl = getGoogleAuthUrl(state);
  } catch (err) {
    console.error("Failed to build Google OAuth URL", err);
    const url = new URL("/dashboard/settings", appUrl);
    url.searchParams.set("calendar", "error");
    return NextResponse.redirect(url);
  }

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for a consent-screen round trip
    path: "/",
  });

  return NextResponse.redirect(authUrl);
}
