import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLoginLink } from "@/lib/stripe-connect";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// GET /api/stripe/connect/dashboard — host-only. Express accounts have no
// standalone login of their own; this mints a fresh short-lived link into
// the host's own Stripe dashboard (balance, payouts, tax forms) on demand
// rather than storing one, since Stripe's login links expire quickly and
// are meant to be single-use.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl()));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.stripe_account_id) {
    return NextResponse.redirect(new URL("/dashboard/settings", appUrl()));
  }

  try {
    const link = await createLoginLink(profile.stripe_account_id);
    return NextResponse.redirect(link);
  } catch (err) {
    console.error("Stripe Connect login link failed", err);
    const url = new URL("/dashboard/settings", appUrl());
    url.searchParams.set("stripeConnect", "error");
    return NextResponse.redirect(url);
  }
}
