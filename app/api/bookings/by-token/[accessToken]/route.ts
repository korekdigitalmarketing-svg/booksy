import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getLocalized } from "@/lib/i18n-content";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

// GET /api/bookings/by-token/{accessToken}
// The access_token IS the capability — anyone holding it may read this
// booking's status. Used by the post-payment success page to poll until
// the webhook lands, per section 8: "never claim success before the
// webhook confirms."
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  const { accessToken } = await params;
  const supabase = createServiceClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, invitee_timezone, invitee_locale, event_type_id, owner_id",
    )
    .eq("access_token", accessToken)
    .maybeSingle();

  if (error || !booking) {
    return apiError("EVENT_TYPE_NOT_FOUND");
  }

  const [{ data: eventType }, { data: host }] = await Promise.all([
    supabase.from("event_types").select("title").eq("id", booking.event_type_id).maybeSingle(),
    supabase.from("profiles").select("full_name, locale").eq("id", booking.owner_id).maybeSingle(),
  ]);

  const eventTitle = eventType
    ? getLocalized(
        eventType.title as Record<string, string>,
        booking.invitee_locale,
        host?.locale ?? booking.invitee_locale,
      )
    : "";

  return NextResponse.json({
    bookingId: booking.id,
    status: booking.status,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    timezone: booking.invitee_timezone,
    eventTitle,
    hostName: host?.full_name ?? "",
  });
}
