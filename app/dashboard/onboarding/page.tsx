import { getTranslations } from "next-intl/server";
import { requireHostProfile } from "@/lib/dashboard-data";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.onboarding");

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-3xl font-heading font-semibold">{t("heading")}</h1>
          <p className="mt-2 max-w-xl leading-7 text-muted-foreground">{t("subheading")}</p>
        </div>
        <OnboardingWizard profile={profile} />
      </div>
      <aside className="overflow-hidden border-y border-border py-6 lg:sticky lg:top-10">
        <Image
          src="/guides/booking-flow.png"
          alt={t("guideAlt")}
          width={1693}
          height={935}
          priority
          className="h-auto w-full"
        />
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{t("guideCaption")}</p>
      </aside>
    </div>
  );
}
import Image from "next/image";
