import "server-only";
import { DateTime } from "luxon";

// A minimal RFC 5545 generator, purpose-built for this app's one use case
// (a single VEVENT per booking) rather than a general calendar library.
// Two things matter more here than anywhere else in the codebase: the UID
// must be stable across resends so a reschedule updates the existing
// calendar entry instead of creating a duplicate, and SEQUENCE must
// increment on every change for the same reason (section 7).

export interface IcsEventInput {
  bookingId: string;
  sequence: number;
  startsAt: string; // ISO instant (UTC)
  endsAt: string; // ISO instant (UTC)
  summary: string;
  description: string;
  location: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  language: "en" | "fr" | "es";
  status: "CONFIRMED" | "CANCELLED";
  method: "REQUEST" | "CANCEL";
}

function icsDate(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  return dt.toFormat("yyyyMMdd'T'HHmmss'Z'");
}

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the only
// characters TEXT values must escape.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545 §3.1: content lines longer than 75 octets must be folded with a
// CRLF followed by a single leading space.
function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;

  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, maxLen));
  rest = rest.slice(maxLen);
  while (rest.length > 0) {
    parts.push(rest.slice(0, maxLen - 1));
    rest = rest.slice(maxLen - 1);
  }
  return parts.join("\r\n ");
}

function icsUidDomain(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    return new URL(appUrl).hostname || "booksy.invalid";
  } catch {
    return "booksy.invalid";
  }
}

export function generateIcs(input: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booksy//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:booking-${input.bookingId}@${icsUidDomain()}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${icsDate(DateTime.utc().toISO() as string)}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY;LANGUAGE=${input.language}:${escapeText(input.summary)}`,
    `DESCRIPTION;LANGUAGE=${input.language}:${escapeText(input.description)}`,
    `LOCATION:${escapeText(input.location)}`,
    `ORGANIZER;CN=${escapeText(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeName)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    `STATUS:${input.status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
