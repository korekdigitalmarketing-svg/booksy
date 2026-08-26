import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createExpressAccount, createOnboardingLink } from "@/lib/stripe-connect";

export const runtime = "nodejs";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function settingsRedirect(status: "error"): NextResponse {
  const url = new URL("/dashboard/settings", appUrl());
  url.searchParams.set("stripeConnect", status);
  return NextResponse.redirect(url);
}

// GET /api/stripe/connect/onboard — host-only. Creates the host's Express
// account on first visit (reused on every later visit), then sends them
// to a fresh Account Link. Doubles as this flow's own refresh_url: an
// expired or invalid link just lands back here and gets a new one, no
// separate "link expired" page needed.
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
    .select("id, email, stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return settingsRedirect("error");
  }

  try {
    let accountId = profile.stripe_account_id;
    if (!accountId) {
      accountId = await createExpressAccount(profile.email);
      const serviceClient = createServiceClient();
      const { error: updateError } = await serviceClient
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", user.id);
      if (updateError) throw new Error(updateError.message);
    }

    const onboardUrl = `${appUrl()}/api/stripe/connect/onboard`;
    const returnUrl = `${appUrl()}/api/stripe/connect/return`;
    const link = await createOnboardingLink(accountId, onboardUrl, returnUrl);
    return NextResponse.redirect(link);
  } catch (err) {
    console.error("Stripe Connect onboarding failed", err);
    return settingsRedirect("error");
  }
}
