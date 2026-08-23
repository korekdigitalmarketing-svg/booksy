import { DateTime } from "luxon";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireHostProfile, getUpcomingBookings, type DashboardBooking } from "@/lib/dashboard-data";
import { formatSlotTime, formatSlotWeekdayDate, formatCurrency } from "@/lib/format";
import { CancelBookingDialog } from "./cancel-booking-dialog";

export default async function DashboardHomePage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.home");
  const bookings = await getUpcomingBookings(profile.locale);

  const todayEnd = DateTime.now().setZone(profile.timezone).endOf("day");
  const today = bookings.filter((b) => DateTime.fromISO(b.startsAt) <= todayEnd);
  const upcoming = bookings.filter((b) => DateTime.fromISO(b.startsAt) > todayEnd);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("todayHeading")}</h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBookingsToday")}</p>
        ) : (
          <BookingList bookings={today} timezone={profile.timezone} locale={profile.locale} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("upcomingHeading")}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>
        ) : (
          <BookingList bookings={upcoming} timezone={profile.timezone} locale={profile.locale} />
        )}
      </section>
    </div>
  );
}

function BookingList({
  bookings,
  timezone,
  locale,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  locale: string;
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
              <CancelBookingDialog bookingId={b.id} inviteeName={b.inviteeName} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
