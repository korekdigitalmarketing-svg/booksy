"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { enUS, fr, es } from "date-fns/locale";
import type { Locale } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSlotTime, guessTimezone } from "@/lib/format";

const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, fr, es };

function toDateKey(date: Date): string {
  // Extracted from the LOCAL calendar components, same as the original
  // booking flow this was pulled out of — never a UTC conversion, which
  // could silently shift the date a day in either direction.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface SlotPickerProps {
  eventTypeId: string;
  locale: string;
  maxDaysAhead: number;
  selectedSlot: string | null;
  /** Called with both the picked slot and the timezone it was picked in —
   *  the reschedule/booking APIs need both together. */
  onSelectSlot: (iso: string, timezone: string) => void;
}

/** The date + timezone + slot-grid picker shared by the public booking flow,
 *  the host's reschedule dialog, and the client's manage-booking page —
 *  callers own everything around it (the form fields, the submit action). */
export function SlotPicker({
  eventTypeId,
  locale,
  maxDaysAhead,
  selectedSlot,
  onSelectSlot,
}: SlotPickerProps) {
  const t = useTranslations("booking");
  const dateFnsLocale = DATE_FNS_LOCALES[locale] ?? enUS;

  const [timezone, setTimezone] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setTimezone(guessTimezone());
      setSelectedDate(new Date());
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
      try {
        const dateKey = toDateKey(date);
        const res = await fetch(
          `/api/slots?eventTypeId=${eventTypeId}&from=${dateKey}&to=${dateKey}&timezone=${encodeURIComponent(tz)}`,
        );
        const data = await res.json();
        setSlots(res.ok ? (data.slots ?? []) : []);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [eventTypeId],
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
    d.setDate(d.getDate() + maxDaysAhead);
    return d;
  }, [today, maxDaysAhead]);

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col gap-4">
        <Calendar
          mode="single"
          locale={dateFnsLocale}
          selected={selectedDate}
          onSelect={setSelectedDate}
          disabled={{ before: today, after: maxDate }}
          className="rounded-lg border"
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-picker-timezone">{t("timezoneLabel")}</Label>
          {timezone ? (
            <Select value={timezone} onValueChange={(tz) => tz && setTimezone(tz)}>
              <SelectTrigger id="slot-picker-timezone" className="w-full">
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

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t("availableTimes")}</h3>
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
                onClick={() => onSelectSlot(iso, timezone as string)}
              >
                {formatSlotTime(iso, timezone, locale)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
