import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireHostProfile, getBookingsList, type BookingFilter } from "@/lib/dashboard-data";
import { formatSlotTime, formatSlotWeekdayDate, formatCurrency, confirmationNumber } from "@/lib/format";
import { CancelBookingDialog } from "../cancel-booking-dialog";
import { NoShowButton } from "./no-show-button";

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

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>

      <div className="flex gap-1">
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

      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noBookings")}</p>
      ) : (
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
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-sm tabular-nums">
                      {formatSlotTime(b.startsAt, profile.timezone, profile.locale)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatSlotWeekdayDate(b.startsAt, profile.timezone, profile.locale)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{b.inviteeName}</span>
                    <span className="text-xs text-muted-foreground">{b.inviteeEmail}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {confirmationNumber(b.id)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{b.eventTitle}</span>
                    {b.amountCents > 0 ? (
                      <Badge variant="outline" className="w-fit">
                        {formatCurrency(b.amountCents, b.currency, profile.locale)}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>
                    {statusLabel(b.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {b.status === "confirmed" && new Date(b.startsAt) < new Date() ? (
                      <NoShowButton bookingId={b.id} />
                    ) : null}
                    {b.status === "confirmed" || b.status === "pending_payment" ? (
                      <CancelBookingDialog bookingId={b.id} inviteeName={b.inviteeName} />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
