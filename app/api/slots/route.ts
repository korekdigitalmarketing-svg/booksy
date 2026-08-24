import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Info } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSlots, type ExistingBookingInput } from "@/lib/availability";
import { getExternalBusyBlocks } from "@/lib/calendar-sync";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

// GET /api/slots?eventTypeId&from&to&timezone
// Public, unauthenticated. Reads through the service-role client because
// availability_rules/date_overrides/bookings have no anon RLS policy at
// all (section 4) — this route is exactly the "server-side route handler
// that exposes only what a visitor needs" the schema comment describes.
// It never returns invitee names/emails, only computed UTC instants.
const QuerySchema = z.object({
  eventTypeId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    eventTypeId: searchParams.get("eventTypeId"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    timezone: searchParams.get("timezone"),
  });

  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const { eventTypeId, from, to, timezone } = parsed.data;

  if (!Info.isValidIANAZone(timezone)) {
    return apiError("INVALID_TIMEZONE");
  }

  const supabase = createServiceClient();

  const { data: eventType, error: eventTypeError } = await supabase
    .from("event_types")
    .select(
      "id, owner_id, duration_min, slot_increment_min, buffer_before_min, buffer_after_min, min_notice_min, max_days_ahead, max_per_day, is_active",
    )
    .eq("id", eventTypeId)
    .eq("is_active", true)
    .maybeSingle();

  if (eventTypeError) {
    return apiError("VALIDATION_ERROR", { message: eventTypeError.message });
  }
  if (!eventType) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const { data: host, error: hostError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", eventType.owner_id)
    .maybeSingle();

  if (hostError || !host) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const hostTimezone = host.timezone;

  const [
    { data: rules, error: rulesError },
    { data: overrides, error: overridesError },
    { data: bookings, error: bookingsError },
    externalBusyBlocks,
  ] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("weekday, start_time, end_time")
      .eq("owner_id", eventType.owner_id),
    supabase
      .from("date_overrides")
      .select("the_date, is_closed, start_time, end_time")
      .eq("owner_id", eventType.owner_id),
    supabase
      .from("bookings")
      .select("blocked_from, blocked_to, starts_at, status, hold_expires_at")
      .eq("owner_id", eventType.owner_id)
      .in("status", ["pending_payment", "confirmed"])
      .gte("blocked_to", new Date().toISOString()),
    getExternalBusyBlocks(eventType.owner_id, new Date().toISOString()),
  ]);

  if (rulesError || overridesError || bookingsError) {
    return apiError("VALIDATION_ERROR", {
      message: rulesError?.message ?? overridesError?.message ?? bookingsError?.message,
    });
  }

  const existingBookings: ExistingBookingInput[] = (bookings ?? []).map((b) => ({
    blockedFrom: b.blocked_from,
    blockedTo: b.blocked_to,
    startsAt: b.starts_at,
    status: b.status,
    holdExpiresAt: b.hold_expires_at,
  }));

  const slots = generateSlots({
    eventType: {
      durationMin: eventType.duration_min,
      slotIncrementMin: eventType.slot_increment_min,
      bufferBeforeMin: eventType.buffer_before_min,
      bufferAfterMin: eventType.buffer_after_min,
      minNoticeMin: eventType.min_notice_min,
      maxDaysAhead: eventType.max_days_ahead,
      maxPerDay: eventType.max_per_day,
    },
    hostTimezone,
    availabilityRules: (rules ?? []).map((r) => ({
      weekday: r.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startTime: r.start_time,
      endTime: r.end_time,
    })),
    externalBusyBlocks,
    dateOverrides: (overrides ?? []).map((o) => ({
      theDate: o.the_date,
      isClosed: o.is_closed,
      startTime: o.start_time,
      endTime: o.end_time,
    })),
    existingBookings,
    visitorTimezone: timezone,
    fromDate: from,
    toDate: to,
  });

  return NextResponse.json({ slots });
}
