import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

// POST /api/bookings/{id}/no-show — host-only. Uses the session client so
// RLS's owner_id = auth.uid() policy is the authorization check; an
// unauthenticated or non-owning caller's update simply matches 0 rows.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "no_show" })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id");

  if (error) {
    return apiError("INTERNAL_ERROR", { message: error.message });
  }
  if (!data || data.length === 0) {
    return apiError("VALIDATION_ERROR", { message: "Booking is not confirmed or not found" });
  }

  return NextResponse.json({ ok: true });
}
