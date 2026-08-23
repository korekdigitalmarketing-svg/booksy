import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { AvailabilityRulesSchema } from "@/lib/schemas/availability";

export const runtime = "nodejs";

// PUT /api/availability/rules — replaces the host's entire weekly
// schedule in one call (delete-then-insert). There's no partial-update
// affordance in the editor UI (it always submits the full week), so a
// full replace is simpler and avoids reconciling stale rows client-side.
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", { message: "Invalid JSON body" });
  }

  const parsed = AvailabilityRulesSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }

  const { error: deleteError } = await supabase
    .from("availability_rules")
    .delete()
    .eq("owner_id", user.id);
  if (deleteError) {
    return apiError("INTERNAL_ERROR", { message: deleteError.message });
  }

  if (parsed.data.rules.length > 0) {
    const { error: insertError } = await supabase.from("availability_rules").insert(
      parsed.data.rules.map((r) => ({
        owner_id: user.id,
        weekday: r.weekday,
        start_time: r.startTime,
        end_time: r.endTime,
      })),
    );
    if (insertError) {
      return apiError("INTERNAL_ERROR", { message: insertError.message });
    }
  }

  return NextResponse.json({ ok: true });
}
