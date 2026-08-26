import { getTranslations } from "next-intl/server";
import { CreditCard, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHostProfile, getCalendarConnection, getStripeConnectStatus } from "@/lib/dashboard-data";
import { SettingsForm } from "./settings-form";
import { CalendarSyncCard } from "./calendar-sync-card";
import { StripeConnectCard } from "./stripe-connect-card";

// A key is "configured" if it's set and doesn't look like the local
// placeholder value from .env.example / the README's setup instructions.
function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && !key.includes("placeholder"));
}

export default async function SettingsPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.settings");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripeConfigured = isStripeConfigured();
  const [googleConnection, microsoftConnection, stripeConnectStatus] = await Promise.all([
    getCalendarConnection("google"),
    getCalendarConnection("microsoft"),
    getStripeConnectStatus(),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <section className="rounded-xl bg-muted/40 p-5 ring-1 ring-border">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
            <Settings2 className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-heading font-semibold tracking-tight md:text-3xl">{t("heading")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pageDescription")}</p>
          </div>
        </div>
      </section>

      <SettingsForm profile={profile} appUrl={appUrl} />

      <section className="grid gap-4 lg:grid-cols-2">
        <CalendarSyncCard provider="google" connection={googleConnection} locale={profile.locale} />
        <CalendarSyncCard provider="microsoft" connection={microsoftConnection} locale={profile.locale} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4 text-primary" aria-hidden />
            {t("stripeHeading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {stripeConfigured ? t("stripeConfigured") : t("stripeNotConfigured")}
          </p>
        </CardContent>
      </Card>

      {stripeConfigured ? <StripeConnectCard status={stripeConnectStatus} /> : null}
    </div>
  );
}
