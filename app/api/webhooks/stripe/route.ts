import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { sendClientConfirmation, sendHostNotification, sendCancellationEmails } from "@/lib/notifications";

// Route Handlers don't auto-parse the body, so request.text() below is the
// exact raw bytes Stripe signed — verifying against anything else (e.g. a
// re-serialized request.json()) would always fail signature checks.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: err instanceof Error ? err.message : "Invalid signature" } },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Idempotency: Stripe's event.id is globally unique, so the primary key
  // alone does the deduping. A replayed event fails this insert, and we
  // return 200 without touching the booking a second time.
  const { error: dedupeError } = await supabase
    .from("processed_webhook_events")
    .insert({ event_id: event.id });

  if (dedupeError) {
    if (dedupeError.code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: dedupeError.message } },
      { status: 500 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
      if (!bookingId) break;

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      // Only a still-pending booking transitions to confirmed — never
      // resurrect one a host or the sweep cron has since moved on from.
      const { data: updated } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          hold_expires_at: null,
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq("id", bookingId)
        .eq("status", "pending_payment")
        .select("id");

      // Only send if this call actually flipped the row — a webhook that
      // arrives after the booking was already confirmed some other way
      // updates 0 rows, and must not trigger a second email.
      if (updated && updated.length > 0) {
        try {
          await Promise.all([sendClientConfirmation(bookingId), sendHostNotification(bookingId)]);
        } catch (err) {
          console.error("Failed to send booking confirmation emails", err);
        }
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
      if (!bookingId) break;

      await supabase
        .from("bookings")
        .update({ status: "expired", hold_expires_at: null })
        .eq("id", bookingId)
        .eq("status", "pending_payment");
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (!paymentIntentId) break;

      const { data: refunded } = await supabase
        .from("bookings")
        .update({
          status: "cancelled_by_host",
          cancel_reason: "Refunded via Stripe",
          cancelled_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent_id", paymentIntentId)
        .eq("status", "confirmed")
        .select("id");

      if (refunded && refunded.length > 0) {
        try {
          await sendCancellationEmails(refunded[0].id, "host");
        } catch (err) {
          console.error("Failed to send cancellation emails", err);
        }
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
