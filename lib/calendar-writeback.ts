import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getLocalized } from "@/lib/i18n-content";
import { ensureFreshGoogleAccessToken } from "@/lib/calendar-sync";
import { ensureFreshMicrosoftAccessToken } from "@/lib/calendar-sync-microsoft";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";

const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

interface Connection extends CalendarConnectionRow {
  provider: string;
}

interface BookingEvent {
  id: string;
  ownerId: string;
  startsAt: string;
  endsAt: string;
  inviteeName: string;
  inviteeEmail: string;
  title: string;
  location: string | null;
}

async function getBookingEvent(bookingId: string): Promise<BookingEvent | null> {
  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, owner_id, event_type_id, starts_at, ends_at, invitee_name, invitee_email")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: eventType }, { data: host }] = await Promise.all([
    supabase
      .from("event_types")
      .select("title, location_value")
      .eq("id", booking.event_type_id)
      .maybeSingle(),
    supabase.from("profiles").select("locale").eq("id", booking.owner_id).maybeSingle(),
  ]);
  if (!eventType || !host) return null;

  return {
    id: booking.id,
    ownerId: booking.owner_id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    inviteeName: booking.invitee_name,
    inviteeEmail: booking.invitee_email,
    title: getLocalized(eventType.title as Record<string, string>, host.locale, host.locale),
    location: eventType.location_value,
  };
}

function description(event: BookingEvent): string {
  return `Booked via Korek Booking\nClient: ${event.inviteeName}\nEmail: ${event.inviteeEmail}`;
}

async function googleRequest(
  connection: Connection,
  event: BookingEvent,
  externalEventId?: string,
): Promise<string> {
  const accessToken = await ensureFreshGoogleAccessToken(connection);
  const calendarId = encodeURIComponent(connection.external_calendar_id);
  const url = externalEventId
    ? `${GOOGLE_API}/calendars/${calendarId}/events/${encodeURIComponent(externalEventId)}`
    : `${GOOGLE_API}/calendars/${calendarId}/events`;
  const response = await fetch(url, {
    method: externalEventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `${event.title} · ${event.inviteeName}`,
      description: description(event),
      location: event.location ?? undefined,
      start: { dateTime: event.startsAt },
      end: { dateTime: event.endsAt },
      extendedProperties: {
        private: {
          korekBookingId: event.id,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Google event write failed: ${response.status}`);
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function microsoftRequest(
  connection: Connection,
  event: BookingEvent,
  externalEventId?: string,
): Promise<string> {
  const accessToken = await ensureFreshMicrosoftAccessToken(connection);
  const url = externalEventId
    ? `${GRAPH_API}/me/events/${encodeURIComponent(externalEventId)}`
    : `${GRAPH_API}/me/events`;
  const response = await fetch(url, {
    method: externalEventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: `${event.title} · ${event.inviteeName}`,
      body: { contentType: "text", content: description(event) },
      start: { dateTime: event.startsAt, timeZone: "UTC" },
      end: { dateTime: event.endsAt, timeZone: "UTC" },
      location: event.location ? { displayName: event.location } : undefined,
      ...(!externalEventId ? { transactionId: event.id } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Microsoft event write failed: ${response.status}`);
  if (externalEventId) return externalEventId;
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function syncConnection(connection: Connection, event: BookingEvent): Promise<void> {
  const supabase = createServiceClient();
  const { data: mapping } = await supabase
    .from("booking_calendar_events")
    .select("external_event_id")
    .eq("booking_id", event.id)
    .eq("connection_id", connection.id)
    .maybeSingle();

  const externalEventId =
    connection.provider === "google"
      ? await googleRequest(connection, event, mapping?.external_event_id)
      : await microsoftRequest(connection, event, mapping?.external_event_id);

  if (!mapping) {
    await supabase.from("booking_calendar_events").insert({
      booking_id: event.id,
      connection_id: connection.id,
      owner_id: event.ownerId,
      provider: connection.provider,
      external_event_id: externalEventId,
    });
  }
}

export async function syncBookingToCalendars(bookingId: string): Promise<void> {
  const event = await getBookingEvent(bookingId);
  if (!event) return;

  const supabase = createServiceClient();
  const { data: connections } = await supabase
    .from("calendar_connections")
    .select("id, owner_id, provider, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
    .eq("owner_id", event.ownerId);

  const results = await Promise.allSettled(
    (connections ?? []).map((connection) => syncConnection(connection as Connection, event)),
  );
  for (const result of results) {
    if (result.status === "rejected") console.error("Calendar event sync failed", result.reason);
  }
}

export async function removeBookingFromCalendars(bookingId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: mappings } = await supabase
    .from("booking_calendar_events")
    .select("id, external_event_id, connection_id")
    .eq("booking_id", bookingId);

  for (const mapping of mappings ?? []) {
    const { data: connection } = await supabase
      .from("calendar_connections")
      .select("id, owner_id, provider, access_token, refresh_token, token_expires_at, external_calendar_id, sync_token")
      .eq("id", mapping.connection_id)
      .maybeSingle();
    if (!connection) continue;

    try {
      const typed = connection as Connection;
      const accessToken = typed.provider === "google"
        ? await ensureFreshGoogleAccessToken(typed)
        : await ensureFreshMicrosoftAccessToken(typed);
      const url = typed.provider === "google"
        ? `${GOOGLE_API}/calendars/${encodeURIComponent(typed.external_calendar_id)}/events/${encodeURIComponent(mapping.external_event_id)}`
        : `${GRAPH_API}/me/events/${encodeURIComponent(mapping.external_event_id)}`;
      const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok && response.status !== 404) throw new Error(`Calendar event delete failed: ${response.status}`);
      await supabase.from("booking_calendar_events").delete().eq("id", mapping.id);
    } catch (error) {
      console.error("Calendar event delete failed", error);
    }
  }
}
