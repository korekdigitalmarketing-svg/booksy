"use client";

import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ bookingUrl }: { bookingUrl: string }) {
  const t = useTranslations("dashboard.home");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success(t("copyLinkToast"));
    } catch {
      toast.error(t("copyLinkError"));
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      <Link2 className="size-4" /> {t("copyLinkButton")}
    </Button>
  );
}
