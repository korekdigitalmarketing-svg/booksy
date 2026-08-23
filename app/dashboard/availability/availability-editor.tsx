"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardAvailabilityRule, DashboardDateOverride } from "@/lib/dashboard-data";

interface Window {
  startTime: string;
  endTime: string;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

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
  const router = useRouter();

  const [weekly, setWeekly] = useState<Record<number, Window[]>>(() => groupByWeekday(initialRules));
  const [savingWeekly, setSavingWeekly] = useState(false);

  const [overrides, setOverrides] = useState(initialOverrides);
  const [newDate, setNewDate] = useState("");
  const [newClosed, setNewClosed] = useState(true);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [addingOverride, setAddingOverride] = useState(false);

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

  async function saveWeekly() {
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
          ...prev,
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
        <CardContent className="flex flex-col gap-4 pt-6">
          <h2 className="font-heading text-lg font-semibold">{t("weeklyHeading")}</h2>
          {WEEKDAYS.map((day) => (
            <div key={day} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t(`weekdays.${day}` as `weekdays.${number}`)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => addWindow(day)}>
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
                      {t("removeWindow")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          ))}
          <Button type="button" onClick={saveWeekly} disabled={savingWeekly} className="w-fit">
            {savingWeekly ? t("savingButton") : t("saveButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div>
            <h2 className="font-heading text-lg font-semibold">{t("overridesHeading")}</h2>
            <p className="text-sm text-muted-foreground">{t("overridesDescription")}</p>
          </div>

          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
              <span className="text-sm">
                {o.theDate} —{" "}
                {o.isClosed ? t("overrideClosedLabel") : `${o.startTime?.slice(0, 5)}–${o.endTime?.slice(0, 5)}`}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeOverride(o.id)}>
                {t("removeOverride")}
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={newClosed}
                onChange={(e) => setNewClosed(e.target.checked)}
              />
              {t("overrideClosedLabel")}
            </label>
            {!newClosed && (
              <>
                <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-28" />
                <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-28" />
              </>
            )}
            <Button type="button" size="sm" disabled={!newDate || addingOverride} onClick={addOverride}>
              {t("addOverride")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
