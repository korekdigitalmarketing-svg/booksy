import { DateTime } from "luxon";

// Section 5's slot generation algorithm — pure and unit-tested. Never do
// naive Date arithmetic here: every instant is produced by asking Luxon
// to add real elapsed minutes to a zoned DateTime, which is what makes
// this correct across DST transitions without any special-casing.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, matches the DB check constraint

export interface AvailabilityRuleInput {
  weekday: Weekday;
  startTime: string; // "HH:mm" or "HH:mm:ss", host-local
  endTime: string;
}

export interface DateOverrideInput {
  theDate: string; // "YYYY-MM-DD", host-local
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
}

export type LiveBookingStatus = "pending_payment" | "confirmed";
export type BookingStatus =
  | LiveBookingStatus
  | "cancelled_by_host"
  | "cancelled_by_client"
  | "expired"
  | "no_show";

export interface ExistingBookingInput {
  // Mirrors bookings.blocked_from/blocked_to — already buffer-inclusive,
  // exactly like the blocked_period the DB's exclusion constraint guards.
  blockedFrom: string; // ISO instant
  blockedTo: string; // ISO instant
  startsAt: string; // ISO instant — used to bucket a booking into a host-local day for max_per_day
  status: BookingStatus;
  holdExpiresAt: string | null;
}

export interface ExternalBusyBlockInput {
  // A synced event from the host's external calendar (calendar_busy_blocks).
  // Unlike ExistingBookingInput, this carries no status/hold semantics —
  // an external event is either present in the local cache or it isn't,
  // so it's unconditionally "live" for the purposes of blocking a slot.
  start: string; // ISO instant
  end: string; // ISO instant
}

export interface EventTypeInput {
  durationMin: number;
  slotIncrementMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  maxPerDay: number | null;
}

export interface GenerateSlotsParams {
  eventType: EventTypeInput;
  hostTimezone: string;
  availabilityRules: AvailabilityRuleInput[];
  dateOverrides: DateOverrideInput[];
  existingBookings: ExistingBookingInput[];
  /** Synced busy intervals from a connected external calendar (Google, etc).
   * Optional and defaults to none — existing callers that don't pass it
   * behave exactly as before. */
  externalBusyBlocks?: ExternalBusyBlockInput[];
  visitorTimezone: string;
  fromDate: string; // "YYYY-MM-DD" in the VISITOR's local calendar
  toDate: string; // "YYYY-MM-DD" in the VISITOR's local calendar, inclusive
  /** Injectable for deterministic tests; defaults to the real current instant. */
  now?: DateTime;
}

interface Window {
  startTime: string;
  endTime: string;
}

function isBookingLive(booking: ExistingBookingInput, now: DateTime): boolean {
  if (booking.status !== "pending_payment" && booking.status !== "confirmed") {
    return false;
  }
  if (booking.status === "pending_payment" && booking.holdExpiresAt) {
    const expires = DateTime.fromISO(booking.holdExpiresAt, { zone: "utc" });
    // A hold past its expiry hasn't necessarily been swept to 'expired' by
    // the cron yet (it runs every 5 minutes) — treat it as already free
    // for the purpose of *offering* slots. The exclusion constraint still
    // protects against a real concurrent write until the sweep catches up.
    if (expires <= now) return false;
  }
  return true;
}

function resolveWindowsForDate(
  hostDate: string,
  dbWeekday: Weekday,
  rules: AvailabilityRuleInput[],
  overrides: DateOverrideInput[],
): Window[] {
  const overridesForDate = overrides.filter((o) => o.theDate === hostDate);

  if (overridesForDate.length > 0) {
    // A closed override always wins, even alongside other override rows.
    if (overridesForDate.some((o) => o.isClosed)) return [];
    return overridesForDate
      .filter((o): o is DateOverrideInput & { startTime: string; endTime: string } =>
        Boolean(o.startTime && o.endTime),
      )
      .map((o) => ({ startTime: o.startTime, endTime: o.endTime }));
  }

  // No override for this date at all — fall back to the weekly rules.
  // Overrides REPLACE the day's rules when present; they never merge.
  return rules
    .filter((r) => r.weekday === dbWeekday)
    .map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
}

export function generateSlots(params: GenerateSlotsParams): string[] {
  const {
    eventType,
    hostTimezone,
    availabilityRules,
    dateOverrides,
    existingBookings,
    externalBusyBlocks = [],
    visitorTimezone,
    fromDate,
    toDate,
  } = params;
  const now = params.now ?? DateTime.utc();

  const visitorWindowStart = DateTime.fromISO(fromDate, { zone: visitorTimezone }).startOf("day");
  const visitorWindowEndExclusive = DateTime.fromISO(toDate, { zone: visitorTimezone })
    .startOf("day")
    .plus({ days: 1 });

  if (!visitorWindowStart.isValid || !visitorWindowEndExclusive.isValid) {
    throw new RangeError("generateSlots: invalid fromDate/toDate/visitorTimezone");
  }

  const liveBookings = existingBookings.filter((b) => isBookingLive(b, now));

  // Host-local calendar dates to scan. Padded 2 days on each side of the
  // visitor's requested window so any host/visitor timezone combination —
  // up to the real-world extreme of UTC-12 to UTC+14, a 26-hour spread
  // that can shift a calendar date by up to 2 days — is fully covered.
  // The padding only widens the scan; the visitor-window check below is
  // what actually decides inclusion, so over-scanning is harmless.
  let cursorDate = visitorWindowStart.setZone(hostTimezone).minus({ days: 2 }).startOf("day");
  const hostScanEndExclusive = visitorWindowEndExclusive
    .setZone(hostTimezone)
    .plus({ days: 2 })
    .startOf("day");

  const minNoticeThreshold = now.plus({ minutes: eventType.minNoticeMin });
  const maxDaysAheadThreshold = now.plus({ days: eventType.maxDaysAhead });

  const liveCountByHostDate = new Map<string, number>();
  if (eventType.maxPerDay != null) {
    for (const b of liveBookings) {
      const d = DateTime.fromISO(b.startsAt, { zone: "utc" }).setZone(hostTimezone).toISODate();
      if (!d) continue;
      liveCountByHostDate.set(d, (liveCountByHostDate.get(d) ?? 0) + 1);
    }
  }

  const results: DateTime[] = [];

  while (cursorDate < hostScanEndExclusive) {
    const hostDate = cursorDate.toISODate();
    if (!hostDate) {
      cursorDate = cursorDate.plus({ days: 1 });
      continue;
    }
    const dbWeekday = (cursorDate.weekday % 7) as Weekday; // Luxon: 1=Mon..7=Sun → 0=Sun..6=Sat

    const dayIsFull =
      eventType.maxPerDay != null &&
      (liveCountByHostDate.get(hostDate) ?? 0) >= eventType.maxPerDay;

    if (!dayIsFull) {
      const windows = resolveWindowsForDate(hostDate, dbWeekday, availabilityRules, dateOverrides);

      for (const window of windows) {
        const windowStart = DateTime.fromISO(`${hostDate}T${window.startTime}`, {
          zone: hostTimezone,
        });
        const windowEnd = DateTime.fromISO(`${hostDate}T${window.endTime}`, {
          zone: hostTimezone,
        });
        if (!windowStart.isValid || !windowEnd.isValid || windowEnd <= windowStart) continue;

        let candidateStart = windowStart;
        while (candidateStart.plus({ minutes: eventType.durationMin }) <= windowEnd) {
          const candidateEnd = candidateStart.plus({ minutes: eventType.durationMin });

          const withinNotice = candidateStart >= minNoticeThreshold;
          const withinHorizon = candidateStart <= maxDaysAheadThreshold;
          const withinVisitorWindow =
            candidateStart >= visitorWindowStart && candidateStart < visitorWindowEndExclusive;

          if (withinNotice && withinHorizon && withinVisitorWindow) {
            const bufferedStart = candidateStart.minus({ minutes: eventType.bufferBeforeMin });
            const bufferedEnd = candidateEnd.plus({ minutes: eventType.bufferAfterMin });

            const collides =
              liveBookings.some((b) => {
                const blockedFrom = DateTime.fromISO(b.blockedFrom, { zone: "utc" });
                const blockedTo = DateTime.fromISO(b.blockedTo, { zone: "utc" });
                // Half-open interval overlap, matching Postgres tstzrange '[)'.
                return bufferedStart < blockedTo && bufferedEnd > blockedFrom;
              }) ||
              externalBusyBlocks.some((block) => {
                const blockedFrom = DateTime.fromISO(block.start, { zone: "utc" });
                const blockedTo = DateTime.fromISO(block.end, { zone: "utc" });
                return bufferedStart < blockedTo && bufferedEnd > blockedFrom;
              });

            if (!collides) {
              results.push(candidateStart);
            }
          }

          candidateStart = candidateStart.plus({ minutes: eventType.slotIncrementMin });
        }
      }
    }

    cursorDate = cursorDate.plus({ days: 1 });
  }

  results.sort((a, b) => a.toMillis() - b.toMillis());
  return results.map((dt) => dt.toUTC().toISO() as string);
}
