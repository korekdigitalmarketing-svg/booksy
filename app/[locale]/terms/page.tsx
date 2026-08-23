import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return { title: t("title") };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("terms");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {t("prohibitedHeading")}
        </h2>
        <p className="text-muted-foreground">{t("prohibitedIntro")}</p>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>{t("prohibitedItem1")}</li>
          <li>{t("prohibitedItem2")}</li>
          <li>{t("prohibitedItem3")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {t("enforcementHeading")}
        </h2>
        <p className="text-muted-foreground">{t("enforcementBody")}</p>
      </section>

      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        {t("scopeNote")}
      </p>
    </main>
  );
}
