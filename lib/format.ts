import { DateTime } from "luxon";

// All date/time/number formatting goes through Luxon + Intl with the
// active locale — never a hand-written month/weekday array or a manually
// branched 12h-vs-24h template. This is what makes first-day-of-week,
// 12h/24h, and date order (section 12's table) fall out automatically
// instead of being reimplemented per locale.

export function formatCurrency(
  amountCents: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    amountCents / 100,
  );
}

/** e.g. en: "2:30 PM" · fr/es: "14:30" — the locale decides 12h vs 24h. */
export function formatSlotTime(
  isoInstant: string,
  timezone: string,
  locale: string,
): string {
  return DateTime.fromISO(isoInstant, { zone: "utc" })
    .setZone(timezone)
    .setLocale(locale)
    .toLocaleString(DateTime.TIME_SIMPLE);
}

/** e.g. en: "Jan 14, 2026" · fr: "14 janv. 2026" · es: "14 ene 2026". */
export function formatSlotDate(
  isoInstant: string,
  timezone: string,
  locale: string,
): string {
  return DateTime.fromISO(isoInstant, { zone: "utc" })
    .setZone(timezone)
    .setLocale(locale)
    .toLocaleString(DateTime.DATE_MED);
}

/** Full weekday + date, for the "you selected" hero display. */
export function formatSlotWeekdayDate(
  isoInstant: string,
  timezone: string,
  locale: string,
): string {
  return DateTime.fromISO(isoInstant, { zone: "utc" })
    .setZone(timezone)
    .setLocale(locale)
    .toLocaleString({ weekday: "long", ...DateTime.DATE_MED });
}

/** e.g. "Monday, August 24, 2026 at 9:00 AM (Europe/Paris)" — for emails,
 *  where the recipient's own timezone must be spelled out explicitly since
 *  there's no page context to show it separately. */
export function formatFullDateTime(
  isoInstant: string,
  timezone: string,
  locale: string,
): string {
  const dt = DateTime.fromISO(isoInstant, { zone: "utc" }).setZone(timezone).setLocale(locale);
  const date = dt.toLocaleString({ weekday: "long", ...DateTime.DATE_MED });
  const time = dt.toLocaleString(DateTime.TIME_SIMPLE);
  return `${date} ${locale === "en" ? "at" : locale === "fr" ? "à" : "a las"} ${time} (${timezone})`;
}

/** Short, human-readable reference derived from the booking's UUID — e.g.
 *  "4098-F357". Not a lookup key (access_token remains that); just something
 *  a client can read over the phone or quote in a support email. */
export function confirmationNumber(bookingId: string): string {
  const hex = bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/** The visitor's guessed IANA timezone, resolved client-side only. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
