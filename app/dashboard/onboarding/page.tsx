import { getTranslations } from "next-intl/server";
import { requireHostProfile } from "@/lib/dashboard-data";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.onboarding");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground">{t("subheading")}</p>
      </div>
      <OnboardingWizard profile={profile} />
    </div>
  );
}
