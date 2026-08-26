"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StripeConnectStatus } from "@/lib/dashboard-data";

export function StripeConnectCard(props: { status: StripeConnectStatus }) {
  // Same reasoning as CalendarSyncCard: useSearchParams needs a Suspense
  // boundary, and the fallback is only ever visible for an instant since
  // this whole tree is client-rendered regardless.
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
      <StripeConnectCardInner {...props} />
    </Suspense>
  );
}
function StripeConnectCardInner({ status }: { status: StripeConnectStatus }) {
  const t = useTranslations("dashboard.settings.stripeConnect");
  const router = useRouter();
  const searchParams = useSearchParams();

  // The onboarding return route redirects here with
  // ?stripeConnect=connected|pending|error — the one place that result
  // surfaces to the host, since that route itself only ever redirects.
  useEffect(() => {
    const result = searchParams.get("stripeConnect");
    if (result === "connected") {
      toast.success(t("connectedToast"));
      router.replace("/dashboard/settings");
    } else if (result === "pending") {
      toast(t("pendingToast"));
      router.replace("/dashboard/settings");
    } else if (result === "error") {
      toast.error(t("errorToast"));
      router.replace("/dashboard/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fullyEnabled = status.chargesEnabled && status.payoutsEnabled;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t("heading")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {fullyEnabled ? (
          <>
            <Badge variant="default" className="w-fit">
              {t("activeBadge")}
            </Badge>
            <Link
              href="/api/stripe/connect/dashboard"
              className={buttonVariants({ variant: "outline", className: "w-fit" })}
            >
              {t("manageButton")}
            </Link>
          </>
        ) : status.connected ? (
          <>
            <Badge variant="secondary" className="w-fit">
              {t("pendingBadge")}
            </Badge>
            <Link href="/api/stripe/connect/onboard" className={buttonVariants({ className: "w-fit" })}>
              {t("finishSetupButton")}
            </Link>
          </>
        ) : (
          <Link href="/api/stripe/connect/onboard" className={buttonVariants({ className: "w-fit" })}>
            {t("connectButton")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
