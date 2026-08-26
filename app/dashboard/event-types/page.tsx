import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarPlus, Clock3, DollarSign, Link2, Pencil, Settings2, UsersRound, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireHostProfile, getEventTypesList } from "@/lib/dashboard-data";
import { getLocalized } from "@/lib/i18n-content";
import { formatCurrency } from "@/lib/format";
import { ActiveToggle } from "./active-toggle";
import { EmptyState } from "@/components/empty-state";

export default async function EventTypesPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.eventTypes");
  const eventTypes = await getEventTypesList();
  const activeCount = eventTypes.filter((eventType) => eventType.isActive).length;
  const paidCount = eventTypes.filter((eventType) => eventType.priceCents > 0).length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl bg-muted/40 p-5 ring-1 ring-border md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight md:text-3xl">{t("heading")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <Link href="/dashboard/event-types/new" className={buttonVariants({ className: "w-fit" })}>
          <CalendarPlus aria-hidden />
          {t("newButton")}
        </Link>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <EventTypeStat icon={Settings2} value={eventTypes.length} label={t("statTotal")} />
        <EventTypeStat icon={CalendarPlus} value={activeCount} label={t("activeLabel")} />
        <EventTypeStat icon={DollarSign} value={paidCount} label={t("statPaid")} />
      </section>

      {eventTypes.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="size-5" aria-hidden />}
          title={t("noEventTypes")}
          description={t("emptyDescription")}
          action={
            <Link href="/dashboard/event-types/new" className={buttonVariants({ size: "sm" })}>
              {t("newButton")}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {eventTypes.map((et) => {
            const title = getLocalized(et.title, profile.locale, profile.locale);
            return (
              <li key={et.id}>
                <Card>
                  <CardContent className="flex min-h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-heading text-base font-semibold">{title}</h2>
                        <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                          <Link2 className="size-3.5 shrink-0" aria-hidden />
                          /{profile.slug}/{et.slug}
                        </p>
                      </div>
                      <Badge variant={et.isActive ? "default" : "secondary"}>
                        {et.isActive ? t("activeLabel") : t("inactiveLabel")}
                      </Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <span className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm ring-1 ring-border">
                        <Clock3 className="size-4 text-muted-foreground" aria-hidden />
                        {et.durationMin} min
                      </span>
                      <span className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm ring-1 ring-border">
                        <DollarSign className="size-4 text-muted-foreground" aria-hidden />
                        {et.priceCents > 0 ? formatCurrency(et.priceCents, et.currency, profile.locale) : t("freeLabel")}
                      </span>
                      <span className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm ring-1 ring-border">
                        <UsersRound className="size-4 text-muted-foreground" aria-hidden />
                        {et.maxInviteesPerSlot > 1
                          ? t("groupCapacity", { count: et.maxInviteesPerSlot })
                          : t(`form.schedulingModeOptions.${et.schedulingMode}`)}
                      </span>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <div className="flex items-center gap-2">
                        <ActiveToggle eventTypeId={et.id} initialActive={et.isActive} />
                        <span className="text-sm font-medium text-muted-foreground">
                          {et.isActive ? t("activeLabel") : t("inactiveLabel")}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/event-types/${et.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <Pencil aria-hidden />
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

function EventTypeStat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
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
