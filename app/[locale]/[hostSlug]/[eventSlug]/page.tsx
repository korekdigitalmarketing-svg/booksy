import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getHostBySlug, getActiveEventTypeBySlug } from "@/lib/public-data";
import { getLocalized } from "@/lib/i18n-content";
import { BookingFlow } from "./booking-flow";

type Props = {
  params: Promise<{ locale: string; hostSlug: string; eventSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, hostSlug, eventSlug } = await params;
  const host = await getHostBySlug(hostSlug);
  if (!host) return {};
  const eventType = await getActiveEventTypeBySlug(host.id, eventSlug);
  if (!eventType) return {};
  return { title: `${getLocalized(eventType.title, locale, host.locale)} — ${host.fullName}` };
}

export default async function EventBookingPage({ params }: Props) {
  const { locale, hostSlug, eventSlug } = await params;
  setRequestLocale(locale);

  const host = await getHostBySlug(hostSlug);
  if (!host) notFound();

  const eventType = await getActiveEventTypeBySlug(host.id, eventSlug);
  if (!eventType) notFound();

  return (
    <BookingFlow
      locale={locale}
      hostSlug={hostSlug}
      host={{ fullName: host.fullName, timezone: host.timezone, locale: host.locale }}
      eventType={eventType}
    />
  );
}
