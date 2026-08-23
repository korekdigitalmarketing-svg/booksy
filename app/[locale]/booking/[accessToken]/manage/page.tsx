import { setRequestLocale, getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getLocalized } from "@/lib/i18n-content";
import { ManageBookingClient } from "./manage-client";

type Props = {
  params: Promise<{ locale: string; accessToken: string }>;
};

async function getBookingForManage(accessToken: string) {
  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, invitee_name, invitee_timezone, event_type_id, amount_cents, currency, owner_id",
    )
    .eq("access_token", accessToken)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: eventType }, { data: host }] = await Promise.all([
    supabase
      .from("event_types")
      .select("title, max_days_ahead")
      .eq("id", booking.event_type_id)
      .maybeSingle(),
    supabase.from("profiles").select("full_name, locale").eq("id", booking.owner_id).maybeSingle(),
  ]);
  if (!eventType || !host) return null;

  return { booking, eventType, host };
}

export default async function ManageBookingPage({ params }: Props) {
  const { locale, accessToken } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking.manage");

  const result = await getBookingForManage(accessToken);

  if (!result) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {t("notFoundTitle")}
        </h1>
        <p className="text-muted-foreground">{t("notFoundDescription")}</p>
      </main>
    );
  }

  const { booking, eventType, host } = result;
  const eventTitle = getLocalized(
    (eventType.title ?? {}) as Record<string, string>,
    locale,
    host.locale,
  );

  return (
    <ManageBookingClient
      accessToken={accessToken}
      locale={locale}
      bookingId={booking.id}
      eventTypeId={booking.event_type_id}
      maxDaysAhead={eventType.max_days_ahead}
      status={booking.status}
      startsAt={booking.starts_at}
      timezone={booking.invitee_timezone}
      hostName={host.full_name}
      eventTitle={eventTitle}
      amountCents={booking.amount_cents}
      currency={booking.currency}
    />
  );
}
