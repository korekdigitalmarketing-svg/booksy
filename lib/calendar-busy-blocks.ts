import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ExternalBusyBlockInput } from "@/lib/availability";

// Provider-agnostic: calendar_busy_blocks is populated by both
// lib/calendar-sync.ts (Google) and lib/calendar-sync-microsoft.ts, keyed
// by connection_id — but read here by owner_id alone, so a host's Google
// and Microsoft busy blocks combine automatically with zero extra logic.

export interface CalendarConnectionRow {
  id: string;
  owner_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  external_calendar_id: string;
  sync_token: string | null;
}

/** The only function either provider module's callers (the public booking
 * flow) ever call — a plain local-DB read, no third-party API round-trip.
 * /api/slots and /api/bookings both call this the exact same way, with
 * the exact same bound, they already query `bookings` for
 * existingBookings (`.gte("blocked_to", now)`) — no upper bound needed
 * since a connected calendar's future event count is naturally small. */
export async function getExternalBusyBlocks(
  ownerId: string,
  nowISO: string,
): Promise<ExternalBusyBlockInput[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("calendar_busy_blocks")
    .select("starts_at, ends_at")
    .eq("owner_id", ownerId)
    .gte("ends_at", nowISO);

  if (error || !data) return [];
  return data.map((b) => ({ start: b.starts_at, end: b.ends_at }));
}
