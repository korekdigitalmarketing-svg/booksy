import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { sendCancellationEmails } from "@/lib/notifications";
import { apiError } from "@/lib/api-errors";
import { removeBookingFromCalendars } from "@/lib/calendar-writeback";

export const runtime = "nodejs";

const BodySchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  accessToken: z.string().uuid().optional(),
});

// POST /api/bookings/{id}/cancel
// Two callers, one endpoint: a signed-in host (session cookie — RLS's
// owner_id = auth.uid() policy is the actual authorization check, for
// free) or the invitee holding their own access_token (verified
// explicitly below, since that path uses the service client and bypasses
// RLS on purpose).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return apiError("VALIDATION_ERROR", { message: "Invalid JSON body" });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const { reason, accessToken } = parsed.data;

  const sessionSupabase = await createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  const cancelledBy: "host" | "client" = user ? "host" : "client";
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
    .select("id, status, stripe_payment_intent_id, amount_cents, stripe_destination_account_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !booking) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }
  if (booking.status !== "confirmed" && booking.status !== "pending_payment") {
    return apiError("VALIDATION_ERROR", { message: "Booking is not in a cancellable state" });
  }

  // Refund before changing booking state. A paid booking must never look
  // successfully cancelled while its automatic refund actually failed.
  if (booking.status === "confirmed" && booking.amount_cents > 0 && booking.stripe_payment_intent_id) {
    try {
      await getStripe().refunds.create(
        {
          payment_intent: booking.stripe_payment_intent_id,
          // This booking's charge was a destination charge (funds already
          // transferred to the host's connected account) — without this,
          // refunding here would leave the platform account out of pocket
          // while the host keeps the money.
          ...(booking.stripe_destination_account_id ? { reverse_transfer: true } : {}),
        },
        { idempotencyKey: `booking-cancel-${booking.id}` },
      );
    } catch (err) {
      console.error("Refund failed during cancellation", err);
      return apiError("REFUND_FAILED");
    }
  }

  const { error: updateError } = await db
    .from("bookings")
    .update({
      status: cancelledBy === "host" ? "cancelled_by_host" : "cancelled_by_client",
      cancel_reason: reason ?? null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return apiError("INTERNAL_ERROR", { message: updateError.message });
  }

  try {
    await Promise.all([
      sendCancellationEmails(id, cancelledBy),
      removeBookingFromCalendars(id),
    ]);
  } catch (err) {
    console.error("Failed to send cancellation emails", err);
  }

  return NextResponse.json({ ok: true });
}
