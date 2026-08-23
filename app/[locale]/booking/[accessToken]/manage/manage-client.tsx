"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker } from "@/components/slot-picker";
import { ApiErrorCode } from "@/lib/api-errors";
import {
  confirmationNumber,
  formatCurrency,
  formatSlotTime,
  formatSlotWeekdayDate,
} from "@/lib/format";

interface ManageBookingClientProps {
  accessToken: string;
  locale: string;
  bookingId: string;
  eventTypeId: string;
  maxDaysAhead: number;
  status: string;
  startsAt: string;
  timezone: string;
  hostName: string;
  eventTitle: string;
  amountCents: number;
  currency: string;
}

const LIVE_STATUSES = new Set(["confirmed"]);

export function ManageBookingClient({
  accessToken,
  locale,
  bookingId,
  eventTypeId,
  maxDaysAhead,
  status,
  startsAt,
  timezone,
  hostName,
  eventTitle,
  amountCents,
  currency,
}: ManageBookingClientProps) {
  const t = useTranslations("booking.manage");
  const router = useRouter();

  const isLive = LIVE_STATUSES.has(status);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        {isLive ? (
          <CheckCircle2 className="size-10 text-primary" aria-hidden />
        ) : (
          <XCircle className="size-10 text-muted-foreground" aria-hidden />
        )}
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {formatSlotTime(startsAt, timezone, locale)}
            </p>
            <p className="text-muted-foreground">
              {formatSlotWeekdayDate(startsAt, timezone, locale)}
            </p>
          </div>
          <p className="text-sm">
            {eventTitle} {t("withHost", { hostName })}
          </p>
          {amountCents > 0 ? (
            <Badge variant="outline" className="w-fit">
              {formatCurrency(amountCents, currency, locale)}
            </Badge>
          ) : null}
          <p className="font-mono text-xs text-muted-foreground">
            {confirmationNumber(bookingId)}
          </p>

          {!isLive ? (
            <p className="text-sm text-muted-foreground">{t("cancelledNotice")}</p>
          ) : (
            <div className="flex gap-2 pt-2">
              <RescheduleDialog
                accessToken={accessToken}
                bookingId={bookingId}
                eventTypeId={eventTypeId}
                maxDaysAhead={maxDaysAhead}
                locale={locale}
                onDone={() => router.refresh()}
              />
              <CancelDialog
                accessToken={accessToken}
                bookingId={bookingId}
                onDone={() => router.refresh()}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function RescheduleDialog({
  accessToken,
  bookingId,
  eventTypeId,
  maxDaysAhead,
  locale,
  onDone,
}: {
  accessToken: string;
  bookingId: string;
  eventTypeId: string;
  maxDaysAhead: number;
  locale: string;
  onDone: () => void;
}) {
  const t = useTranslations("booking.manage");
  const tBooking = useTranslations("booking");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ iso: string; timezone: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: selected.iso, timezone: selected.timezone, accessToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code: string = data?.error?.code ?? ApiErrorCode.INTERNAL_ERROR;
        toast.error(tBooking(`errors.${code}` as "errors.INTERNAL_ERROR"));
        return;
      }
      toast.success(t("rescheduledToast"));
      setOpen(false);
      setSelected(null);
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected(null);
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: "default", size: "sm" })}>
        {t("rescheduleButton")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rescheduleDialogTitle")}</DialogTitle>
        </DialogHeader>
        <SlotPicker
          eventTypeId={eventTypeId}
          locale={locale}
          maxDaysAhead={maxDaysAhead}
          selectedSlot={selected?.iso ?? null}
          onSelectSlot={(iso, timezone) => setSelected({ iso, timezone })}
        />
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: "outline" })}>
            {t("rescheduleCancelButton")}
          </DialogClose>
          <Button disabled={!selected || submitting} onClick={handleConfirm}>
            {t("rescheduleConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  accessToken,
  bookingId,
  onDone,
}: {
  accessToken: string;
  bookingId: string;
  onDone: () => void;
}) {
  const t = useTranslations("booking.manage");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleCancel() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined, accessToken }),
      });
      if (!res.ok) {
        toast.error("Something went wrong. Please try again.");
        return;
      }
      toast.success(t("cancelledToast"));
      setOpen(false);
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        {t("cancelButton")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancelDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cancelDialogBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manage-cancel-reason">{t("cancelReasonLabel")}</Label>
          <Textarea
            id="manage-cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keepButton")}</AlertDialogCancel>
          <AlertDialogAction disabled={submitting} onClick={handleCancel}>
            {t("cancelConfirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
