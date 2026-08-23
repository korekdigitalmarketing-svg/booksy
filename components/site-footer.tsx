import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-4">
        <Link
          href="/terms"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("termsLink")}
        </Link>
      </div>
    </footer>
  );
}
