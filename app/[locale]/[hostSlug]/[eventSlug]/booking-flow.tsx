"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import { enUS, fr, es } from "date-fns/locale";
import type { Locale } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getLocalized } from "@/lib/i18n-content";
import {
  dateKeyInZone,
  formatCurrency,
  formatSlotTime,
  formatSlotWeekdayDate,
  guessTimezone,
} from "@/lib/format";
import type { PublicEventType, PublicQuestion } from "@/lib/public-data";
import { ApiErrorCode } from "@/lib/api-errors";

interface BookingFlowProps {
  locale: string;
  hostSlug: string;
  host: { fullName: string; timezone: string; locale: string };
  eventType: PublicEventType;
  questions: PublicQuestion[];
}

function toDateKey(date: Date): string {
  // Extracted from the LOCAL calendar components the widget actually
  // displays — never a UTC conversion, which could silently shift the
  // date a day in either direction.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, fr, es };

interface ConfirmedBooking {
  id: string;
  startsAt: string;
  endsAt: string;
}

export function BookingFlow({ locale, hostSlug, host, eventType, questions }: BookingFlowProps) {
  const t = useTranslations("booking");
  const tCommon = useTranslations("common");

  const title = getLocalized(eventType.title, locale, host.locale);
  const description = getLocalized(eventType.description, locale, host.locale);
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? enUS;
  const isDeposit = eventType.requiresPayment && eventType.depositCents != null;
  const dueNowCents = isDeposit ? (eventType.depositCents as number) : eventType.priceCents;

  const [timezone, setTimezone] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [month, setMonth] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // null = "haven't checked this month yet" — kept distinct from an empty
  // Set (checked, genuinely nothing available) so the calendar doesn't
  // flash every day as unavailable while the fetch for a newly-navigated
  // month is still in flight.
  const [availableDays, setAvailableDays] = useState<Set<string> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  // Client-only values (real timezone, "today") are set post-mount so the
  // server-rendered HTML and the first client render match exactly —
  // setting these during the initial render risks a hydration mismatch
  // whenever the server and visitor aren't in the same timezone/instant.
  // Wrapped in startTransition so the sync-in-effect isn't an urgent,
  // render-blocking update.
  useEffect(() => {
    startTransition(() => {
      const now = new Date();
      setTimezone(guessTimezone());
      setSelectedDate(now);
      setMonth(now);
    });
  }, []);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [timezone ?? "UTC"];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSlots = useCallback(
    async (date: Date, tz: string) => {
      setSlotsLoading(true);
      setSelectedSlot(null);
      try {
        const dateKey = toDateKey(date);
        const res = await fetch(
          `/api/slots?eventTypeId=${eventType.id}&from=${dateKey}&to=${dateKey}&timezone=${encodeURIComponent(tz)}`,
        );
        const data = await res.json();
        setSlots(res.ok ? (data.slots ?? []) : []);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [eventType.id],
  );

  useEffect(() => {
    if (!timezone || !selectedDate) return;
    startTransition(() => {
      fetchSlots(selectedDate, timezone);
    });
  }, [timezone, selectedDate, fetchSlots]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + eventType.maxDaysAhead);
    return d;
  }, [today, eventType.maxDaysAhead]);

  // Powers the calendar's own day-by-day available/unavailable styling
  // below, so a visitor sees at a glance which days are worth clicking
  // instead of having to click through each one to find out.
  const fetchMonthAvailability = useCallback(
    async (monthDate: Date, tz: string) => {
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      const rangeStart = monthStart < today ? today : monthStart;
      const rangeEnd = monthEnd > maxDate ? maxDate : monthEnd;

      // The visible month falls entirely outside the bookable window
      // (e.g. navigated past maxDaysAhead) — nothing to query.
      if (rangeStart > rangeEnd) {
        setAvailableDays(new Set());
        return;
      }

      setAvailableDays(null);
      try {
        const from = toDateKey(rangeStart);
        const to = toDateKey(rangeEnd);
        const res = await fetch(
          `/api/slots?eventTypeId=${eventType.id}&from=${from}&to=${to}&timezone=${encodeURIComponent(tz)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setAvailableDays(new Set());
          return;
        }
        // Bucketed by each slot's calendar day IN `tz` — matching how
        // /api/slots itself interprets fromDate/toDate as visitor-local
        // calendar days, not the browser's own timezone.
        const days = new Set<string>(
          ((data.slots ?? []) as string[]).map((iso) => dateKeyInZone(iso, tz)),
        );
        setAvailableDays(days);
      } catch {
        setAvailableDays(new Set());
      }
    },
    [eventType.id, today, maxDate],
  );

  useEffect(() => {
    if (!timezone || !month) return;
    startTransition(() => {
      fetchMonthAvailability(month, timezone);
    });
  }, [timezone, month, fetchMonthAvailability]);

  const isDayUnavailable = useCallback(
    (date: Date) => {
      if (!availableDays) return false; // not yet known — don't disable pre-emptively
      return !availableDays.has(toDateKey(date));
    },
    [availableDays],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !timezone) return;

    const missingRequired = questions.some(
      (q) => q.isRequired && !(customAnswers[q.id] ?? "").trim(),
    );
    if (missingRequired) {
      toast.error(t("form.requiredQuestion"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: eventType.id,
          slot: selectedSlot,
          timezone,
          locale,
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          customAnswers,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const code: string = data?.error?.code ?? ApiErrorCode.INTERNAL_ERROR;
        toast.error(t(`errors.${code}`));
        if (code === ApiErrorCode.SLOT_TAKEN || code === ApiErrorCode.SLOT_UNAVAILABLE) {
          if (selectedDate && timezone) fetchSlots(selectedDate, timezone);
        }
        return;
      }

      if (data.checkoutUrl) {
        // `finally` below still flips submitting back off, so track the
        // redirect separately — the button stays disabled (via
        // `redirecting`) through the handoff to Stripe instead of
        // flashing back to enabled just before navigation.
        setRedirecting(true);
        window.location.href = data.checkoutUrl;
        return;
      }

      toast.success(t("toast.confirmed"));
      setConfirmed(data.booking);
    } catch {
      toast.error(t("errors.INTERNAL_ERROR"));
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <CheckCircle2 className="size-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-heading font-semibold tracking-tight">
          {t("toast.confirmed")}
        </h1>
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {formatSlotTime(confirmed.startsAt, timezone ?? host.timezone, locale)}
        </p>
        <p className="text-muted-foreground">
          {formatSlotWeekdayDate(confirmed.startsAt, timezone ?? host.timezone, locale)}
        </p>
        <Link href={`/${hostSlug}`} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          {tCommon("back")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <Link
        href={`/${hostSlug}`}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← {t("backToHost", { hostName: host.fullName })}
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
        <div className="flex items-center gap-2 pt-1">
          <Badge variant="outline">{t("duration", { minutes: eventType.durationMin })}</Badge>
          <Badge variant={eventType.requiresPayment ? "default" : "secondary"}>
            {eventType.requiresPayment
              ? isDeposit
                ? t("depositBadge", {
                    deposit: formatCurrency(dueNowCents, eventType.currency, locale),
                    total: formatCurrency(eventType.priceCents, eventType.currency, locale),
                  })
                : formatCurrency(eventType.priceCents, eventType.currency, locale)
              : t("free")}
          </Badge>
        </div>
      </div>

      <Separator />

      <div className="grid gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {t("selectDate")}
            </h2>
            <Calendar
              mode="single"
              locale={dateFnsLocale}
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={month}
              onMonthChange={setMonth}
              disabled={[{ before: today, after: maxDate }, isDayUnavailable]}
              className="rounded-lg border"
            />
            {availableDays === null ? (
              <p className="text-xs text-muted-foreground">{t("loadingSlots")}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">{t("timezoneLabel")}</Label>
            {timezone ? (
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone" className="w-full">
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
            ) : (
              <Skeleton className="h-9 w-full" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">{t("availableTimes")}</h2>

          {!timezone || slotsLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSlotsForDay")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((iso) => (
                <Button
                  key={iso}
                  type="button"
                  variant={selectedSlot === iso ? "default" : "outline"}
                  className="font-mono tabular-nums"
                  onClick={() => setSelectedSlot(iso)}
                >
                  {formatSlotTime(iso, timezone, locale)}
                </Button>
              ))}
            </div>
          )}

          {!selectedSlot ? (
            <p className="text-sm text-muted-foreground">{t("chooseATime")}</p>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="flex flex-col gap-4 border-b border-dashed border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("youSelected")}
                  </p>
                  <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                    {formatSlotTime(selectedSlot, timezone as string, locale)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatSlotWeekdayDate(selectedSlot, timezone as string, locale)} ·{" "}
                    {timezone}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {isDeposit ? t("depositDueNowLabel") : t("priceLabel")}
                  </p>
                  <p className="font-mono text-xl font-semibold">
                    {eventType.requiresPayment
                      ? formatCurrency(dueNowCents, eventType.currency, locale)
                      : t("free")}
                  </p>
                  {isDeposit ? (
                    <p className="text-xs text-muted-foreground">
                      {t("depositTotalLabel", {
                        total: formatCurrency(eventType.priceCents, eventType.currency, locale),
                      })}
                    </p>
                  ) : null}
                </div>
              </CardContent>

              <CardContent className="flex flex-col gap-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  {isDeposit
                    ? t("whatHappensNextDeposit", {
                        balance: formatCurrency(
                          eventType.priceCents - dueNowCents,
                          eventType.currency,
                          locale,
                        ),
                      })
                    : eventType.requiresPayment
                      ? t("whatHappensNextPaid")
                      : t("whatHappensNextFree")}
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">{t("form.name")}</Label>
                    <Input
                      id="name"
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">{t("form.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phone">{t("form.phone")}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notes">{t("form.notes")}</Label>
                    <Textarea
                      id="notes"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                  {questions.map((q) => {
                    const questionLabel = getLocalized(q.label, locale, host.locale);
                    return (
                      <div key={q.id} className="flex flex-col gap-1.5">
                        <Label htmlFor={`question-${q.id}`}>
                          {questionLabel}
                          {q.isRequired ? null : ` (${t("form.optional")})`}
                        </Label>
                        {q.questionType === "select" ? (
                          // value is deliberately left `undefined` (never
                          // "") when unanswered: Base UI/Radix Select
                          // reserves the empty string as its own internal
                          // "nothing selected" sentinel, so a controlled ""
                          // value silently breaks committing a real
                          // selection afterwards.
                          <Select
                            value={customAnswers[q.id]}
                            onValueChange={(v) =>
                              setCustomAnswers((prev) => ({ ...prev, [q.id]: v ?? "" }))
                            }
                          >
                            <SelectTrigger id={`question-${q.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {q.options.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            id={`question-${q.id}`}
                            required={q.isRequired}
                            value={customAnswers[q.id] ?? ""}
                            onChange={(e) =>
                              setCustomAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                  <Button type="submit" disabled={submitting || redirecting}>
                    {redirecting
                      ? t("form.redirecting")
                      : submitting
                        ? t("form.submitting")
                        : eventType.requiresPayment
                          ? t("form.continueToPayment")
                          : t("form.submit")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
