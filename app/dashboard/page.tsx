import { DateTime } from "luxon";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  requireHostProfile,
  getUpcomingBookings,
  getBookingsStats,
  type DashboardBooking,
} from "@/lib/dashboard-data";
import { formatSlotTime, formatSlotWeekdayDate, formatCurrency } from "@/lib/format";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { RescheduleBookingDialog } from "./reschedule-booking-dialog";
import { CopyLinkButton } from "./copy-link-button";

export default async function DashboardHomePage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.home");
  const [bookings, stats] = await Promise.all([
    getUpcomingBookings(profile.locale),
    getBookingsStats(),
  ]);

  const todayEnd = DateTime.now().setZone(profile.timezone).endOf("day");
  const today = bookings.filter((b) => DateTime.fromISO(b.startsAt) <= todayEnd);
  const upcoming = bookings.filter((b) => DateTime.fromISO(b.startsAt) > todayEnd);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const bookingUrl = `${appUrl}/${profile.locale}/${profile.slug}`;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>

      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          <Stat value={today.length} label={t("stats.todayLabel")} />
          <Stat value={upcoming.length} label={t("stats.upcomingLabel")} />
          <Stat value={stats.totalConfirmed} label={t("stats.totalLabel")} />
        </div>
        <CopyLinkButton bookingUrl={bookingUrl} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("todayHeading")}</h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBookingsToday")}</p>
        ) : (
          <BookingList
            bookings={today}
            timezone={profile.timezone}
            locale={profile.locale}
            rescheduleLabel={t("rescheduleButton")}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("upcomingHeading")}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
        ) : (
          <BookingList
            bookings={upcoming}
            timezone={profile.timezone}
            locale={profile.locale}
            rescheduleLabel={t("rescheduleButton")}
          />
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function BookingList({
  bookings,
  timezone,
  locale,
  rescheduleLabel,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  locale: string;
  rescheduleLabel: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((b) => (
        <li key={b.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatSlotTime(b.startsAt, timezone, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatSlotWeekdayDate(b.startsAt, timezone, locale)}
                  </span>
                </div>
                <p className="text-sm">
                  {b.eventTitle} · {b.inviteeName}
                </p>
                {b.amountCents > 0 ? (
                  <Badge variant="outline" className="w-fit">
                    {formatCurrency(b.amountCents, b.currency, locale)}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {b.status === "confirmed" ? (
                  <RescheduleBookingDialog
                    bookingId={b.id}
                    eventTypeId={b.eventTypeId}
                    inviteeName={b.inviteeName}
                    locale={locale}
                    maxDaysAhead={b.maxDaysAhead}
                    triggerLabel={rescheduleLabel}
                  />
                ) : null}
                <CancelBookingDialog bookingId={b.id} inviteeName={b.inviteeName} />
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
