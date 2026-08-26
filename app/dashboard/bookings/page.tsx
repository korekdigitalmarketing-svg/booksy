import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  History,
  ListFilter,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireHostProfile, getBookingsList, type BookingFilter } from "@/lib/dashboard-data";
import { formatSlotTime, formatSlotWeekdayDate, formatCurrency, confirmationNumber } from "@/lib/format";
import { CancelBookingDialog } from "../cancel-booking-dialog";
import { RescheduleBookingDialog } from "../reschedule-booking-dialog";
import { NoShowButton } from "./no-show-button";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

const FILTERS: BookingFilter[] = ["upcoming", "past", "all"];

type Props = {
  searchParams: Promise<{ filter?: string }>;
};

export default async function DashboardBookingsPage({ searchParams }: Props) {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.bookings");
  const { filter: rawFilter } = await searchParams;
  const filter: BookingFilter = FILTERS.includes(rawFilter as BookingFilter)
    ? (rawFilter as BookingFilter)
    : "upcoming";

  const bookings = await getBookingsList(profile.locale, filter);
  const statusLabel = (status: string) => t(`status.${status}` as `status.${string}`);
  const confirmed = bookings.filter((booking) => booking.status === "confirmed").length;
  const pending = bookings.filter((booking) => booking.status === "pending_payment").length;
  const cancelled = bookings.filter((booking) => booking.status.startsWith("cancelled")).length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl bg-muted/40 p-5 ring-1 ring-border md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight md:text-3xl">{t("heading")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <div className="flex w-fit items-center gap-1 rounded-lg bg-background p-1 ring-1 ring-border">
          <ListFilter className="ml-2 size-4 text-muted-foreground" aria-hidden />
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={`/dashboard/bookings?filter=${f}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(`filter${f.charAt(0).toUpperCase()}${f.slice(1)}` as `filter${string}`)}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <BookingStat icon={UsersRound} value={bookings.length} label={t("statShown")} />
        <BookingStat icon={CalendarCheck2} value={confirmed} label={t("status.confirmed")} />
        <BookingStat icon={CalendarClock} value={pending} label={t("status.pending_payment")} />
        <BookingStat icon={History} value={cancelled} label={t("statCancelled")} />
      </section>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 className="size-5" aria-hidden />}
          title={t("noBookings")}
          description={t("emptyDescription")}
          action={
            <Link href="/dashboard/event-types" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("emptyAction")}
            </Link>
          }
        />
      ) : (
        <>
          <Card className="hidden md:flex">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnWhen")}</TableHead>
                    <TableHead>{t("columnClient")}</TableHead>
                    <TableHead>{t("columnService")}</TableHead>
                    <TableHead>{t("columnStatus")}</TableHead>
                    <TableHead className="text-right">{t("columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell><BookingTime booking={b} timezone={profile.timezone} locale={profile.locale} /></TableCell>
                      <TableCell><BookingClient booking={b} /></TableCell>
                      <TableCell><BookingService booking={b} locale={profile.locale} t={t} /></TableCell>
                      <TableCell>
                        <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{statusLabel(b.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <BookingActions booking={b} locale={profile.locale} rescheduleLabel={t("rescheduleButton")} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <ul className="flex flex-col gap-3 md:hidden">
            {bookings.map((b) => (
              <li key={b.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <BookingTime booking={b} timezone={profile.timezone} locale={profile.locale} />
                      <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{statusLabel(b.status)}</Badge>
                    </div>
                    <BookingClient booking={b} />
                    <BookingService booking={b} locale={profile.locale} t={t} />
                    <BookingActions booking={b} locale={profile.locale} rescheduleLabel={t("rescheduleButton")} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function BookingStat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

function BookingTime({ booking, timezone, locale }: { booking: { startsAt: string }; timezone: string; locale: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-sm font-semibold tabular-nums">{formatSlotTime(booking.startsAt, timezone, locale)}</span>
      <span className="text-xs text-muted-foreground">{formatSlotWeekdayDate(booking.startsAt, timezone, locale)}</span>
    </div>
  );
}

function BookingClient({ booking }: { booking: { inviteeName: string; inviteeEmail: string; id: string } }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{booking.inviteeName}</span>
      <span className="truncate text-xs text-muted-foreground">{booking.inviteeEmail}</span>
      <span className="font-mono text-xs text-muted-foreground">{confirmationNumber(booking.id)}</span>
    </div>
  );
}

function BookingService({
  booking,
  locale,
  t,
}: {
  booking: { eventTitle: string; amountCents: number; totalPriceCents: number; currency: string };
  locale: string;
  t: (key: "balanceDueBadge", values: { amount: string }) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">{booking.eventTitle}</span>
      <div className="flex flex-wrap gap-1.5">
        {booking.amountCents > 0 ? (
          <Badge variant="outline" className="w-fit">{formatCurrency(booking.amountCents, booking.currency, locale)}</Badge>
        ) : null}
        {booking.totalPriceCents > booking.amountCents ? (
          <Badge variant="secondary" className="w-fit">
            {t("balanceDueBadge", {
              amount: formatCurrency(booking.totalPriceCents - booking.amountCents, booking.currency, locale),
            })}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function BookingActions({ booking, locale, rescheduleLabel }: { booking: Parameters<typeof BookingService>[0]["booking"] & { id: string; status: string; startsAt: string; eventTypeId: string; inviteeName: string; maxDaysAhead: number }; locale: string; rescheduleLabel: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {booking.status === "confirmed" && new Date(booking.startsAt) < new Date() ? <NoShowButton bookingId={booking.id} /> : null}
      {booking.status === "confirmed" && new Date(booking.startsAt) >= new Date() ? (
        <RescheduleBookingDialog
          bookingId={booking.id}
          eventTypeId={booking.eventTypeId}
          inviteeName={booking.inviteeName}
          locale={locale}
          maxDaysAhead={booking.maxDaysAhead}
          triggerLabel={rescheduleLabel}
        />
      ) : null}
      {booking.status === "confirmed" || booking.status === "pending_payment" ? (
        <CancelBookingDialog bookingId={booking.id} inviteeName={booking.inviteeName} />
      ) : null}
    </div>
  );
}
