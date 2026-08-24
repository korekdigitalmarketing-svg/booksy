"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardProfile } from "@/lib/dashboard-data";

const LOCALES = ["en", "fr", "es"] as const;
const DURATIONS = [15, 30, 45, 60] as const;
const WEEKDAYS = [1, 2, 3, 4, 5, 0, 6] as const; // Monday-first, matching how most hosts think about a work week

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "service";
}

type Step = 1 | 2 | 3;

export function OnboardingWizard({ profile }: { profile: DashboardProfile }) {
  const t = useTranslations("dashboard.onboarding");
  const tSettings = useTranslations("dashboard.settings");
  const tAvailability = useTranslations("dashboard.availability");
  const tEventForm = useTranslations("dashboard.eventTypes.form");
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [finishing, setFinishing] = useState(false);

  // Step 1 — profile basics
  const [timezone, setTimezone] = useState(profile.timezone);
  const [locale, setLocale] = useState(profile.locale);
  const [savingProfile, setSavingProfile] = useState(false);
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [timezone];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 2 — first event type
  const [title, setTitle] = useState("");
  const [durationMin, setDurationMin] = useState<number>(30);
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState(0);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [savingEventType, setSavingEventType] = useState(false);
  const [eventTypeError, setEventTypeError] = useState<string | null>(null);

  // Step 3 — weekly hours
  const [weekly, setWeekly] = useState<Record<number, { open: boolean; start: string; end: string }>>(
    () =>
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((day) => [
          day,
          { open: day >= 1 && day <= 5, start: "09:00", end: "17:00" },
        ]),
      ),
  );
  const [savingAvailability, setSavingAvailability] = useState(false);

  async function completeOnboarding() {
    setFinishing(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setFinishing(false);
    }
  }

  async function handleStep1Continue() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: profile.fullName, slug: profile.slug, timezone, locale }),
      });
      if (!res.ok) {
        toast.error(t("errorToast"));
        return;
      }
      setStep(2);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleStep2Continue() {
    setEventTypeError(null);
    if (!title.trim()) {
      setEventTypeError(t("step2.titleRequiredError"));
      return;
    }
    if (!policyAccepted) {
      setEventTypeError(tEventForm("policyRequiredError"));
      return;
    }
    setSavingEventType(true);
    try {
      const res = await fetch("/api/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugify(title),
          title: { [locale]: title.trim() },
          description: {},
          durationMin,
          priceCents: isFree ? 0 : Math.round(price * 100),
          currency: "USD",
          locationKind: "video",
          bufferBeforeMin: 0,
          bufferAfterMin: 0,
          minNoticeMin: 60,
          maxDaysAhead: 60,
          maxPerDay: null,
          isActive: true,
          policyAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEventTypeError(data?.error?.message ?? t("errorToast"));
        return;
      }
      setStep(3);
    } finally {
      setSavingEventType(false);
    }
  }

  async function handleFinish() {
    setSavingAvailability(true);
    try {
      const rules = WEEKDAYS.filter((day) => weekly[day].open).map((day) => ({
        weekday: day,
        startTime: weekly[day].start,
        endTime: weekly[day].end,
      }));
      if (rules.length > 0) {
        const res = await fetch("/api/availability/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules }),
        });
        if (!res.ok) {
          toast.error(t("errorToast"));
          return;
        }
      }
      await completeOnboarding();
    } finally {
      setSavingAvailability(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <ol className="flex items-center gap-2 text-sm text-muted-foreground">
          {([1, 2, 3] as const).map((s) => (
            <li
              key={s}
              className={
                s === step
                  ? "font-medium text-foreground"
                  : s < step
                    ? "text-foreground/70"
                    : undefined
              }
            >
              {s}. {t(`step${s}.navLabel` as `step${1 | 2 | 3}.navLabel`)}
              {s < 3 ? <span className="ml-2 text-border">→</span> : null}
            </li>
          ))}
        </ol>
        <Button type="button" variant="ghost" size="sm" disabled={finishing} onClick={completeOnboarding}>
          {t("skipSetupButton")}
        </Button>
      </div>

      {step === 1 ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("step1.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step1.description")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{tSettings("timezoneLabel")}</Label>
              <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{tSettings("localeLabel")}</Label>
              <Select value={locale} onValueChange={(v) => v && setLocale(v as typeof locale)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" disabled={savingProfile} onClick={handleStep1Continue} className="w-fit">
              {savingProfile ? t("savingButton") : t("continueButton")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("step2.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step2.description")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onboarding-title">{t("step2.titleLabel")}</Label>
              <Input
                id="onboarding-title"
                value={title}
                placeholder={t("step2.titlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{tEventForm("durationLabel")}</Label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={durationMin === d ? "default" : "outline"}
                    onClick={() => setDurationMin(d)}
                  >
                    {t("step2.durationOption", { minutes: d })}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="onboarding-free" checked={isFree} onCheckedChange={setIsFree} />
              <Label htmlFor="onboarding-free">{t("step2.freeLabel")}</Label>
            </div>

            {!isFree ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="onboarding-price">{tEventForm("priceLabel")}</Label>
                <Input
                  id="onboarding-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
            ) : null}

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
              <input
                id="onboarding-policy"
                type="checkbox"
                className="mt-0.5"
                checked={policyAccepted}
                onChange={(e) => setPolicyAccepted(e.target.checked)}
              />
              <Label htmlFor="onboarding-policy" className="text-sm font-normal">
                {tEventForm("policyLabel")}
              </Label>
            </div>

            {eventTypeError ? <p className="text-sm text-destructive">{eventTypeError}</p> : null}

            <div className="flex gap-2">
              <Button type="button" disabled={savingEventType} onClick={handleStep2Continue}>
                {savingEventType ? t("savingButton") : t("continueButton")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                {t("skipStepButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div>
              <h2 className="font-heading text-lg font-semibold">{t("step3.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("step3.description")}</p>
            </div>

            {WEEKDAYS.map((day) => (
              <div key={day} className="flex items-center gap-3 border-b border-border pb-2 last:border-0">
                <Switch
                  id={`onboarding-day-${day}`}
                  checked={weekly[day].open}
                  onCheckedChange={(open) =>
                    setWeekly((prev) => ({ ...prev, [day]: { ...prev[day], open } }))
                  }
                />
                <Label htmlFor={`onboarding-day-${day}`} className="w-28 font-normal">
                  {tAvailability(`weekdays.${day}` as `weekdays.${number}`)}
                </Label>
                {weekly[day].open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={weekly[day].start}
                      onChange={(e) =>
                        setWeekly((prev) => ({
                          ...prev,
                          [day]: { ...prev[day], start: e.target.value },
                        }))
                      }
                      className="w-32"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={weekly[day].end}
                      onChange={(e) =>
                        setWeekly((prev) => ({
                          ...prev,
                          [day]: { ...prev[day], end: e.target.value },
                        }))
                      }
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{tAvailability("closedLabel")}</span>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <Button type="button" disabled={savingAvailability || finishing} onClick={handleFinish}>
                {savingAvailability || finishing ? t("savingButton") : t("finishButton")}
              </Button>
              <Button type="button" variant="outline" disabled={finishing} onClick={completeOnboarding}>
                {t("skipStepButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
