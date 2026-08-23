import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

// POST /api/event-types/{id}/toggle-active — a lighter sibling to the full
// PATCH for the one-click list-page toggle, so flipping visibility doesn't
// require resubmitting the entire event type.
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

  const { data: current, error: fetchError } = await supabase
    .from("event_types")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !current) return apiError("EVENT_TYPE_NOT_FOUND");

  const { error: updateError } = await supabase
    .from("event_types")
    .update({ is_active: !current.is_active })
    .eq("id", id);

  if (updateError) {
    return apiError("INTERNAL_ERROR", { message: updateError.message });
  }

  return NextResponse.json({ isActive: !current.is_active });
}
