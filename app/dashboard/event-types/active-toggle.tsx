"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function ActiveToggle({ eventTypeId, initialActive }: { eventTypeId: string; initialActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);

  async function handleChange() {
    setPending(true);
    const previous = active;
    setActive(!previous);
    try {
      const res = await fetch(`/api/event-types/${eventTypeId}/toggle-active`, { method: "POST" });
      if (!res.ok) {
        setActive(previous);
        toast.error("Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return <Switch checked={active} disabled={pending} onCheckedChange={handleChange} />;
}
