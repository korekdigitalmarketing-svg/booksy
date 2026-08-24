import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { requireHostProfile, getCalendarConnection } from "@/lib/dashboard-data";
import { SettingsForm } from "./settings-form";
import { CalendarSyncCard } from "./calendar-sync-card";

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
  const [googleConnection, microsoftConnection] = await Promise.all([
    getCalendarConnection("google"),
    getCalendarConnection("microsoft"),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>

      <SettingsForm profile={profile} appUrl={appUrl} />

      <CalendarSyncCard provider="google" connection={googleConnection} locale={profile.locale} />
      <CalendarSyncCard provider="microsoft" connection={microsoftConnection} locale={profile.locale} />

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <h2 className="font-heading text-lg font-semibold">{t("stripeHeading")}</h2>
          <p className="text-sm text-muted-foreground">
            {stripeConfigured ? t("stripeConfigured") : t("stripeNotConfigured")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
