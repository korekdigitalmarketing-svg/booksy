import { getTranslations } from "next-intl/server";

export default async function EventNotFound() {
  const t = await getTranslations("booking");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundDescription")}</p>
    </main>
  );
}
