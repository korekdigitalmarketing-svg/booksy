"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { SlotPicker } from "@/components/slot-picker";
import { ApiErrorCode } from "@/lib/api-errors";

export function RescheduleBookingDialog({
  bookingId,
  eventTypeId,
  inviteeName,
  locale,
  maxDaysAhead,
  triggerLabel,
}: {
  bookingId: string;
  eventTypeId: string;
  inviteeName: string;
  locale: string;
  maxDaysAhead: number;
  triggerLabel: string;
}) {
  const t = useTranslations("dashboard.reschedule");
  const tBooking = useTranslations("booking");
  const router = useRouter();
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
        body: JSON.stringify({ slot: selected.iso, timezone: selected.timezone }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code: string = data?.error?.code ?? ApiErrorCode.INTERNAL_ERROR;
        toast.error(tBooking(`errors.${code}` as "errors.INTERNAL_ERROR"));
        return;
      }
      toast.success(t("toast"));
      setOpen(false);
      setSelected(null);
      router.refresh();
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
      <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription", { inviteeName })}</DialogDescription>
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
            {t("cancelButton")}
          </DialogClose>
          <Button disabled={!selected || submitting} onClick={handleConfirm}>
            {t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
