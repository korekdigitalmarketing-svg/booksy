"use client";

import { DateTime } from "luxon";
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardBooking } from "@/lib/dashboard-data";
import { formatCurrency, formatSlotTime, formatSlotWeekdayDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { RescheduleBookingDialog } from "./reschedule-booking-dialog";

interface HomeCalendarLabels {
  title: string;
  description: string;
  bookingLabel: string;
  bookingsLabel: string;
  todayLabel: string;
  previousMonth: string;
  nextMonth: string;
  selectedDateHeading: string;
  noBookingsForDate: string;
  rescheduleLabel: string;
}

export function HomeCalendar({
  bookings,
  timezone,
  locale,
  labels,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  locale: string;
  labels: HomeCalendarLabels;
}) {
  const now = DateTime.now().setZone(timezone).setLocale(locale);
  const [monthStart, setMonthStart] = useState(() => now.startOf("month"));
  const [selectedDate, setSelectedDate] = useState(() => now.toISODate() ?? "");

  const calendarDays = useMemo(() => {
    const gridStart = monthStart.minus({ days: monthStart.weekday % 7 }).startOf("day");
    return Array.from({ length: 42 }, (_, index) => gridStart.plus({ days: index }));
  }, [monthStart]);

  const bookingsByDate = useMemo(() => {
    return bookings.reduce<Record<string, DashboardBooking[]>>((grouped, booking) => {
      const dateKey = DateTime.fromISO(booking.startsAt, { zone: "utc" }).setZone(timezone).toISODate();
      if (!dateKey) return grouped;
      grouped[dateKey] = [...(grouped[dateKey] ?? []), booking];
      return grouped;
    }, {});
  }, [bookings, timezone]);

  const weekdayLabels = calendarDays.slice(0, 7).map((day) => day.setLocale(locale).toFormat("ccc"));
  const monthLabel = monthStart.setLocale(locale).toFormat("LLLL yyyy");
  const selectedBookings = bookingsByDate[selectedDate] ?? [];
  const selectedDateLabel = selectedDate
    ? DateTime.fromISO(selectedDate, { zone: timezone }).setLocale(locale).toFormat("cccc, LLLL d")
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" aria-hidden />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthStart((current) => current.minus({ months: 1 }))}
          >
            <ChevronLeft aria-hidden />
            <span className="sr-only">{labels.previousMonth}</span>
          </Button>
          <div className="text-center">
            <p className="font-heading text-base font-semibold capitalize">{monthLabel}</p>
            <p className="text-xs text-muted-foreground">{labels.todayLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthStart((current) => current.plus({ months: 1 }))}
          >
            <ChevronRight aria-hidden />
            <span className="sr-only">{labels.nextMonth}</span>
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-medium text-muted-foreground">
          {weekdayLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const dateKey = day.toISODate() ?? "";
            const count = bookingsByDate[dateKey]?.length ?? 0;
            const isToday = day.hasSame(now, "day");
            const isSelected = dateKey === selectedDate;
            const isCurrentMonth = day.hasSame(monthStart, "month");
            const bookingText = count === 1 ? labels.bookingLabel : labels.bookingsLabel;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                aria-label={`${day.setLocale(locale).toLocaleString(DateTime.DATE_FULL)}: ${count} ${bookingText}`}
                className={cn(
                  "flex aspect-square min-h-10 flex-col items-center justify-center rounded-lg border text-center transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px sm:min-h-11",
                  isSelected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background",
                  isToday && "border-primary",
                  !isSelected && count > 0 && "bg-emerald-50 text-emerald-950",
                  !isCurrentMonth && "opacity-40",
                )}
              >
                <span className="font-mono text-xs font-semibold tabular-nums">{day.day}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "mt-0.5 h-4 min-w-4 rounded px-1 text-[0.62rem] font-semibold leading-4",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-emerald-600 text-white",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-muted/45 p-3 ring-1 ring-border">
          <p className="text-xs font-medium text-muted-foreground">{labels.selectedDateHeading}</p>
          <h3 className="mt-1 font-heading text-sm font-semibold capitalize">{selectedDateLabel}</h3>

          {selectedBookings.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{labels.noBookingsForDate}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {selectedBookings.map((booking) => (
                <li key={booking.id}>
                  <article className="rounded-lg bg-background p-3 ring-1 ring-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold tabular-nums">
                          {formatSlotTime(booking.startsAt, timezone, locale)}
                        </p>
                        <p className="truncate text-sm font-medium">{booking.eventTitle}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {booking.inviteeName} · {formatSlotWeekdayDate(booking.startsAt, timezone, locale)}
                        </p>
                      </div>
                      {booking.amountCents > 0 ? (
                        <Badge variant="outline" className="gap-1">
                          <CircleDollarSign className="size-3" aria-hidden />
                          {formatCurrency(booking.amountCents, booking.currency, locale)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {booking.status === "confirmed" ? (
                        <RescheduleBookingDialog
                          bookingId={booking.id}
                          eventTypeId={booking.eventTypeId}
                          inviteeName={booking.inviteeName}
                          locale={locale}
                          maxDaysAhead={booking.maxDaysAhead}
                          triggerLabel={labels.rescheduleLabel}
                        />
                      ) : null}
                      <CancelBookingDialog bookingId={booking.id} inviteeName={booking.inviteeName} />
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
