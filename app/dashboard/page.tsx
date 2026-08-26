import { DateTime } from "luxon";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import {
  CalendarCheck,
  CalendarClock,
  CircleDollarSign,
  Link2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { LanguageSwitcher } from "./language-switcher";
import { HomeCalendar } from "./home-calendar";

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
    <div className="flex max-w-6xl flex-col gap-7">
      <section className="flex flex-col gap-4 rounded-xl bg-muted/40 p-5 ring-1 ring-border md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-heading font-semibold tracking-tight md:text-3xl">{t("heading")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("subheading")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher profile={profile} />
          <CopyLinkButton bookingUrl={bookingUrl} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Stat value={today.length} label={t("stats.todayLabel")} icon={CalendarClock} tone="primary" />
        <Stat value={upcoming.length} label={t("stats.upcomingLabel")} icon={CalendarCheck} tone="accent" />
        <Stat value={stats.totalConfirmed} label={t("stats.totalLabel")} icon={UsersRound} tone="neutral" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.8fr)]">
        <SchedulePanel title={t("todayHeading")} emptyText={t("noBookingsToday")} itemCount={today.length}>
          <BookingList
            bookings={today}
            timezone={profile.timezone}
            locale={profile.locale}
            rescheduleLabel={t("rescheduleButton")}
          />
        </SchedulePanel>

        <div className="flex flex-col gap-5">
          <HomeCalendar
            bookings={bookings}
            timezone={profile.timezone}
            locale={profile.locale}
            labels={{
              title: t("calendarHeading"),
              description: t("calendarDescription"),
              bookingLabel: t("calendarBookingLabel"),
              bookingsLabel: t("calendarBookingsLabel"),
              todayLabel: t("calendarTodayLabel"),
              previousMonth: t("calendarPreviousMonth"),
              nextMonth: t("calendarNextMonth"),
              selectedDateHeading: t("calendarSelectedDateHeading"),
              noBookingsForDate: t("calendarNoBookingsForDate"),
              rescheduleLabel: t("rescheduleButton"),
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-primary" aria-hidden />
                {t("bookingLinkHeading")}
              </CardTitle>
              <CardDescription>{t("bookingLinkDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground ring-1 ring-border">
                <p className="truncate font-mono">{bookingUrl}</p>
              </div>
            </CardContent>
          </Card>

          <SchedulePanel
            title={t("upcomingHeading")}
            emptyText={t("noUpcoming")}
            itemCount={upcoming.length}
          >
            <BookingList
              bookings={upcoming.slice(0, 4)}
              timezone={profile.timezone}
              locale={profile.locale}
              rescheduleLabel={t("rescheduleButton")}
              compact
            />
          </SchedulePanel>
        </div>
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  icon: Icon,
  tone,
}: {
  value: number;
  label: string;
  icon: LucideIcon;
  tone: "primary" | "accent" | "neutral";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "accent"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="font-mono text-3xl font-semibold leading-none tabular-nums">{value}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="size-5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

function SchedulePanel({
  title,
  emptyText,
  itemCount,
  children,
}: {
  title: string;
  emptyText: string;
  itemCount: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {itemCount > 0 ? children : <p className="text-sm text-muted-foreground">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

function BookingList({
  bookings,
  timezone,
  locale,
  rescheduleLabel,
  compact = false,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  locale: string;
  rescheduleLabel: string;
  compact?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((b) => (
        <li key={b.id}>
          <article className="grid gap-3 rounded-lg bg-background p-3 ring-1 ring-border transition hover:bg-muted/30 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="flex min-w-16 flex-col rounded-lg bg-muted/60 px-3 py-2 ring-1 ring-border">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatSlotTime(b.startsAt, timezone, locale)}
              </span>
              <span className="text-[0.7rem] font-medium text-muted-foreground">
                {formatSlotWeekdayDate(b.startsAt, timezone, locale)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{b.eventTitle}</p>
              <p className="truncate text-sm text-muted-foreground">{b.inviteeName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.amountCents > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <CircleDollarSign className="size-3" aria-hidden />
                    {formatCurrency(b.amountCents, b.currency, locale)}
                  </Badge>
                ) : null}
                {b.status === "pending_payment" ? (
                  <Badge variant="secondary">{b.status.replace("_", " ")}</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {!compact && b.status === "confirmed" ? (
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
          </article>
        </li>
      ))}
    </ul>
  );
}
