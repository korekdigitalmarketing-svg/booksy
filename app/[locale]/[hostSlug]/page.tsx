import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getHostBySlug, getActiveEventTypes } from "@/lib/public-data";
import { getLocalized } from "@/lib/i18n-content";
import { formatCurrency } from "@/lib/format";

type Props = {
  params: Promise<{ locale: string; hostSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hostSlug } = await params;
  const host = await getHostBySlug(hostSlug);
  if (!host) return {};
  return { title: host.fullName };
}

export default async function HostPage({ params }: Props) {
  const { locale, hostSlug } = await params;
  setRequestLocale(locale);

  const host = await getHostBySlug(hostSlug);
  if (!host) notFound();

  const eventTypes = await getActiveEventTypes(host.id);
  const t = await getTranslations("host");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-secondary text-xl font-heading font-semibold text-secondary-foreground">
          {host.fullName.charAt(0).toLocaleUpperCase(locale)}
        </div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {host.fullName}
        </h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("eventsHeading")}
        </h2>

        {eventTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {eventTypes.map((eventType) => {
              const title = getLocalized(eventType.title, locale, host.locale);
              return (
                <li key={eventType.id}>
                  <Link href={`/${hostSlug}/${eventType.slug}`} className="block">
                    <Card className="transition-colors hover:border-primary/50">
                      <CardContent className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{title}</span>
                          <span className="text-sm text-muted-foreground">
                            {eventType.durationMin} min
                          </span>
                        </div>
                        <Badge variant={eventType.requiresPayment ? "default" : "secondary"}>
                          {eventType.requiresPayment
                            ? formatCurrency(eventType.priceCents, eventType.currency, locale)
                            : t("free")}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
