import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

// POST /api/onboarding/complete — host-only. Flips the flag that
// proxy.ts checks to gate every other /dashboard/* route behind the
// wizard; called both when the host finishes it and when they skip it —
// either way, they've made their choice and shouldn't be routed back.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({ ok: true });
}
