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

type Provider = "google" | "microsoft";

export function CalendarSyncCard(props: {
  provider: Provider;
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
  provider,
  connection,
  locale,
}: {
  provider: Provider;
  connection: DashboardCalendarConnection | null;
  locale: string;
}) {
  const t = useTranslations(`dashboard.settings.calendarSync.${provider}`);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState(false);

  // The OAuth callback redirects here with ?calendar=connected|error&provider=google|microsoft
  // — this is the one place that result surfaces to the host, since the
  // callback route itself only ever redirects, it can't render a toast.
  // Each card only reacts to its own provider's redirect so connecting
  // one doesn't pop a stray toast on the other's card.
  useEffect(() => {
    const status = searchParams.get("calendar");
    const statusProvider = searchParams.get("provider");
    if (statusProvider !== provider) return;
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
      const res = await fetch(`/api/calendar/${provider}/disconnect`, { method: "POST" });
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
          <Link href={`/api/calendar/${provider}/connect`} className={buttonVariants({ className: "w-fit" })}>
            {t("connectButton")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
