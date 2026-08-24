import "server-only";
import { DateTime } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";

// Google Calendar sync, Phase 1: import-only (calendar.readonly), one
// connection per host. Talks to Google's plain REST endpoints directly
// rather than pulling in the `googleapis` SDK — this app only needs four
// calls (token exchange, token refresh, events.watch, events.list), and
// the SDK's footprint isn't worth it for that.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Read-only: this phase only imports busy blocks, it never creates or
// modifies events on the host's calendar. Widening to a write scope is
// Phase 2's job, not something to request speculatively now.
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function redirectUri(): string {
  return `${appUrl()}/api/calendar/google/callback`;
}

/** Builds the URL to send a host to Google's consent screen. `state` should
 * be an unguessable value tied to their session, checked again in the
 * callback — Google's OAuth flow has no other CSRF protection built in. */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Without forcing the consent prompt, Google only returns a
    // refresh_token on a user's FIRST ever authorization — a host who
    // disconnects and reconnects later would silently get no
    // refresh_token the second time, breaking long-lived sync.
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Returns a valid access token for this connection, refreshing and
 * persisting a new one first if the current one is expired or about to
 * be (a 5-minute margin, since the token is about to be used for a
 * network call that itself takes time). */
async function ensureFreshAccessToken(connection: CalendarConnectionRow): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const marginMs = 5 * 60 * 1000;
  if (expiresAt - Date.now() > marginMs) {
    return connection.access_token;
  }

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const supabase = createServiceClient();
  await supabase
    .from("calendar_connections")
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiresAt })
    .eq("id", connection.id);

  return refreshed.access_token;
}

export interface WatchChannel {
  id: string;
  resourceId: string;
  expiration: string; // ISO instant
}

/** Registers a push-notification channel with Google — from this point on,
 * Google POSTs to `webhookUrl` whenever this calendar changes, instead of
 * this app needing to poll. Channels expire (Google's hard max is 30
 * days) and must be re-registered before then. */
export async function registerWatchChannel(
  accessToken: string,
  calendarId: string,
  webhookUrl: string,
): Promise<WatchChannel> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        type: "web_hook",
        address: webhookUrl,
        // Google's push notifications carry no signature of their own —
        // this shared secret, echoed back as X-Goog-Channel-Token on
        // every notification, is the only thing distinguishing a real
        // Google request from anyone who discovers the (public) webhook
        // URL and starts POSTing to it.
        token: requireEnv("GOOGLE_CALENDAR_WEBHOOK_TOKEN"),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Google watch registration failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { id: data.id, resourceId: data.resourceId, expiration: new Date(Number(data.expiration)).toISOString() };
}

/** Best-effort — called on disconnect. A channel that's never explicitly
 * stopped just expires on its own after 30 days, so a failure here isn't
 * worth surfacing to the host. */
export async function stopWatchChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  await fetch(`${GOOGLE_CALENDAR_API}/channels/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  }).catch(() => {});
}

interface GoogleCalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  // "transparent" is Google Calendar's own field for an event explicitly
  // marked "Free" — the host said this doesn't block their time, so it
  // must not become a busy block despite otherwise looking like a normal
  // event. Absent (opaque, the default) means it DOES block.
  transparency?: "opaque" | "transparent";
}

export interface EventsDeltaResult {
  events: GoogleCalendarEvent[];
  nextSyncToken: string | null;
  /** True if Google rejected the stored syncToken (410 Gone) and this was
   * refetched as a full resync — the caller should treat `events` as a
   * complete replacement, not a delta, and clear any events not present. */
  wasFullResync: boolean;
}

/** Fetches the delta since `syncToken` (or a fresh ~6-month forward window
 * for the very first sync, since Calendar has no "since the beginning of
 * time" option). Handles the documented 410 Gone case — an expired or
 * invalidated syncToken — by transparently retrying as a full resync
 * rather than surfacing it as an error. */
export async function fetchEventsDelta(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<EventsDeltaResult> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let usedSyncToken = syncToken;
  let wasFullResync = false;

  for (;;) {
    const params = new URLSearchParams({ singleEvents: "true" });
    if (usedSyncToken) {
      params.set("syncToken", usedSyncToken);
    } else {
      // First-ever sync: no syncToken to anchor on, so scope the initial
      // pull to a forward-looking window instead of the account's entire
      // event history — a slot can never be more than a year out anyway
      // (max_days_ahead tops out at 365, see lib/schemas/event-type.ts).
      params.set("timeMin", new Date().toISOString());
      params.set("timeMax", new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString());
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (res.status === 410 && usedSyncToken) {
      // The syncToken is no longer valid (expired, or the calendar was
      // reset) — Google's documented recovery is to drop it and resync
      // from scratch. Restart the whole fetch loop without a syncToken.
      usedSyncToken = null;
      wasFullResync = true;
      events.length = 0;
      pageToken = undefined;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Google events.list failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    if (!pageToken) break;
  }

  return { events, nextSyncToken, wasFullResync };
}

function toInstant(
  part: { date?: string; dateTime?: string } | undefined,
  hostTimezone: string,
  edge: "start" | "end",
): string | null {
  if (!part) return null;
  if (part.dateTime) return part.dateTime;
  if (part.date) {
    // All-day event: Google gives a bare calendar date, no time or
    // timezone. Anchor it to the HOST's own local day boundary — the one
    // timezone we know for certain matters here — rather than UTC, which
    // could shift the block by up to a day for a host far from UTC.
    const dt = DateTime.fromISO(part.date, { zone: hostTimezone });
    return (edge === "start" ? dt.startOf("day") : dt.plus({ days: 1 }).startOf("day"))
      .toUTC()
      .toISO();
  }
  return null;
}

/** Pulls the delta since this connection's last sync and reconciles
 * calendar_busy_blocks to match — called right after a host connects
 * (their first, full sync) and again every time Google's webhook fires.
 * This is the one place event data actually gets written; the webhook
 * route itself stays a thin trigger. */
export async function performSync(connection: CalendarConnectionRow): Promise<void> {
  const supabase = createServiceClient();
  const accessToken = await ensureFreshAccessToken(connection);

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", connection.owner_id)
    .maybeSingle();
  const hostTimezone = profile?.timezone ?? "UTC";

  const { events, nextSyncToken, wasFullResync } = await fetchEventsDelta(
    accessToken,
    connection.external_calendar_id,
    connection.sync_token,
  );

  if (wasFullResync) {
    // The old syncToken was invalidated — the local cache may hold rows
    // for events Google no longer remembers changing. Clear it before
    // repopulating from this full snapshot rather than merging into it.
    await supabase.from("calendar_busy_blocks").delete().eq("connection_id", connection.id);
  }

  for (const event of events) {
    // Google Calendar's own signals for "this doesn't actually block my
    // time": deleted (status), or explicitly marked "Free" (transparency).
    const isBusy = event.status !== "cancelled" && event.transparency !== "transparent";

    if (!isBusy) {
      await supabase
        .from("calendar_busy_blocks")
        .delete()
        .eq("connection_id", connection.id)
        .eq("external_event_id", event.id);
      continue;
    }

    const startsAt = toInstant(event.start, hostTimezone, "start");
    const endsAt = toInstant(event.end, hostTimezone, "end");
    if (!startsAt || !endsAt) continue;

    await supabase.from("calendar_busy_blocks").upsert(
      {
        owner_id: connection.owner_id,
        connection_id: connection.id,
        external_event_id: event.id,
        starts_at: startsAt,
        ends_at: endsAt,
      },
      { onConflict: "connection_id,external_event_id" },
    );
  }

  await supabase
    .from("calendar_connections")
    .update({
      sync_token: nextSyncToken ?? connection.sync_token,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
}

export { ensureFreshAccessToken };
export type { GoogleCalendarEvent };
