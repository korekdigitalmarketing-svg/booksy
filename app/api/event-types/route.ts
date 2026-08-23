import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { EventTypeSchema } from "@/lib/schemas/event-type";

export const runtime = "nodejs";

// POST /api/event-types — host-only. Uses the session client, so RLS's
// `owner_id = auth.uid()` WITH CHECK is what actually enforces that a
// host can only ever create event types for themselves; owner_id below
// is set explicitly to satisfy that check, not as the security boundary.
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

  const parsed = EventTypeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const input = parsed.data;

  const { data, error } = await supabase
    .from("event_types")
    .insert({
      owner_id: user.id,
      slug: input.slug,
      title: input.title,
      description: input.description,
      duration_min: input.durationMin,
      slot_increment_min: input.slotIncrementMin,
      price_cents: input.priceCents,
      currency: input.currency,
      location_kind: input.locationKind,
      location_value: input.locationValue || null,
      buffer_before_min: input.bufferBeforeMin,
      buffer_after_min: input.bufferAfterMin,
      min_notice_min: input.minNoticeMin,
      max_days_ahead: input.maxDaysAhead,
      max_per_day: input.maxPerDay ?? null,
      is_active: input.isActive,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiError("VALIDATION_ERROR", { message: "You already have an event type with this slug" });
    }
    return apiError("INTERNAL_ERROR", { message: error.message });
  }

  return NextResponse.json({ id: data.id });
}
