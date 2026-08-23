import "server-only";
import { createTranslator } from "next-intl";
import { render } from "@react-email/components";
import { createServiceClient } from "@/lib/supabase/service";
import { getResend } from "@/lib/resend";
import { getLocalized } from "@/lib/i18n-content";
import { formatFullDateTime, formatCurrency, confirmationNumber } from "@/lib/format";
import { generateIcs } from "@/lib/ics";
import { ConfirmationEmail } from "@/lib/emails/confirmation";
import { HostNotificationEmail } from "@/lib/emails/host-notification";
import { ReminderEmail } from "@/lib/emails/reminder";
import { CancellationClientEmail } from "@/lib/emails/cancellation-client";
import { CancellationHostEmail } from "@/lib/emails/cancellation-host";
import { RescheduleClientEmail } from "@/lib/emails/reschedule-client";
import { RescheduleHostEmail } from "@/lib/emails/reschedule-host";

import enMessages from "@/messages/en.json";
import frMessages from "@/messages/fr.json";
import esMessages from "@/messages/es.json";

// Emails render outside any page's request context (called from API
// routes / cron jobs), so there's no ambient locale to read the way a
// Server Component would via getTranslations — next-intl's standalone
// createTranslator is the documented way to use the same message
// catalogs for exactly this case.
const MESSAGES = { en: enMessages, fr: frMessages, es: esMessages } as const;
type SupportedLocale = keyof typeof MESSAGES;

function normalizeLocale(locale: string): SupportedLocale {
  return locale in MESSAGES ? (locale as SupportedLocale) : "en";
}

function translatorFor(locale: string, namespace: string) {
  const loc = normalizeLocale(locale);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- next-intl's own message shape, not app data
  return createTranslator({ locale: loc, messages: MESSAGES[loc] as any, namespace });
}

interface BookingContext {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  inviteeNotes: string | null;
  inviteeTimezone: string;
  inviteeLocale: string;
  amountCents: number;
  currency: string;
  accessToken: string;
  cancelReason: string | null;
  sequence: number;
  eventTitle: Record<string, string>;
  locationKind: string;
  locationValue: string | null;
  hostId: string;
  hostName: string;
  hostEmail: string;
  hostLocale: string;
  hostTimezone: string;
}

async function getBookingContext(bookingId: string): Promise<BookingContext | null> {
  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, event_type_id, owner_id, starts_at, ends_at, invitee_name, invitee_email, invitee_phone, invitee_notes, invitee_timezone, invitee_locale, amount_cents, currency, access_token, cancel_reason, sequence",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: eventType }, { data: host }] = await Promise.all([
    supabase
      .from("event_types")
      .select("title, location_kind, location_value")
      .eq("id", booking.event_type_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, locale, timezone")
      .eq("id", booking.owner_id)
      .maybeSingle(),
  ]);
  if (!eventType || !host) return null;

  return {
    id: booking.id,
    status: booking.status,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    inviteeName: booking.invitee_name,
    inviteeEmail: booking.invitee_email,
    inviteePhone: booking.invitee_phone,
    inviteeNotes: booking.invitee_notes,
    inviteeTimezone: booking.invitee_timezone,
    inviteeLocale: booking.invitee_locale,
    amountCents: booking.amount_cents,
    currency: booking.currency,
    accessToken: booking.access_token,
    cancelReason: booking.cancel_reason,
    sequence: booking.sequence,
    eventTitle: (eventType.title ?? {}) as Record<string, string>,
    locationKind: eventType.location_kind,
    locationValue: eventType.location_value,
    hostId: host.id,
    hostName: host.full_name,
    hostEmail: host.email,
    hostLocale: host.locale,
    hostTimezone: host.timezone,
  };
}

function locationText(kind: string, value: string | null): string {
  return value ?? kind;
}

function manageUrl(accessToken: string, locale: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/${locale}/booking/${accessToken}/manage`;
}

/**
 * The dedupe mechanism the whole module depends on: insert into
 * notifications_log BEFORE sending. If the (booking_id, kind) unique
 * constraint fires, someone already sent (or is sending) this exact
 * notification — skip rather than risk a duplicate email on a webhook
 * retry (section 7).
 */
async function logThenSend(
  bookingId: string,
  kind: string,
  send: () => Promise<{ id: string } | null>,
): Promise<"sent" | "skipped"> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("notifications_log").insert({ booking_id: bookingId, kind });

  if (error) {
    if (error.code === "23505") return "skipped";
    throw new Error(`notifications_log insert failed: ${error.message}`);
  }

  const result = await send();
  if (result?.id) {
    await supabase
      .from("notifications_log")
      .update({ provider_id: result.id })
      .eq("booking_id", bookingId)
      .eq("kind", kind);
  }
  return "sent";
}

const emailFrom = () => process.env.EMAIL_FROM ?? "Booksy <onboarding@resend.dev>";

export async function sendClientConfirmation(bookingId: string): Promise<"sent" | "skipped"> {
  return logThenSend(bookingId, "client_confirmation", async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;

    const locale = ctx.inviteeLocale;
    const t = translatorFor(locale, "emails.confirmation");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      ConfirmationEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { inviteeName: ctx.inviteeName }),
          body: t("body", { eventTitle, hostName: ctx.hostName }),
          footer: tc("footer"),
          dateTimeLabel: tc("dateTimeLabel"),
          locationLabel: tc("locationLabel"),
          priceLabel: tc("priceLabel"),
          notesLabel: tc("notesLabel"),
          confirmationNumberLabel: tc("confirmationNumberLabel"),
          manageLinkText: tc("manageLinkText"),
        },
        confirmationNumber: confirmationNumber(ctx.id),
        dateTimeText: formatFullDateTime(ctx.startsAt, ctx.inviteeTimezone, locale),
        locationText: locationText(ctx.locationKind, ctx.locationValue),
        priceText: ctx.amountCents > 0 ? formatCurrency(ctx.amountCents, ctx.currency, locale) : null,
        notes: ctx.inviteeNotes,
        manageUrl: manageUrl(ctx.accessToken, locale),
      }),
    );

    const ics = generateIcs({
      bookingId: ctx.id,
      sequence: ctx.sequence,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: t("icsSummary", { eventTitle, hostName: ctx.hostName }),
      description: t("icsDescription", { eventTitle, inviteeName: ctx.inviteeName }),
      location: locationText(ctx.locationKind, ctx.locationValue),
      organizerName: ctx.hostName,
      organizerEmail: ctx.hostEmail,
      attendeeName: ctx.inviteeName,
      attendeeEmail: ctx.inviteeEmail,
      language: normalizeLocale(locale),
      status: "CONFIRMED",
      method: "REQUEST",
    });

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.inviteeEmail,
      subject: t("subject", { eventTitle, hostName: ctx.hostName }),
      html,
      attachments: [
        { filename: "booking.ics", content: Buffer.from(ics).toString("base64") },
      ],
    });
    return result.data ? { id: result.data.id } : null;
  });
}

export async function sendHostNotification(bookingId: string): Promise<"sent" | "skipped"> {
  return logThenSend(bookingId, "host_new_booking", async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;

    const locale = ctx.hostLocale;
    const t = translatorFor(locale, "emails.hostNotification");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      HostNotificationEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { hostName: ctx.hostName }),
          body: t("body", { eventTitle, inviteeName: ctx.inviteeName }),
          footer: tc("footer"),
          dateTimeLabel: tc("dateTimeLabel"),
          locationLabel: tc("locationLabel"),
          contactLabel: t("contactLabel"),
          notesLabel: tc("notesLabel"),
        },
        dateTimeText: formatFullDateTime(ctx.startsAt, ctx.hostTimezone, locale),
        locationText: locationText(ctx.locationKind, ctx.locationValue),
        inviteeEmail: ctx.inviteeEmail,
        inviteePhone: ctx.inviteePhone,
        notes: ctx.inviteeNotes,
      }),
    );

    const ics = generateIcs({
      bookingId: ctx.id,
      sequence: ctx.sequence,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: t("icsSummary", { eventTitle, inviteeName: ctx.inviteeName }),
      description: t("icsDescription", { eventTitle, inviteeEmail: ctx.inviteeEmail }),
      location: locationText(ctx.locationKind, ctx.locationValue),
      organizerName: ctx.hostName,
      organizerEmail: ctx.hostEmail,
      attendeeName: ctx.inviteeName,
      attendeeEmail: ctx.inviteeEmail,
      language: normalizeLocale(locale),
      status: "CONFIRMED",
      method: "REQUEST",
    });

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.hostEmail,
      subject: t("subject", { eventTitle, inviteeName: ctx.inviteeName }),
      html,
      attachments: [
        { filename: "booking.ics", content: Buffer.from(ics).toString("base64") },
      ],
    });
    return result.data ? { id: result.data.id } : null;
  });
}

export async function sendReminder(bookingId: string): Promise<"sent" | "skipped"> {
  return logThenSend(bookingId, "reminder_24h", async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;

    const locale = ctx.inviteeLocale;
    const t = translatorFor(locale, "emails.reminder");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      ReminderEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { inviteeName: ctx.inviteeName }),
          body: t("body", { eventTitle, hostName: ctx.hostName }),
          footer: tc("footer"),
          dateTimeLabel: tc("dateTimeLabel"),
          locationLabel: tc("locationLabel"),
        },
        dateTimeText: formatFullDateTime(ctx.startsAt, ctx.inviteeTimezone, locale),
        locationText: locationText(ctx.locationKind, ctx.locationValue),
      }),
    );

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.inviteeEmail,
      subject: t("subject", { eventTitle }),
      html,
    });
    return result.data ? { id: result.data.id } : null;
  });
}

export async function sendCancellationEmails(
  bookingId: string,
  cancelledBy: "host" | "client",
): Promise<{ client: "sent" | "skipped"; host: "sent" | "skipped" }> {
  const client = await logThenSend(bookingId, "cancellation_client", async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;
    const locale = ctx.inviteeLocale;
    const t = translatorFor(locale, "emails.cancellationClient");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      CancellationClientEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { inviteeName: ctx.inviteeName }),
          body: t("body", { eventTitle, hostName: ctx.hostName }),
          footer: tc("footer"),
          dateTimeLabel: tc("dateTimeLabel"),
          cancelledByText: cancelledBy === "host" ? t("cancelledByHost") : t("cancelledByClient"),
          reasonLabel: t("reasonLabel"),
          refundNote: t("refundNote"),
          confirmationNumberLabel: tc("confirmationNumberLabel"),
        },
        confirmationNumber: confirmationNumber(ctx.id),
        dateTimeText: formatFullDateTime(ctx.startsAt, ctx.inviteeTimezone, locale),
        reason: ctx.cancelReason,
        wasPaid: ctx.amountCents > 0,
      }),
    );

    const ics = generateIcs({
      bookingId: ctx.id,
      sequence: ctx.sequence,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: eventTitle,
      description: eventTitle,
      location: locationText(ctx.locationKind, ctx.locationValue),
      organizerName: ctx.hostName,
      organizerEmail: ctx.hostEmail,
      attendeeName: ctx.inviteeName,
      attendeeEmail: ctx.inviteeEmail,
      language: normalizeLocale(locale),
      status: "CANCELLED",
      method: "CANCEL",
    });

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.inviteeEmail,
      subject: t("subject", { eventTitle, hostName: ctx.hostName }),
      html,
      attachments: [
        { filename: "booking.ics", content: Buffer.from(ics).toString("base64") },
      ],
    });
    return result.data ? { id: result.data.id } : null;
  });

  const host = await logThenSend(bookingId, "cancellation_host", async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;
    const locale = ctx.hostLocale;
    const t = translatorFor(locale, "emails.cancellationHost");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      CancellationHostEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { hostName: ctx.hostName }),
          body: t("body", { inviteeName: ctx.inviteeName }),
          footer: tc("footer"),
          dateTimeLabel: tc("dateTimeLabel"),
          cancelledByText:
            cancelledBy === "host" ? t("cancelledByHost") : t("cancelledByClient", { inviteeName: ctx.inviteeName }),
          reasonLabel: t("reasonLabel"),
        },
        dateTimeText: formatFullDateTime(ctx.startsAt, ctx.hostTimezone, locale),
        reason: ctx.cancelReason,
      }),
    );

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.hostEmail,
      subject: t("subject", { eventTitle, inviteeName: ctx.inviteeName }),
      html,
    });
    return result.data ? { id: result.data.id } : null;
  });

  return { client, host };
}

export async function sendRescheduleEmails(
  bookingId: string,
  previousStartsAt: string,
): Promise<{ client: "sent" | "skipped"; host: "sent" | "skipped" }> {
  // Unlike the other notification kinds, a booking can be rescheduled more
  // than once — the (booking_id, kind) unique constraint that dedupes
  // webhook-retry sends would otherwise silently swallow every reschedule
  // after the first. Folding the post-update sequence number into the kind
  // keeps logThenSend's insert-before-send dedupe (guards a genuine
  // double-submit of this one request) without blocking the *next*
  // reschedule.
  const ctx0 = await getBookingContext(bookingId);
  const kindSuffix = ctx0 ? `_v${ctx0.sequence}` : "";

  const client = await logThenSend(bookingId, `reschedule_client${kindSuffix}`, async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;
    const locale = ctx.inviteeLocale;
    const t = translatorFor(locale, "emails.rescheduleClient");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      RescheduleClientEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { inviteeName: ctx.inviteeName }),
          body: t("body", { eventTitle, hostName: ctx.hostName }),
          footer: tc("footer"),
          previousTimeLabel: t("previousTimeLabel"),
          newTimeLabel: t("newTimeLabel"),
          confirmationNumberLabel: tc("confirmationNumberLabel"),
          manageLinkText: tc("manageLinkText"),
        },
        confirmationNumber: confirmationNumber(ctx.id),
        previousDateTimeText: formatFullDateTime(previousStartsAt, ctx.inviteeTimezone, locale),
        newDateTimeText: formatFullDateTime(ctx.startsAt, ctx.inviteeTimezone, locale),
        manageUrl: manageUrl(ctx.accessToken, locale),
      }),
    );

    const ics = generateIcs({
      bookingId: ctx.id,
      sequence: ctx.sequence,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: t("icsSummary", { eventTitle, hostName: ctx.hostName }),
      description: t("icsDescription", { eventTitle, inviteeName: ctx.inviteeName }),
      location: locationText(ctx.locationKind, ctx.locationValue),
      organizerName: ctx.hostName,
      organizerEmail: ctx.hostEmail,
      attendeeName: ctx.inviteeName,
      attendeeEmail: ctx.inviteeEmail,
      language: normalizeLocale(locale),
      status: "CONFIRMED",
      method: "REQUEST",
    });

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.inviteeEmail,
      subject: t("subject", { eventTitle, hostName: ctx.hostName }),
      html,
      attachments: [
        { filename: "booking.ics", content: Buffer.from(ics).toString("base64") },
      ],
    });
    return result.data ? { id: result.data.id } : null;
  });

  const host = await logThenSend(bookingId, `reschedule_host${kindSuffix}`, async () => {
    const ctx = await getBookingContext(bookingId);
    if (!ctx) return null;
    const locale = ctx.hostLocale;
    const t = translatorFor(locale, "emails.rescheduleHost");
    const tc = translatorFor(locale, "emails.common");
    const eventTitle = getLocalized(ctx.eventTitle, locale, ctx.hostLocale);

    const html = await render(
      RescheduleHostEmail({
        t: {
          heading: t("heading"),
          greeting: t("greeting", { hostName: ctx.hostName }),
          body: t("body", { eventTitle, inviteeName: ctx.inviteeName }),
          footer: tc("footer"),
          previousTimeLabel: t("previousTimeLabel"),
          newTimeLabel: t("newTimeLabel"),
        },
        previousDateTimeText: formatFullDateTime(previousStartsAt, ctx.hostTimezone, locale),
        newDateTimeText: formatFullDateTime(ctx.startsAt, ctx.hostTimezone, locale),
      }),
    );

    const result = await getResend().emails.send({
      from: emailFrom(),
      to: ctx.hostEmail,
      subject: t("subject", { eventTitle, inviteeName: ctx.inviteeName }),
      html,
    });
    return result.data ? { id: result.data.id } : null;
  });

  return { client, host };
}
