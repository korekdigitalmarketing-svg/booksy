import { NextRequest, NextResponse } from "next/server";
import { DateTime, Info } from "luxon";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSlots, type ExistingBookingInput } from "@/lib/availability";
import { sendRescheduleEmails } from "@/lib/notifications";
import { syncBookingToCalendars } from "@/lib/calendar-writeback";
import { getExternalBusyBlocks } from "@/lib/calendar-busy-blocks";
import { apiError } from "@/lib/api-errors";
import { RescheduleBookingSchema } from "@/lib/schemas/booking";

export const runtime = "nodejs";

// POST /api/bookings/{id}/reschedule
// Same dual-auth shape as /cancel: a signed-in host (session cookie — RLS's
// owner_id = auth.uid() policy scopes it) or the invitee holding their own
// access_token (verified explicitly, since that path uses the service
// client and bypasses RLS on purpose). The posted slot is a request, not a
// fact — recomputed against live availability before ever touching the row,
// exactly like the original POST /api/bookings.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", { message: "Invalid JSON body" });
  }
  const parsed = RescheduleBookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const { slot, timezone, accessToken } = parsed.data;

  if (!Info.isValidIANAZone(timezone)) {
    return apiError("INVALID_TIMEZONE");
  }

  const sessionSupabase = await createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  const db = user ? sessionSupabase : createServiceClient();

  if (!user) {
    if (!accessToken) return apiError("UNAUTHORIZED");
    const { data: tokenMatch } = await db
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("access_token", accessToken)
      .maybeSingle();
    if (!tokenMatch) return apiError("UNAUTHORIZED");
  }

  const { data: booking, error: fetchError } = await db
    .from("bookings")
    .select("id, status, owner_id, event_type_id, starts_at, sequence")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !booking) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }
  if (booking.status !== "confirmed") {
    return apiError("VALIDATION_ERROR", { message: "Booking is not in a reschedulable state" });
  }

  // From here on, read with the service client regardless of which auth
  // path this request came in on — a session-scoped client only sees the
  // host's own bookings/rules under RLS, but validating a client-initiated
  // reschedule still needs the full picture (the event type, the host's
  // rules, every other live booking).
  const service = createServiceClient();

  const { data: eventType, error: eventTypeError } = await service
    .from("event_types")
    .select(
      "id, owner_id, duration_min, slot_increment_min, buffer_before_min, buffer_after_min, min_notice_min, max_days_ahead, max_per_day",
    )
    .eq("id", booking.event_type_id)
    .maybeSingle();

  if (eventTypeError || !eventType) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const { data: host, error: hostError } = await service
    .from("profiles")
    .select("timezone")
    .eq("id", booking.owner_id)
    .maybeSingle();

  if (hostError || !host) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const [{ data: rules, error: rulesError }, { data: overrides, error: overridesError }, { data: existing, error: existingError }, externalBusyBlocks] =
    await Promise.all([
      service
        .from("availability_rules")
        .select("weekday, start_time, end_time")
        .eq("owner_id", booking.owner_id),
      service
        .from("date_overrides")
        .select("the_date, is_closed, start_time, end_time")
        .eq("owner_id", booking.owner_id),
      service
        .from("bookings")
        .select("blocked_from, blocked_to, starts_at, status, hold_expires_at")
        .eq("owner_id", booking.owner_id)
        .neq("id", booking.id) // exclude the booking being moved from its own conflict check
        .in("status", ["pending_payment", "confirmed"])
        .gte("blocked_to", new Date().toISOString()),
      getExternalBusyBlocks(booking.owner_id, new Date().toISOString()),
    ]);

  if (rulesError || overridesError || existingError) {
    return apiError("INTERNAL_ERROR", {
      message: rulesError?.message ?? overridesError?.message ?? existingError?.message,
    });
  }

  const existingBookings: ExistingBookingInput[] = (existing ?? []).map((b) => ({
    blockedFrom: b.blocked_from,
    blockedTo: b.blocked_to,
    startsAt: b.starts_at,
    status: b.status,
    holdExpiresAt: b.hold_expires_at,
  }));

  const requestedDate = DateTime.fromISO(slot, { zone: "utc" }).setZone(timezone).toISODate();
  if (!requestedDate) {
    return apiError("VALIDATION_ERROR", { message: "Invalid slot" });
  }

  const validSlots = generateSlots({
    eventType: {
      durationMin: eventType.duration_min,
      slotIncrementMin: eventType.slot_increment_min,
      bufferBeforeMin: eventType.buffer_before_min,
      bufferAfterMin: eventType.buffer_after_min,
      minNoticeMin: eventType.min_notice_min,
      maxDaysAhead: eventType.max_days_ahead,
      maxPerDay: eventType.max_per_day,
    },
    hostTimezone: host.timezone,
    availabilityRules: (rules ?? []).map((r) => ({
      weekday: r.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startTime: r.start_time,
      endTime: r.end_time,
    })),
    dateOverrides: (overrides ?? []).map((o) => ({
      theDate: o.the_date,
      isClosed: o.is_closed,
      startTime: o.start_time,
      endTime: o.end_time,
    })),
    existingBookings,
    externalBusyBlocks,
    visitorTimezone: timezone,
    fromDate: requestedDate,
    toDate: requestedDate,
  });

  if (!validSlots.includes(slot)) {
    return apiError("SLOT_UNAVAILABLE");
  }

  const previousStartsAt = booking.starts_at;
  const startsAt = DateTime.fromISO(slot, { zone: "utc" });
  const endsAt = startsAt.plus({ minutes: eventType.duration_min });
  const blockedFrom = startsAt.minus({ minutes: eventType.buffer_before_min });
  const blockedTo = endsAt.plus({ minutes: eventType.buffer_after_min });

  const { data: updated, error: updateError } = await service
    .from("bookings")
    .update({
      starts_at: startsAt.toISO() as string,
      ends_at: endsAt.toISO() as string,
      blocked_from: blockedFrom.toISO() as string,
      blocked_to: blockedTo.toISO() as string,
      sequence: booking.sequence + 1,
    })
    .eq("id", booking.id)
    .select("id, starts_at, ends_at")
    .single();

  if (updateError) {
    // 23P01 = Postgres exclusion_violation — someone else took this exact
    // window between our recompute and this update. Never retry blindly.
    if (updateError.code === "23P01") {
      return apiError("SLOT_TAKEN");
    }
    return apiError("INTERNAL_ERROR", { message: updateError.message });
  }

  try {
    await Promise.all([
      sendRescheduleEmails(booking.id, previousStartsAt),
      syncBookingToCalendars(booking.id),
    ]);
  } catch (err) {
    console.error("Failed to send reschedule emails", err);
  }

  return NextResponse.json({
    booking: { id: updated.id, startsAt: updated.starts_at, endsAt: updated.ends_at },
  });
}
