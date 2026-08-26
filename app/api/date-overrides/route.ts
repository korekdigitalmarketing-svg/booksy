import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { DateOverrideSchema } from "@/lib/schemas/availability";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const parsed = DateOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const input = parsed.data;

  const { data, error } = await supabase.rpc("add_date_override", {
    p_date: input.theDate,
    p_is_closed: input.isClosed,
    p_start_time: input.isClosed ? undefined : input.startTime,
    p_end_time: input.isClosed ? undefined : input.endTime,
  });

  if (error) {
    if (error.code === "23505") {
      return apiError("VALIDATION_ERROR", { message: "An override for this date and time already exists" });
    }
    return apiError("INTERNAL_ERROR", { message: error.message });
  }

  return NextResponse.json({ id: data });
}
