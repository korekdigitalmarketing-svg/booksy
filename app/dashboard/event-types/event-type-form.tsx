"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardEventType } from "@/lib/dashboard-data";

const LOCALES = ["en", "fr", "es"] as const;
const LOCATION_KINDS = ["video", "phone", "in_person", "custom"] as const;
const SCHEDULING_MODES = ["solo", "round_robin", "collective"] as const;

interface EventTypeFormProps {
  hostSlug: string;
  hostDefaultLocale: string;
  eventTypeId?: string;
  initial?: DashboardEventType;
}

export function EventTypeForm({
  hostSlug,
  hostDefaultLocale,
  eventTypeId,
  initial,
}: EventTypeFormProps) {
  const t = useTranslations("dashboard.eventTypes.form");
  const router = useRouter();
  const isEditing = Boolean(eventTypeId);

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState<Record<string, string>>(initial?.title ?? {});
  const [description, setDescription] = useState<Record<string, string>>(
    initial?.description ?? {},
  );
  const [durationMin, setDurationMin] = useState(initial?.durationMin ?? 30);
  const [priceCents, setPriceCents] = useState(initial ? initial.priceCents / 100 : 0);
  const [requireDeposit, setRequireDeposit] = useState(initial?.depositCents != null);
  const [depositAmount, setDepositAmount] = useState(
    initial?.depositCents != null ? initial.depositCents / 100 : 0,
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [locationKind, setLocationKind] = useState<(typeof LOCATION_KINDS)[number]>(
    initial?.locationKind ?? "video",
  );
  const [locationValue, setLocationValue] = useState(initial?.locationValue ?? "");
  const [bufferBeforeMin, setBufferBeforeMin] = useState(initial?.bufferBeforeMin ?? 0);
  const [bufferAfterMin, setBufferAfterMin] = useState(initial?.bufferAfterMin ?? 0);
  const [minNoticeMin, setMinNoticeMin] = useState(initial?.minNoticeMin ?? 120);
  const [maxDaysAhead, setMaxDaysAhead] = useState(initial?.maxDaysAhead ?? 60);
  const [maxPerDay, setMaxPerDay] = useState<string>(
    initial?.maxPerDay != null ? String(initial.maxPerDay) : "",
  );
  const [schedulingMode, setSchedulingMode] = useState<(typeof SCHEDULING_MODES)[number]>(
    initial?.schedulingMode ?? "solo",
  );
  const [maxInviteesPerSlot, setMaxInviteesPerSlot] = useState(initial?.maxInviteesPerSlot ?? 1);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [policyAccepted, setPolicyAccepted] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!policyAccepted) {
      setError(t("policyRequiredError"));
      return;
    }

    const priceCentsInt = Math.round(priceCents * 100);
    const depositCentsInt = requireDeposit && priceCentsInt > 0 ? Math.round(depositAmount * 100) : null;
    if (depositCentsInt != null && (depositCentsInt <= 0 || depositCentsInt >= priceCentsInt)) {
      setError(t("depositTooHighError"));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        slug,
        title,
        description,
        durationMin,
        priceCents: priceCentsInt,
        depositCents: depositCentsInt,
        currency,
        locationKind,
        locationValue: locationValue || undefined,
        bufferBeforeMin,
        bufferAfterMin,
        minNoticeMin,
        maxDaysAhead,
        maxPerDay: maxPerDay ? Number(maxPerDay) : null,
        schedulingMode,
        maxInviteesPerSlot,
        isActive,
        policyAccepted,
      };

      const res = await fetch(
        isEditing ? `/api/event-types/${eventTypeId}` : "/api/event-types",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      toast.success(t("savedToast"));
      router.push("/dashboard/event-types");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label>{t("titleLabel")}</Label>
            <Tabs defaultValue={hostDefaultLocale}>
              <TabsList>
                {LOCALES.map((loc) => (
                  <TabsTrigger key={loc} value={loc}>
                    {loc.toUpperCase()}
                    {loc === hostDefaultLocale ? " *" : ""}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LOCALES.map((loc) => (
                <TabsContent key={loc} value={loc} className="flex flex-col gap-3">
                  <Input
                    value={title[loc] ?? ""}
                    required={loc === hostDefaultLocale}
                    onChange={(e) => setTitle((prev) => ({ ...prev, [loc]: e.target.value }))}
                  />
                  <Label className="-mb-2">{t("descriptionLabel")}</Label>
                  <Textarea
                    rows={2}
                    value={description[loc] ?? ""}
                    onChange={(e) =>
                      setDescription((prev) => ({ ...prev, [loc]: e.target.value }))
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">{t("slugLabel")}</Label>
            <Input
              id="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("slugHint", { hostSlug, slug: slug || "…" })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration">{t("durationLabel")}</Label>
            <Input
              id="duration"
              type="number"
              min={5}
              max={480}
              required
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">{t("priceLabel")}</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={priceCents}
              onChange={(e) => setPriceCents(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("priceHint")}</p>
          </div>
          {priceCents > 0 ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="requireDeposit"
                  checked={requireDeposit}
                  onCheckedChange={setRequireDeposit}
                />
                <Label htmlFor="requireDeposit">{t("requireDepositLabel")}</Label>
              </div>
              {requireDeposit ? (
                <>
                  <Label htmlFor="depositAmount">{t("depositAmountLabel")}</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Number(e.target.value))}
                    className="max-w-40"
                  />
                  <p className="text-xs text-muted-foreground">{t("depositHint")}</p>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">{t("currencyLabel")}</Label>
            <Input
              id="currency"
              required
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("locationKindLabel")}</Label>
            <Select value={locationKind} onValueChange={(v) => setLocationKind(v as typeof locationKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`locationKindOptions.${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="locationValue">{t("locationValueLabel")}</Label>
            <Input
              id="locationValue"
              value={locationValue}
              onChange={(e) => setLocationValue(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bufferBefore">{t("bufferBeforeLabel")}</Label>
            <Input
              id="bufferBefore"
              type="number"
              min={0}
              value={bufferBeforeMin}
              onChange={(e) => setBufferBeforeMin(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bufferAfter">{t("bufferAfterLabel")}</Label>
            <Input
              id="bufferAfter"
              type="number"
              min={0}
              value={bufferAfterMin}
              onChange={(e) => setBufferAfterMin(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minNotice">{t("minNoticeLabel")}</Label>
            <Input
              id="minNotice"
              type="number"
              min={0}
              value={minNoticeMin}
              onChange={(e) => setMinNoticeMin(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxDaysAhead">{t("maxDaysAheadLabel")}</Label>
            <Input
              id="maxDaysAhead"
              type="number"
              min={1}
              value={maxDaysAhead}
              onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxPerDay">{t("maxPerDayLabel")}</Label>
            <Input
              id="maxPerDay"
              type="number"
              min={1}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("schedulingModeLabel")}</Label>
            <Select value={schedulingMode} onValueChange={(v) => setSchedulingMode(v as typeof schedulingMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULING_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`schedulingModeOptions.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("schedulingModeHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxInviteesPerSlot">{t("maxInviteesPerSlotLabel")}</Label>
            <Input
              id="maxInviteesPerSlot"
              type="number"
              min={1}
              max={250}
              value={maxInviteesPerSlot}
              onChange={(e) => setMaxInviteesPerSlot(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("maxInviteesPerSlotHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-2">
            <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="isActive">{t("activeLabel")}</Label>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
            <input
              id="policyAccepted"
              type="checkbox"
              className="mt-0.5"
              checked={policyAccepted}
              onChange={(e) => setPolicyAccepted(e.target.checked)}
            />
            <Label htmlFor="policyAccepted" className="text-sm font-normal">
              {t("policyLabel")}{" "}
              <Link
                href={`/${hostDefaultLocale}/terms`}
                target="_blank"
                className="underline underline-offset-2"
              >
                {t("policyLinkText")}
              </Link>
            </Label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" disabled={submitting} className="w-fit">
            {submitting ? t("savingButton") : t("saveButton")}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
