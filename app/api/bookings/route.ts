import { NextRequest, NextResponse } from "next/server";
import { DateTime, Info } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSlots, type ExistingBookingInput } from "@/lib/availability";
import { apiError } from "@/lib/api-errors";
import { CreateBookingSchema } from "@/lib/schemas/booking";
import { getStripe } from "@/lib/stripe";
import { getLocalized } from "@/lib/i18n-content";
import { sendClientConfirmation, sendHostNotification } from "@/lib/notifications";

export const runtime = "nodejs";

// Stripe Checkout Sessions can't expire sooner than 30 minutes after
// creation (a hard API minimum) — the hold matches that exactly so
// "expires_at matching the hold" (section 6) stays literally true rather
// than picking an expiry Stripe would reject.
const HOLD_MINUTES = 30;

// POST /api/bookings
// The posted slot is a request, not a fact (section 6) — this handler
// recomputes availability server-side before ever writing a row, and
// writes only through the service-role client (RLS has no policy letting
// the browser insert bookings directly, by design).
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", { message: "Invalid JSON body" });
  }

  const parsed = CreateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const input = parsed.data;

  if (!Info.isValidIANAZone(input.timezone)) {
    return apiError("INVALID_TIMEZONE");
  }

  const supabase = createServiceClient();

  const { data: eventType, error: eventTypeError } = await supabase
    .from("event_types")
    .select(
      "id, owner_id, slug, title, duration_min, slot_increment_min, buffer_before_min, buffer_after_min, min_notice_min, max_days_ahead, max_per_day, price_cents, currency, requires_payment, is_active",
    )
    .eq("id", input.eventTypeId)
    .eq("is_active", true)
    .maybeSingle();

  if (eventTypeError) {
    return apiError("INTERNAL_ERROR", { message: eventTypeError.message });
  }
  if (!eventType) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const { data: host, error: hostError } = await supabase
    .from("profiles")
    .select("slug, timezone, locale")
    .eq("id", eventType.owner_id)
    .maybeSingle();

  if (hostError || !host) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const [
    { data: rules, error: rulesError },
    { data: overrides, error: overridesError },
    { data: bookings, error: bookingsError },
    { data: questions, error: questionsError },
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
    supabase
      .from("event_type_questions")
      .select("id, label, is_required")
      .eq("event_type_id", eventType.id),
  ]);

  if (rulesError || overridesError || bookingsError || questionsError) {
    return apiError("INTERNAL_ERROR", {
      message:
        rulesError?.message ?? overridesError?.message ?? bookingsError?.message ?? questionsError?.message,
    });
  }

  // The Zod schema only knows customAnswers is a map of uuid -> string; it
  // can't know which question ids are actually required, since that's
  // event-type data, not shape. Enforce it here against the live rows.
  const missingRequired = (questions ?? []).some(
    (q) => q.is_required && !(input.customAnswers[q.id] ?? "").trim(),
  );
  if (missingRequired) {
    return apiError("VALIDATION_ERROR", { message: "A required question is missing an answer" });
  }

  const existingBookings: ExistingBookingInput[] = (bookings ?? []).map((b) => ({
    blockedFrom: b.blocked_from,
    blockedTo: b.blocked_to,
    startsAt: b.starts_at,
    status: b.status,
    holdExpiresAt: b.hold_expires_at,
  }));

  // Recompute validity server-side, scoped to the single calendar day (in
  // the visitor's own timezone) the requested slot falls on — never trust
  // the posted slot itself.
  const requestedDate = DateTime.fromISO(input.slot, { zone: "utc" })
    .setZone(input.timezone)
    .toISODate();
  if (!requestedDate) {
    return apiError("VALIDATION_ERROR", { message: "Invalid slot" });
  }

  const validSlots = generateSlots({
    eventType: {
      durationMin: eventType.duration_min,
      // Same increment /api/slots used to build the grid the visitor
      // picked from — recomputing with a different increment could
      // "validate" an off-grid instant nobody was ever actually offered.
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
    visitorTimezone: input.timezone,
    fromDate: requestedDate,
    toDate: requestedDate,
  });

  if (!validSlots.includes(input.slot)) {
    return apiError("SLOT_UNAVAILABLE");
  }

  const startsAt = DateTime.fromISO(input.slot, { zone: "utc" });
  const endsAt = startsAt.plus({ minutes: eventType.duration_min });
  const blockedFrom = startsAt.minus({ minutes: eventType.buffer_before_min });
  const blockedTo = endsAt.plus({ minutes: eventType.buffer_after_min });

  const requiresPayment = eventType.requires_payment ?? eventType.price_cents > 0;
  const now = DateTime.utc();

  // Drop any answer keyed to a question id that isn't actually on this
  // event type (stale form state, or a crafted request) rather than
  // storing orphaned entries nothing will ever render.
  const knownQuestionIds = new Set((questions ?? []).map((q) => q.id));
  const customAnswers = Object.fromEntries(
    Object.entries(input.customAnswers).filter(([id, value]) => knownQuestionIds.has(id) && value),
  );

  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      owner_id: eventType.owner_id,
      event_type_id: eventType.id,
      status: requiresPayment ? "pending_payment" : "confirmed",
      starts_at: startsAt.toISO() as string,
      ends_at: endsAt.toISO() as string,
      blocked_from: blockedFrom.toISO() as string,
      blocked_to: blockedTo.toISO() as string,
      invitee_name: input.name,
      invitee_email: input.email,
      invitee_phone: input.phone || null,
      invitee_notes: input.notes || null,
      invitee_timezone: input.timezone,
      invitee_locale: input.locale,
      custom_answers: customAnswers,
      amount_cents: eventType.price_cents,
      currency: eventType.currency,
      hold_expires_at: requiresPayment ? now.plus({ minutes: HOLD_MINUTES }).toISO() : null,
    })
    .select("id, status, access_token, starts_at, ends_at")
    .single();

  if (insertError) {
    // 23P01 = Postgres exclusion_violation — the bookings_no_overlap
    // constraint fired because someone else took this exact window
    // between our recompute and this insert. Never retry blindly.
    if (insertError.code === "23P01") {
      return apiError("SLOT_TAKEN");
    }
    return apiError("INTERNAL_ERROR", { message: insertError.message });
  }

  if (!requiresPayment) {
    // Best-effort: the booking is already confirmed in the DB regardless
    // of whether these sends succeed, so a failure here logs rather than
    // fails the request. notifications_log's dedupe insert still protects
    // against a duplicate send if this route is ever retried.
    try {
      await Promise.all([sendClientConfirmation(booking.id), sendHostNotification(booking.id)]);
    } catch (err) {
      console.error("Failed to send booking confirmation emails", err);
    }

    return NextResponse.json({
      booking: {
        id: booking.id,
        status: booking.status,
        accessToken: booking.access_token,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
      },
    });
  }

  // Paid path: the row above already holds the slot (pending_payment +
  // hold_expires_at) via the exclusion constraint — everyone else sees it
  // as taken from this point on, regardless of whether checkout completes.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const eventTitle = getLocalized(
    eventType.title as Record<string, string>,
    input.locale,
    host.locale,
  );

  let checkoutUrl: string;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: booking.id,
      customer_email: input.email,
      locale: input.locale,
      // Expire the Checkout Session alongside the DB hold — no point
      // letting someone pay into a slot that's already been swept free.
      expires_at: Math.floor(now.plus({ minutes: HOLD_MINUTES }).toSeconds()),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: eventType.currency,
            unit_amount: eventType.price_cents,
            product_data: { name: eventTitle },
          },
        },
      ],
      metadata: { booking_id: booking.id },
      success_url: `${appUrl}/${input.locale}/booking/${booking.access_token}/success`,
      cancel_url: `${appUrl}/${input.locale}/${host.slug}/${eventType.slug}`,
    });

    if (!session.url) {
      throw new Error("Stripe session created without a URL");
    }
    checkoutUrl = session.url;

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", booking.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
  } catch (err) {
    // The hold stays in place (it still expires on its own via the sweep
    // cron) but checkout couldn't be created — surface a typed failure
    // rather than handing the client a booking with no way to pay.
    await supabase.from("bookings").delete().eq("id", booking.id);
    return apiError("PAYMENT_FAILED", {
      message: err instanceof Error ? err.message : "Unknown Stripe error",
    });
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      accessToken: booking.access_token,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
    },
    checkoutUrl,
  });
}
