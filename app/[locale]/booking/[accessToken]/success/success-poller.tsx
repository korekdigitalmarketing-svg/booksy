"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { formatSlotTime, formatSlotWeekdayDate, confirmationNumber } from "@/lib/format";

interface BookingStatus {
  bookingId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  eventTitle: string;
  hostName: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // ~1 minute — the webhook lands in seconds, not minutes

const LIVE_STATUSES = new Set(["pending_payment"]);

export function SuccessPoller({ locale, accessToken }: { locale: string; accessToken: string }) {
  const t = useTranslations("booking.success");
  const tCommon = useTranslations("common");
  const [data, setData] = useState<BookingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/bookings/by-token/${accessToken}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const json: BookingStatus = await res.json();
        if (cancelled) return;
        setData(json);

        pollCount.current += 1;
        if (LIVE_STATUSES.has(json.status) && pollCount.current < MAX_POLLS) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (LIVE_STATUSES.has(json.status)) {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken]);

  // Never claim success before the webhook actually lands — a missing or
  // still-pending status renders the "confirming" state, never "confirmed".
  const isConfirmed = data?.status === "confirmed";
  const isTerminalFailure =
    data && !LIVE_STATUSES.has(data.status) && data.status !== "confirmed";

  let body: React.ReactNode;
  if (isConfirmed && data) {
    body = (
      <>
        <CheckCircle2 className="size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {t("confirmedTitle")}
        </h1>
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {formatSlotTime(data.startsAt, data.timezone, locale)}
        </p>
        <p className="text-muted-foreground">
          {formatSlotWeekdayDate(data.startsAt, data.timezone, locale)}
        </p>
        {data.eventTitle ? <p className="text-muted-foreground">{data.eventTitle}</p> : null}
        <p className="text-sm text-muted-foreground">
          {t("confirmationNumberLabel")}:{" "}
          <span className="font-mono font-medium text-foreground">
            {confirmationNumber(data.bookingId)}
          </span>
        </p>
      </>
    );
  } else if (failed || isTerminalFailure) {
    const isExpired = data?.status === "expired";
    body = (
      <>
        <XCircle className="size-12 text-destructive" aria-hidden />
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {isExpired ? t("expiredTitle") : t("problemTitle")}
        </h1>
        <p className="text-muted-foreground">
          {isExpired ? t("expiredDescription") : t("problemDescription")}
        </p>
      </>
    );
  } else {
    body = (
      <>
        <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {t("confirmingTitle")}
        </h1>
        <p className="text-muted-foreground">{t("confirmingDescription")}</p>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {body}
      {(isConfirmed || failed || isTerminalFailure) && (
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          {tCommon("back")}
        </Link>
      )}
    </main>
  );
}
