import { getTranslations } from "next-intl/server";
import { requireHostProfile, getAvailabilityRules, getDateOverrides } from "@/lib/dashboard-data";
import { AvailabilityEditor } from "./availability-editor";

export default async function AvailabilityPage() {
  await requireHostProfile();
  const t = await getTranslations("dashboard.availability");
  const [rules, overrides] = await Promise.all([getAvailabilityRules(), getDateOverrides()]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("heading")}</h1>
      <AvailabilityEditor initialRules={rules} initialOverrides={overrides} />
    </div>
  );
}
