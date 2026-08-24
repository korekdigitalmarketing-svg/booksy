import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  generateSlots,
  type AvailabilityRuleInput,
  type EventTypeInput,
  type ExistingBookingInput,
  type ExternalBusyBlockInput,
  type Weekday,
} from "./availability";

function baseEventType(overrides: Partial<EventTypeInput> = {}): EventTypeInput {
  return {
    durationMin: 30,
    slotIncrementMin: 15,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    maxDaysAhead: 365,
    maxPerDay: null,
    ...overrides,
  };
}

function weekdayOf(dateISO: string, zone: string): Weekday {
  return (DateTime.fromISO(dateISO, { zone }).weekday % 7) as Weekday; // Luxon 1=Mon..7=Sun → 0=Sun..6=Sat
}

/**
 * Finds the first day in `year-month` (host-local, `zone`) whose UTC
 * offset at local noon differs from the previous day's — i.e. a DST
 * transition — instead of hardcoding a specific calendar date from memory.
 */
function findDstTransition(
  zone: string,
  year: number,
  month: number,
): { date: string; kind: "spring-forward" | "fall-back" } | null {
  const daysInMonth = DateTime.local(year, month, 1).daysInMonth ?? 31;
  // Start from the last day of the PREVIOUS month — a transition can land
  // on the 1st (as US fall-back does in some years), which day=1-vs-day=2
  // within the month alone would miss entirely.
  const dayBefore = DateTime.fromObject({ year, month, day: 1 }, { zone }).minus({ days: 1 });
  let prevOffset = dayBefore.set({ hour: 12 }).offset;
  for (let day = 1; day <= daysInMonth; day++) {
    const offset = DateTime.fromObject({ year, month, day, hour: 12 }, { zone }).offset;
    if (offset !== prevOffset) {
      return {
        date: DateTime.fromObject({ year, month, day }, { zone }).toISODate() as string,
        kind: offset > prevOffset ? "spring-forward" : "fall-back",
      };
    }
    prevOffset = offset;
  }
  return null;
}

describe("generateSlots — DST", () => {
  it("spring-forward: keeps every slot at exactly 60 real minutes and drops the vanished hour", () => {
    const zone = "America/New_York";
    const transition = findDstTransition(zone, 2026, 3);
    expect(transition?.kind).toBe("spring-forward");
    const transitionDate = transition!.date;

    const eventType = baseEventType({ durationMin: 60, slotIncrementMin: 60 });
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(transitionDate, zone), startTime: "01:00", endTime: "05:00" },
    ];

    const run = (date: string) =>
      generateSlots({
        eventType,
        hostTimezone: zone,
        availabilityRules: rules,
        dateOverrides: [],
        existingBookings: [],
        visitorTimezone: zone,
        fromDate: date,
        toDate: date,
        now: DateTime.fromISO(date, { zone }).minus({ days: 2 }),
      });

    const transitionSlots = run(transitionDate);
    // A control day one week later, same weekday, no transition: the same
    // local 01:00–05:00 window there is a full 4 real hours.
    const controlDate = DateTime.fromISO(transitionDate, { zone }).plus({ weeks: 1 }).toISODate() as string;
    const controlSlots = run(controlDate);

    expect(controlSlots).toHaveLength(4);
    expect(transitionSlots).toHaveLength(3); // one real hour vanished from the local window

    const starts = transitionSlots.map((iso) => DateTime.fromISO(iso));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].diff(starts[i - 1], "minutes").minutes).toBe(60);
    }
  });

  it("fall-back: keeps every slot at exactly 60 real minutes and captures the repeated hour", () => {
    const zone = "America/New_York";
    const transition = findDstTransition(zone, 2026, 11);
    expect(transition?.kind).toBe("fall-back");
    const transitionDate = transition!.date;

    const eventType = baseEventType({ durationMin: 60, slotIncrementMin: 60 });
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(transitionDate, zone), startTime: "01:00", endTime: "05:00" },
    ];

    const run = (date: string) =>
      generateSlots({
        eventType,
        hostTimezone: zone,
        availabilityRules: rules,
        dateOverrides: [],
        existingBookings: [],
        visitorTimezone: zone,
        fromDate: date,
        toDate: date,
        now: DateTime.fromISO(date, { zone }).minus({ days: 2 }),
      });

    const transitionSlots = run(transitionDate);
    const controlDate = DateTime.fromISO(transitionDate, { zone }).plus({ weeks: 1 }).toISODate() as string;
    const controlSlots = run(controlDate);

    expect(controlSlots).toHaveLength(4);
    expect(transitionSlots).toHaveLength(5); // the repeated hour adds one real hour

    const starts = transitionSlots.map((iso) => DateTime.fromISO(iso));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].diff(starts[i - 1], "minutes").minutes).toBe(60);
    }
  });
});

describe("generateSlots — visitor timezone spans midnight", () => {
  it("includes a host-evening slot under the visitor's PREVIOUS calendar day, and only there", () => {
    const hostZone = "Pacific/Auckland";
    const visitorZone = "America/Los_Angeles";
    const hostDate = "2026-01-06";

    const candidateInstant = DateTime.fromISO(`${hostDate}T00:30:00`, { zone: hostZone });
    const visitorLocalDate = candidateInstant.setZone(visitorZone).toISODate() as string;
    // Sanity check on the scenario itself, not just the algorithm: this
    // instant really must land on a different calendar date for the
    // visitor than for the host, or the test proves nothing.
    expect(visitorLocalDate).not.toBe(hostDate);

    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 30 });
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, hostZone), startTime: "00:00", endTime: "02:00" },
    ];
    const candidateIso = candidateInstant.toUTC().toISO() as string;

    const run = (date: string) =>
      generateSlots({
        eventType,
        hostTimezone: hostZone,
        availabilityRules: rules,
        dateOverrides: [],
        existingBookings: [],
        visitorTimezone: visitorZone,
        fromDate: date,
        toDate: date,
        now: candidateInstant.minus({ days: 1 }),
      });

    expect(run(visitorLocalDate)).toContain(candidateIso);
    // Requesting the host's own calendar date, interpreted as a VISITOR
    // date, must not surface this slot — it belongs to the previous
    // visitor-local day.
    expect(run(hostDate)).not.toContain(candidateIso);
  });
});

describe("generateSlots — buffers", () => {
  it("excludes a candidate inside a prior booking's buffer, and includes the next one right past it", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "12:00" },
    ];
    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 15 });

    const existingStart = DateTime.fromISO(`${hostDate}T09:00:00`, { zone });
    const existingEnd = existingStart.plus({ minutes: 30 });
    const existingBufferedEnd = existingEnd.plus({ minutes: 15 }); // this booking's own 15-min buffer_after

    const existingBookings: ExistingBookingInput[] = [
      {
        blockedFrom: existingStart.toUTC().toISO() as string,
        blockedTo: existingBufferedEnd.toUTC().toISO() as string,
        startsAt: existingStart.toUTC().toISO() as string,
        status: "confirmed",
        holdExpiresAt: null,
      },
    ];

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings,
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now: existingStart.minus({ days: 1 }),
    });

    expect(slots).not.toContain(existingEnd.toUTC().toISO()); // 09:30 — inside the buffer
    expect(slots).toContain(existingBufferedEnd.toUTC().toISO()); // 09:45 — right at the buffer boundary
  });
});

describe("generateSlots — min notice", () => {
  it("includes a slot exactly at the min-notice boundary and excludes the one just before it", () => {
    const zone = "Europe/Paris";
    const now = DateTime.fromISO("2026-06-01T10:00:00Z", { zone: "utc" });
    const hostDate = now.setZone(zone).toISODate() as string;

    const eventType = baseEventType({ durationMin: 15, slotIncrementMin: 15, minNoticeMin: 120 });
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "00:00", endTime: "23:45" },
    ];

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings: [],
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now,
    });

    const boundary = now.plus({ minutes: 120 });
    const justBefore = boundary.minus({ minutes: 15 });

    expect(slots).toContain(boundary.toUTC().toISO());
    expect(slots).not.toContain(justBefore.toUTC().toISO());
  });
});

describe("generateSlots — max per day", () => {
  it("excludes every slot on a host-local date once max_per_day live bookings already exist", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "12:00" },
    ];
    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 30, maxPerDay: 1 });

    const bookedStart = DateTime.fromISO(`${hostDate}T09:00:00`, { zone });
    const existingBookings: ExistingBookingInput[] = [
      {
        blockedFrom: bookedStart.toUTC().toISO() as string,
        blockedTo: bookedStart.plus({ minutes: 30 }).toUTC().toISO() as string,
        startsAt: bookedStart.toUTC().toISO() as string,
        status: "confirmed",
        holdExpiresAt: null,
      },
    ];

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings,
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now: bookedStart.minus({ days: 1 }),
    });

    expect(slots).toHaveLength(0);
  });
});

describe("generateSlots — external busy blocks", () => {
  it("excludes a candidate overlapping a synced external calendar event, same as a real booking would", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "12:00" },
    ];
    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 30 });

    const busyStart = DateTime.fromISO(`${hostDate}T09:00:00`, { zone });
    const externalBusyBlocks: ExternalBusyBlockInput[] = [
      { start: busyStart.toUTC().toISO() as string, end: busyStart.plus({ minutes: 30 }).toUTC().toISO() as string },
    ];

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings: [],
      externalBusyBlocks,
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now: busyStart.minus({ days: 1 }),
    });

    expect(slots).not.toContain(busyStart.toUTC().toISO());
    expect(slots).toContain(busyStart.plus({ minutes: 30 }).toUTC().toISO()); // right past it
  });

  it("omitting externalBusyBlocks entirely behaves exactly as before (backward compatible)", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "10:00" },
    ];
    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 30 });
    const now = DateTime.fromISO(`${hostDate}T00:00:00`, { zone });

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings: [],
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now,
    });

    expect(slots).toHaveLength(2);
  });
});

describe("generateSlots — date overrides", () => {
  it("a closed override removes every slot even though the weekly rule would allow them", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "17:00" },
    ];
    const eventType = baseEventType();

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [{ theDate: hostDate, isClosed: true, startTime: null, endTime: null }],
      existingBookings: [],
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now: DateTime.fromISO(hostDate, { zone }).minus({ days: 1 }),
    });

    expect(slots).toHaveLength(0);
  });

  it("a stale pending_payment hold past its expiry no longer blocks a slot", () => {
    const zone = "Europe/Paris";
    const hostDate = "2026-06-01";
    const rules: AvailabilityRuleInput[] = [
      { weekday: weekdayOf(hostDate, zone), startTime: "09:00", endTime: "10:00" },
    ];
    const eventType = baseEventType({ durationMin: 30, slotIncrementMin: 30 });
    const now = DateTime.fromISO(`${hostDate}T09:00:00`, { zone });
    const slotStart = now; // the held slot itself

    const existingBookings: ExistingBookingInput[] = [
      {
        blockedFrom: slotStart.toUTC().toISO() as string,
        blockedTo: slotStart.plus({ minutes: 30 }).toUTC().toISO() as string,
        startsAt: slotStart.toUTC().toISO() as string,
        status: "pending_payment",
        holdExpiresAt: now.minus({ minutes: 1 }).toUTC().toISO() as string, // expired a minute ago
      },
    ];

    const slots = generateSlots({
      eventType,
      hostTimezone: zone,
      availabilityRules: rules,
      dateOverrides: [],
      existingBookings,
      visitorTimezone: zone,
      fromDate: hostDate,
      toDate: hostDate,
      now,
    });

    expect(slots).toContain(slotStart.toUTC().toISO());
  });
});
