import { NextRequest, NextResponse } from "next/server";
import { Info } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { ProfileUpdateSchema } from "@/lib/schemas/profile";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
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

  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const input = parsed.data;

  if (!Info.isValidIANAZone(input.timezone)) {
    return apiError("INVALID_TIMEZONE");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName,
      slug: input.slug,
      timezone: input.timezone,
      locale: input.locale,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return apiError("VALIDATION_ERROR", { message: "That URL slug is already taken" });
    }
    return apiError("INTERNAL_ERROR", { message: error.message });
  }

  return NextResponse.json({ ok: true });
}
