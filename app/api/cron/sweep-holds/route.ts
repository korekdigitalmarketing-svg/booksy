import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Daily cleanup for stale pending_payment rows. The booking endpoint also
// sweeps expired holds on demand so this cron's frequency never keeps a
// client-facing slot blocked.
// Frees abandoned Stripe Checkouts, or any pending row
// that outlived its hold for other reasons. The exclusion constraint
// already protects against a real double-booking in the meantime; this
// just makes the slot visibly available again.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "expired", hold_expires_at: null })
    .eq("status", "pending_payment")
    .lt("hold_expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ swept: data?.length ?? 0 });
}
