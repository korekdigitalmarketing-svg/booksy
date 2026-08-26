import "server-only";
import { DateTime } from "luxon";
import { createServiceClient } from "@/lib/supabase/service";
import type { CalendarConnectionRow } from "@/lib/calendar-busy-blocks";
import { decryptCalendarToken, encryptCalendarToken } from "@/lib/calendar-token-crypto";

// Microsoft Graph (Outlook/Microsoft 365) calendar sync, Phase 1:
// imports busy time and writes confirmed Korek Booking appointments back to the
// host's calendar, one connection per host.
// counterpart to lib/calendar-sync.ts. Kept as its own file rather than
// unified with the Google module: the OAuth endpoints, delta-sync
// mechanics (a full resumable URL vs. an opaque token), and webhook
// handshake (a GET validation step Google doesn't have) are genuinely
// different, not just renamed.

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Matches the Google side's read-only Phase 1 scope decision.
const SCOPE = "offline_access Calendars.ReadWrite";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function redirectUri(): string {
  return `${appUrl()}/api/calendar/microsoft/callback`;
}

/** Builds the URL to send a host to Microsoft's consent screen. `state`
 * should be an unguessable value tied to their session, checked again in
 * the callback — same CSRF reasoning as the Google flow. */
export function getMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("MICROSOFT_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: SCOPE,
    // Forces the consent screen every time so a host who disconnects and
    // reconnects later reliably gets a fresh refresh_token, rather than
    // silently reusing (or missing) a stale grant.
    prompt: "consent",
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokenResponse> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: SCOPE,
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPE,
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Returns a valid access token for this connection, refreshing and
 * persisting a new one first if the current one is expired or about to
 * be — same 5-minute margin as the Google module. */
export async function ensureFreshMicrosoftAccessToken(connection: CalendarConnectionRow): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const marginMs = 5 * 60 * 1000;
  if (expiresAt - Date.now() > marginMs) {
    return decryptCalendarToken(connection.access_token);
  }

  const refreshed = await refreshAccessToken(decryptCalendarToken(connection.refresh_token));
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const supabase = createServiceClient();
  await supabase
    .from("calendar_connections")
    .update({ access_token: encryptCalendarToken(refreshed.access_token), token_expires_at: newExpiresAt })
    .eq("id", connection.id);

  return refreshed.access_token;
}

export interface MicrosoftSubscription {
  id: string;
  expirationDateTime: string; // ISO instant
}

/** Registers a change-notification subscription with Graph — from this
 * point on, Microsoft POSTs to `webhookUrl` whenever the host's events
 * collection changes. Unlike Google, Graph subscriptions cap out at
 * ~4230 minutes (~2.94 days), far short of Google's 30-day channels, so
 * these need renewing far more often (see the renewal cron). */
export async function registerSubscription(
  accessToken: string,
  webhookUrl: string,
): Promise<MicrosoftSubscription> {
  const res = await fetch(`${GRAPH_API}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: webhookUrl,
      resource: "me/events",
      expirationDateTime: new Date(Date.now() + 4230 * 60 * 1000).toISOString(),
      // Graph's notifications carry no signature — clientState, echoed
      // back in the JSON body of every notification (not a header, unlike
      // Google's X-Goog-Channel-Token), is the only authentication here.
      clientState: requireEnv("MICROSOFT_CALENDAR_WEBHOOK_TOKEN"),
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft subscription registration failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { id: data.id, expirationDateTime: data.expirationDateTime };
}

/** Best-effort — called on disconnect. An un-renewed subscription just
 * expires on its own within ~3 days, so a failure here isn't worth
 * surfacing to the host. */
export async function stopSubscription(accessToken: string, subscriptionId: string): Promise<void> {
  await fetch(`${GRAPH_API}/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

interface MicrosoftEvent {
  id: string;
  isCancelled?: boolean;
  isAllDay?: boolean;
  // Graph's own signal for "does this block my time" — "free" is the
  // direct counterpart to Google's transparency: "transparent".
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  // Present (with no other fields but `id`) on delta-removed items —
  // Graph's equivalent of Google's status: "cancelled" entry.
  "@removed"?: { reason: string };
}

export interface EventsDeltaResult {
  events: MicrosoftEvent[];
  nextDeltaLink: string | null;
  /** True if Graph rejected the stored delta link (410 Gone) and this was
   * refetched as a full resync — same meaning as the Google module's flag. */
  wasFullResync: boolean;
}

/** Fetches the delta since `deltaLink` (or a fresh ~400-day forward window
 * for the very first sync). `deltaLink` is Graph's full resumable query
 * URL, not a bare opaque token like Google's syncToken — Microsoft
 * returns it as the very next request to make, params and all, so it's
 * stored and replayed verbatim rather than being reassembled here. */
export async function fetchEventsDelta(
  accessToken: string,
  deltaLink: string | null,
): Promise<EventsDeltaResult> {
  const events: MicrosoftEvent[] = [];
  let nextDeltaLink: string | null = null;
  let wasFullResync = false;

  const initialUrl = () => {
    const params = new URLSearchParams({
      startDateTime: new Date().toISOString(),
      endDateTime: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return `${GRAPH_API}/me/calendarview/delta?${params.toString()}`;
  };

  let url = deltaLink ?? initialUrl();

  for (;;) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Sidesteps per-event timezone bookkeeping entirely — every
        // dateTime in the response is normalized to UTC, so there's no
        // Google-style per-part timezone to track for timed events (only
        // all-day events still need the host's own timezone, below).
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (res.status === 410 && deltaLink) {
      // The stored delta link is no longer valid — Graph's documented
      // recovery is the same shape as Google's 410: drop it and restart
      // from a fresh window rather than trying to resume.
      wasFullResync = true;
      events.length = 0;
      url = initialUrl();
      continue;
    }
    if (!res.ok) {
      throw new Error(`Microsoft calendarView delta failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    events.push(...(data.value ?? []));

    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
      continue;
    }
    if (data["@odata.deltaLink"]) {
      nextDeltaLink = data["@odata.deltaLink"];
    }
    break;
  }

  return { events, nextDeltaLink, wasFullResync };
}

function toInstant(
  part: { dateTime: string; timeZone: string } | undefined,
  hostTimezone: string,
  isAllDay: boolean,
  edge: "start" | "end",
): string | null {
  if (!part) return null;
  if (!isAllDay) {
    // Already UTC-normalized by the Prefer header above.
    return DateTime.fromISO(part.dateTime, { zone: part.timeZone }).toUTC().toISO();
  }
  // All-day event: the UTC-normalized dateTime is midnight relative to
  // UTC, not the host's own day — re-anchor to the host's local day
  // boundary instead, same reasoning as the Google module's all-day
  // handling (part.dateTime here is a bare "YYYY-MM-DD..." local wall time).
  const dt = DateTime.fromISO(part.dateTime.slice(0, 10), { zone: hostTimezone });
  return (edge === "start" ? dt.startOf("day") : dt.plus({ days: 1 }).startOf("day")).toUTC().toISO();
}

/** Pulls the delta since this connection's last sync and reconciles
 * calendar_busy_blocks to match — the Microsoft counterpart to the Google
 * module's performSync, called after a host connects and again whenever
 * Graph's webhook fires. */
export async function performSync(connection: CalendarConnectionRow): Promise<void> {
  const supabase = createServiceClient();
  const accessToken = await ensureFreshMicrosoftAccessToken(connection);

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", connection.owner_id)
    .maybeSingle();
  const hostTimezone = profile?.timezone ?? "UTC";

  const { events, nextDeltaLink, wasFullResync } = await fetchEventsDelta(
    accessToken,
    connection.sync_token,
  );

  if (wasFullResync) {
    await supabase.from("calendar_busy_blocks").delete().eq("connection_id", connection.id);
  }

  for (const event of events) {
    const isRemoved = "@removed" in event;
    const isBusy = !isRemoved && !event.isCancelled && event.showAs !== "free";

    if (!isBusy) {
      await supabase
        .from("calendar_busy_blocks")
        .delete()
        .eq("connection_id", connection.id)
        .eq("external_event_id", event.id);
      continue;
    }

    const isAllDay = event.isAllDay ?? false;
    const startsAt = toInstant(event.start, hostTimezone, isAllDay, "start");
    const endsAt = toInstant(event.end, hostTimezone, isAllDay, "end");
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
      sync_token: nextDeltaLink ?? connection.sync_token,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
}

export type { MicrosoftEvent };
