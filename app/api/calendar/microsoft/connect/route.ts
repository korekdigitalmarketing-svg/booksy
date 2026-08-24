import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMicrosoftAuthUrl } from "@/lib/calendar-sync-microsoft";

export const runtime = "nodejs";

const STATE_COOKIE = "microsoft_calendar_oauth_state";

// GET /api/calendar/microsoft/connect — host-only. Starts the OAuth flow
// by redirecting to Microsoft's consent screen. Same state-cookie CSRF
// pattern as the Google connect route.
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
    authUrl = getMicrosoftAuthUrl(state);
  } catch (err) {
    console.error("Failed to build Microsoft OAuth URL", err);
    const url = new URL("/dashboard/settings", appUrl);
    url.searchParams.set("calendar", "error");
    url.searchParams.set("provider", "microsoft");
    return NextResponse.redirect(url);
  }

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(authUrl);
}
