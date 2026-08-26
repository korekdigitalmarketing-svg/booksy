import { getTranslations } from "next-intl/server";
import { GitBranch, Network, Route, UsersRound, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHostProfile, getTeamOverview } from "@/lib/dashboard-data";
import { getLocalized } from "@/lib/i18n-content";

export default async function TeamPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.team");
  const overview = await getTeamOverview(profile);
  const roundRobinCount = overview.eventTypes.filter((eventType) => eventType.schedulingMode === "round_robin").length;
  const collectiveCount = overview.eventTypes.filter((eventType) => eventType.schedulingMode === "collective").length;
  const groupBookingCount = overview.eventTypes.filter((eventType) => eventType.maxInviteesPerSlot > 1).length;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl bg-muted/40 p-5 ring-1 ring-border md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight md:text-3xl">{t("heading")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
        </div>
        <div className="rounded-lg bg-background px-3 py-2 text-sm ring-1 ring-border">
          <p className="font-medium">{overview.organization?.name ?? t("personalWorkspace")}</p>
          <p className="text-xs text-muted-foreground">
            {overview.organization?.slug ?? profile.slug}
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <TeamStat icon={UsersRound} value={overview.members.length} label={t("statMembers")} />
        <TeamStat icon={GitBranch} value={roundRobinCount} label={t("statRoundRobin")} />
        <TeamStat icon={Network} value={collectiveCount} label={t("statCollective")} />
        <TeamStat icon={Route} value={overview.routingForms.length} label={t("statRouting")} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("membersHeading")}</CardTitle>
            <CardDescription>{t("membersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {overview.members.map((member) => (
                <li key={member.profileId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 ring-1 ring-border">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background font-heading text-sm font-semibold ring-1 ring-border">
                      {member.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>{t(`roles.${member.role}`)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("routingHeading")}</CardTitle>
            <CardDescription>{t("routingDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.routingForms.length > 0 ? (
              overview.routingForms.map((form) => (
                <div key={form.id} className="rounded-lg bg-muted/50 p-3 ring-1 ring-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{form.name}</p>
                    <Badge variant={form.isActive ? "default" : "secondary"}>
                      {form.isActive ? t("activeLabel") : t("inactiveLabel")}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground ring-1 ring-border">
                {t("noRoutingForms")}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("eventModesHeading")}</CardTitle>
          <CardDescription>{t("eventModesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.eventTypes.length > 0 ? (
            <ul className="grid gap-3 lg:grid-cols-2">
              {overview.eventTypes.map((eventType) => (
                <li key={eventType.id} className="rounded-lg bg-muted/50 p-3 ring-1 ring-border">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {getLocalized(eventType.title, profile.locale, profile.locale)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {eventType.maxInviteesPerSlot > 1
                          ? t("groupCapacity", { count: eventType.maxInviteesPerSlot })
                          : t("singleInvitee")}
                      </p>
                    </div>
                    <Badge variant={eventType.schedulingMode === "solo" ? "outline" : "default"}>
                      {t(`modes.${eventType.schedulingMode}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground ring-1 ring-border">
              {t("noTeamEventTypes")}
            </p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2">
        <FeatureNote icon={GitBranch} title={t("roundRobinHeading")} body={t("roundRobinDescription")} />
        <FeatureNote icon={Network} title={t("collectiveHeading")} body={t("collectiveDescription")} />
        <FeatureNote icon={UsersRound} title={t("groupHeading")} body={t("groupDescription", { count: groupBookingCount })} />
        <FeatureNote icon={Route} title={t("routingNoteHeading")} body={t("routingNoteDescription")} />
      </section>
    </div>
  );
}

function TeamStat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
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

function FeatureNote({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <article className="rounded-lg bg-background p-4 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
    </article>
  );
}
