import Image from "next/image";
import { CreditCard, Globe, Languages, Bell } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { routing } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

const FEATURE_ICONS = {
  payments: CreditCard,
  timezones: Globe,
  languages: Languages,
  reminders: Bell,
} as const;

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col gap-5 text-center md:text-left">
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("hero.heading")}
            </h1>
            <p className="text-lg text-muted-foreground">{t("hero.subheading")}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
              <a href="#showcase" className={buttonVariants({ size: "lg" })}>
                {t("hero.ctaPrimary")}
              </a>
              <a
                href="#features"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {t("hero.ctaSecondary")}
              </a>
            </div>
          </div>
          <Image
            src="/marketing/hero-illustration.png"
            alt=""
            width={1920}
            height={1080}
            priority
            className="w-full rounded-2xl"
          />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <h2 className="text-center font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("features.heading")}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {(Object.keys(FEATURE_ICONS) as (keyof typeof FEATURE_ICONS)[]).map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <Card key={key}>
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <Icon className="size-6 text-accent" aria-hidden />
                    <h3 className="font-heading font-semibold">
                      {t(`features.items.${key}.title`)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t(`features.items.${key}.description`)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Showcase */}
      <section id="showcase" className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <h2 className="text-center font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("showcase.heading")}
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <figure className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <Image
                  src="/marketing/screenshot-booking-flow.png"
                  alt="Client booking flow: pick a date, time, and pay"
                  width={1568}
                  height={560}
                  className="w-full"
                />
              </div>
              <figcaption className="text-center text-sm text-muted-foreground">
                {t("showcase.bookingCaption")}
              </figcaption>
            </figure>
            <figure className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <Image
                  src="/marketing/screenshot-dashboard.png"
                  alt="Host dashboard: bookings list with cancel action"
                  width={1568}
                  height={560}
                  className="w-full"
                />
              </div>
              <figcaption className="text-center text-sm text-muted-foreground">
                {t("showcase.dashboardCaption")}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-16 text-center md:py-20">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("cta.heading")}
          </h2>
          <p className="text-muted-foreground">{t("cta.body")}</p>
          {/* Links to the seeded demo host — there's no public sign-up flow yet. */}
          <Link href="/alex" className={buttonVariants({ size: "lg" })}>
            {t("cta.button")}
          </Link>
        </div>
      </section>
    </main>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
