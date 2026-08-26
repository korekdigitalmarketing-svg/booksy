import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { AvailabilityRulesSchema } from "@/lib/schemas/availability";

export const runtime = "nodejs";

// PUT /api/availability/rules — replaces the host's entire weekly
// schedule inside one database transaction.
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

  const { error } = await supabase.rpc("replace_availability_rules", {
    p_rules: parsed.data.rules.map((rule) => ({
      weekday: rule.weekday,
      start_time: rule.startTime,
      end_time: rule.endTime,
    })),
  });
  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({ ok: true });
}
