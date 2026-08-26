"use client";

import { Globe2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardProfile } from "@/lib/dashboard-data";

const LOCALES = ["en", "fr", "es"] as const;
const LOCALE_LABELS: Record<(typeof LOCALES)[number], { short: string; label: string }> = {
  en: { short: "EN", label: "English" },
  fr: { short: "FR", label: "Français" },
  es: { short: "ES", label: "Español" },
};

export function LanguageSwitcher({ profile }: { profile: DashboardProfile }) {
  const router = useRouter();
  const t = useTranslations("dashboard.home");
  const [locale, setLocale] = useState(profile.locale);
  const [saving, setSaving] = useState(false);

  async function updateLocale(nextLocale: string) {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profile.fullName,
          slug: profile.slug,
          timezone: profile.timezone,
          locale: nextLocale,
        }),
      });
      if (!res.ok) {
        setLocale(profile.locale);
        toast.error(t("languageError"));
        return;
      }
      toast.success(t("languageSaved"));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("languageLabel")}>
      <span className="flex h-7 items-center gap-1.5 rounded-lg bg-background px-2 text-xs font-medium text-muted-foreground ring-1 ring-border">
        <Globe2 className="size-3.5" aria-hidden />
        {t("languageLabel")}
      </span>
      {LOCALES.map((loc) => (
        <Button
          key={loc}
          type="button"
          size="xs"
          variant={loc === locale ? "default" : "outline"}
          disabled={saving}
          onClick={() => updateLocale(loc)}
          aria-label={`${t("languageLabel")}: ${LOCALE_LABELS[loc].label}`}
          className={cn("min-w-9 font-mono", loc !== locale && "bg-background")}
        >
          {LOCALE_LABELS[loc].short}
        </Button>
      ))}
    </div>
  );
}
