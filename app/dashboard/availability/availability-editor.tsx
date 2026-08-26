"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardAvailabilityRule, DashboardDateOverride } from "@/lib/dashboard-data";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Window {
  startTime: string;
  endTime: string;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildCalendarDays(monthDate: Date) {
  const monthStart = startOfMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function formatWindow(window: Window) {
  return `${window.startTime}-${window.endTime}`;
}

function groupByWeekday(rules: DashboardAvailabilityRule[]): Record<number, Window[]> {
  const grouped: Record<number, Window[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of rules) {
    grouped[r.weekday].push({ startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) });
  }
  return grouped;
}

export function AvailabilityEditor({
  initialRules,
  initialOverrides,
}: {
  initialRules: DashboardAvailabilityRule[];
  initialOverrides: DashboardDateOverride[];
}) {
  const t = useTranslations("dashboard.availability");
  const locale = useLocale();
  const router = useRouter();
  const todayKey = toDateKey(new Date());

  const [weekly, setWeekly] = useState<Record<number, Window[]>>(() => groupByWeekday(initialRules));
  const [savingWeekly, setSavingWeekly] = useState(false);

  const [overrides, setOverrides] = useState(initialOverrides);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [newDate, setNewDate] = useState(todayKey);
  const [newClosed, setNewClosed] = useState(true);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [addingOverride, setAddingOverride] = useState(false);

  const overrideByDate = overrides.reduce<Record<string, DashboardDateOverride[]>>((grouped, override) => {
    grouped[override.theDate] = [...(grouped[override.theDate] ?? []), override];
    return grouped;
  }, {});
  const calendarDays = buildCalendarDays(monthDate);
  const selectedOverrides = overrideByDate[selectedDate] ?? [];
  const selectedWeeklyWindows = weekly[fromDateKey(selectedDate).getDay()] ?? [];
  const selectedDateLabel = fromDateKey(selectedDate).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const monthLabel = monthDate.toLocaleDateString(locale, { month: "long", year: "numeric" });

  function addWindow(day: number) {
    setWeekly((prev) => ({ ...prev, [day]: [...prev[day], { startTime: "09:00", endTime: "17:00" }] }));
  }
  function removeWindow(day: number, index: number) {
    setWeekly((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== index) }));
  }
  function updateWindow(day: number, index: number, field: keyof Window, value: string) {
    setWeekly((prev) => ({
      ...prev,
      [day]: prev[day].map((w, i) => (i === index ? { ...w, [field]: value } : w)),
    }));
  }
  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setNewDate(dateKey);
  }
  function updateNewDate(dateKey: string) {
    setNewDate(dateKey);
    if (dateKey) {
      setSelectedDate(dateKey);
      setMonthDate(startOfMonth(fromDateKey(dateKey)));
    }
  }

  async function saveWeekly() {
    const hasOverlap = WEEKDAYS.some((day) => {
      const windows = [...weekly[day]].sort((a, b) => a.startTime.localeCompare(b.startTime));
      return windows.some((window, index) =>
        window.endTime <= window.startTime ||
        (index > 0 && window.startTime < windows[index - 1].endTime),
      );
    });
    if (hasOverlap) {
      toast.error(t("overlapError"));
      return;
    }

    setSavingWeekly(true);
    try {
      const rules = WEEKDAYS.flatMap((day) =>
        weekly[day].map((w) => ({ weekday: day, startTime: w.startTime, endTime: w.endTime })),
      );
      const res = await fetch("/api/availability/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) {
        toast.error("Something went wrong. Please try again.");
        return;
      }
      toast.success(t("savedToast"));
      router.refresh();
    } finally {
      setSavingWeekly(false);
    }
  }

  async function addOverride() {
    if (!newDate) return;
    setAddingOverride(true);
    try {
      const res = await fetch("/api/date-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theDate: newDate,
          isClosed: newClosed,
          startTime: newClosed ? undefined : newStart,
          endTime: newClosed ? undefined : newEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setOverrides((prev) =>
        [
          ...prev.filter((override) =>
            override.theDate !== newDate || (!newClosed && !override.isClosed),
          ),
          {
            id: data.id,
            theDate: newDate,
            isClosed: newClosed,
            startTime: newClosed ? null : newStart,
            endTime: newClosed ? null : newEnd,
          },
        ].sort((a, b) => a.theDate.localeCompare(b.theDate)),
      );
      setNewDate("");
    } finally {
      setAddingOverride(false);
    }
  }

  async function removeOverride(id: string) {
    const previous = overrides;
    setOverrides((prev) => prev.filter((o) => o.id !== id));
    const res = await fetch(`/api/date-overrides/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setOverrides(previous);
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("weeklyHeading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t(`weekdays.${day}` as `weekdays.${number}`)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => addWindow(day)}>
                  <Plus aria-hidden />
                  {t("addWindow")}
                </Button>
              </div>
              {weekly[day].length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("closedLabel")}</p>
              ) : (
                weekly[day].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={w.startTime}
                      onChange={(e) => updateWindow(day, i, "startTime", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={w.endTime}
                      onChange={(e) => updateWindow(day, i, "endTime", e.target.value)}
                      className="w-32"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeWindow(day, i)}>
                      <Trash2 aria-hidden />
                      <span className="sr-only">{t("removeWindow")}</span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          ))}
          <Button type="button" onClick={saveWeekly} disabled={savingWeekly} className="w-fit">
            <Save aria-hidden />
            {savingWeekly ? t("savingButton") : t("saveButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("calendarHeading")}</CardTitle>
          <CardDescription>{t("calendarDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setMonthDate((current) => addMonths(current, -1))}
              >
                <ChevronLeft aria-hidden />
                <span className="sr-only">{t("previousMonth")}</span>
              </Button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="size-4 text-primary" aria-hidden />
                <span>{monthLabel}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setMonthDate((current) => addMonths(current, 1))}
              >
                <ChevronRight aria-hidden />
                <span className="sr-only">{t("nextMonth")}</span>
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <span key={day}>{t(`weekdayShort.${day}` as `weekdayShort.${number}`)}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date) => {
                const dateKey = toDateKey(date);
                const dayOverrides = overrideByDate[dateKey] ?? [];
                const isClosedOverride = dayOverrides.some((override) => override.isClosed);
                const hasCustomHours = dayOverrides.some((override) => !override.isClosed);
                const weeklyWindows = weekly[date.getDay()] ?? [];
                const isWeeklyOpen = weeklyWindows.length > 0;
                const isCurrentMonth = date.getMonth() === monthDate.getMonth();
                const isSelected = dateKey === selectedDate;
                const label = isClosedOverride
                  ? t("closedShort")
                  : hasCustomHours
                    ? t("customShort")
                    : isWeeklyOpen
                      ? t("weeklyShort")
                      : t("closedShort");

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => selectDate(dateKey)}
                    className={cn(
                      "flex aspect-square min-h-14 flex-col items-start justify-between rounded-lg border p-1.5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px sm:min-h-20 sm:p-2",
                      isSelected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background",
                      !isCurrentMonth && "opacity-45",
                    )}
                  >
                    <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
                    <span
                      className={cn(
                        "max-w-full truncate rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
                        isClosedOverride || (!hasCustomHours && !isWeeklyOpen)
                          ? "bg-muted text-muted-foreground"
                          : hasCustomHours
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-900",
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                {t("legendWeekly")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                {t("legendCustom")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
                {t("legendClosed")}
              </span>
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-muted/40 p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("selectedDateLabel")}</p>
              <h3 className="font-heading text-base font-semibold">{selectedDateLabel}</h3>
            </div>
            <div className="rounded-lg bg-background p-3 ring-1 ring-border">
              <p className="text-xs font-medium text-muted-foreground">{t("visibleHoursLabel")}</p>
              {selectedOverrides.some((override) => override.isClosed) ? (
                <p className="mt-1 text-sm font-medium">{t("overrideClosedLabel")}</p>
              ) : selectedOverrides.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedOverrides.map((override) => (
                    <span key={override.id} className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                      {override.startTime?.slice(0, 5)}-{override.endTime?.slice(0, 5)}
                    </span>
                  ))}
                </div>
              ) : selectedWeeklyWindows.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedWeeklyWindows.map((window, index) => (
                    <span key={index} className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900">
                      {formatWindow(window)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm font-medium">{t("closedLabel")}</p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Input type="date" value={newDate} onChange={(e) => updateNewDate(e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newClosed}
                  onChange={(e) => setNewClosed(e.target.checked)}
                />
                {t("overrideClosedLabel")}
              </label>
              {!newClosed && (
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                  <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                </div>
              )}
              <Button type="button" size="sm" disabled={!newDate || addingOverride} onClick={addOverride}>
                <Plus aria-hidden />
                {t("addOverride")}
              </Button>
            </div>
          </aside>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("overridesHeading")}</CardTitle>
          <CardDescription>{t("overridesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">

          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span className="text-sm">
                {o.theDate} —{" "}
                {o.isClosed ? t("overrideClosedLabel") : `${o.startTime?.slice(0, 5)}–${o.endTime?.slice(0, 5)}`}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeOverride(o.id)}>
                <Trash2 aria-hidden />
                <span className="sr-only">{t("removeOverride")}</span>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
