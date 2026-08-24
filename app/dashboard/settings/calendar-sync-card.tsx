"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardCalendarConnection } from "@/lib/dashboard-data";

export function CalendarSyncCard(props: {
  connection: DashboardCalendarConnection | null;
  locale: string;
}) {
  // useSearchParams (inside CalendarSyncCardInner) requires a Suspense
  // boundary — same reasoning as app/login/page.tsx's LoginForm. The
  // fallback is only ever visible for an instant (this whole tree is
  // client-rendered regardless), so a plain skeleton is enough — no need
  // to duplicate the real card's markup just for that brief flash.
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      }
    >
      <CalendarSyncCardInner {...props} />
    </Suspense>
  );
}

function CalendarSyncCardInner({
  connection,
  locale,
}: {
  connection: DashboardCalendarConnection | null;
  locale: string;
}) {
  const t = useTranslations("dashboard.settings.calendarSync");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState(false);

  // The Google OAuth callback redirects here with ?calendar=connected|error
  // — this is the one place that result surfaces to the host, since the
  // callback route itself only ever redirects, it can't render a toast.
  useEffect(() => {
    const status = searchParams.get("calendar");
    if (status === "connected") {
      toast.success(t("connectedToast"));
      router.replace("/dashboard/settings");
    } else if (status === "error") {
      toast.error(t("errorToast"));
      router.replace("/dashboard/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/calendar/google/disconnect", { method: "POST" });
      if (!res.ok) {
        toast.error(t("errorToast"));
        return;
      }
      toast.success(t("disconnectedToast"));
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t("heading")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {connection ? (
          <>
            <p className="text-sm">
              {t("connectedAs", {
                date: new Date(connection.updatedAt).toLocaleString(locale),
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={disconnecting}
              onClick={handleDisconnect}
            >
              {disconnecting ? t("disconnectingButton") : t("disconnectButton")}
            </Button>
          </>
        ) : (
          <Link href="/api/calendar/google/connect" className={buttonVariants({ className: "w-fit" })}>
            {t("connectButton")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
