import { getTranslations } from "next-intl/server";
import { requireHostProfile } from "@/lib/dashboard-data";
import { EventTypeForm } from "../event-type-form";

export default async function NewEventTypePage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.eventTypes");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("newHeading")}</h1>
      <EventTypeForm hostSlug={profile.slug} hostDefaultLocale={profile.locale} />
    </div>
  );
}
