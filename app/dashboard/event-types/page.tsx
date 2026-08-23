import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireHostProfile, getEventTypesList } from "@/lib/dashboard-data";
import { getLocalized } from "@/lib/i18n-content";
import { formatCurrency } from "@/lib/format";
import { ActiveToggle } from "./active-toggle";

export default async function EventTypesPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.eventTypes");
  const eventTypes = await getEventTypesList();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>
        <Link href="/dashboard/event-types/new" className={buttonVariants()}>
          {t("newButton")}
        </Link>
      </div>

      {eventTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEventTypes")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {eventTypes.map((et) => {
            const title = getLocalized(et.title, profile.locale, profile.locale);
            return (
              <li key={et.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{title}</span>
                      <span className="text-sm text-muted-foreground">
                        {et.durationMin} min · /{profile.slug}/{et.slug}
                      </span>
                      {et.priceCents > 0 ? (
                        <Badge variant="default" className="w-fit">
                          {formatCurrency(et.priceCents, et.currency, profile.locale)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <ActiveToggle eventTypeId={et.id} initialActive={et.isActive} />
                        <span className="text-sm text-muted-foreground">
                          {et.isActive ? t("activeLabel") : t("inactiveLabel")}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/event-types/${et.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("editButton")}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
