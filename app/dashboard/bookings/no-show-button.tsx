"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function NoShowButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("dashboard.bookings");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/no-show`, { method: "POST" });
      if (!res.ok) {
        toast.error("Something went wrong. Please try again.");
        return;
      }
      toast.success(t("noShowToast"));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={submitting} onClick={handleClick}>
      {t("markNoShow")}
    </Button>
  );
}
