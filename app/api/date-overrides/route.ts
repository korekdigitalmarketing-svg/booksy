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

  const { data, error } = await supabase
    .from("date_overrides")
    .insert({
      owner_id: user.id,
      the_date: input.theDate,
      is_closed: input.isClosed,
      start_time: input.isClosed ? null : (input.startTime ?? null),
      end_time: input.isClosed ? null : (input.endTime ?? null),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError("VALIDATION_ERROR", { message: "An override for this date and time already exists" });
    }
    return apiError("INTERNAL_ERROR", { message: error.message });
  }

  return NextResponse.json({ id: data.id });
}
