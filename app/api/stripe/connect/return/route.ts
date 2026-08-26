import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAccountStatus } from "@/lib/stripe-connect";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function settingsRedirect(status: "connected" | "pending" | "error"): NextResponse {
  const url = new URL("/dashboard/settings", appUrl());
  url.searchParams.set("stripeConnect", status);
  return NextResponse.redirect(url);
}

// GET /api/stripe/connect/return — Stripe sends the host back here after
// the onboarding flow, whether they actually finished it or abandoned
// partway. Landing here is not itself proof of anything — it's only a
// signal to go check — so this re-reads the account's real capability
// flags from Stripe before redirecting into Settings with the answer.
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
    return settingsRedirect("error");
  }

  try {
    const status = await getAccountStatus(profile.stripe_account_id);
    const serviceClient = createServiceClient();
    await serviceClient
      .from("profiles")
      .update({
        stripe_charges_enabled: status.chargesEnabled,
        stripe_payouts_enabled: status.payoutsEnabled,
      })
      .eq("id", user.id);

    return settingsRedirect(status.chargesEnabled && status.payoutsEnabled ? "connected" : "pending");
  } catch (err) {
    console.error("Stripe Connect status check failed", err);
    return settingsRedirect("error");
  }
}
