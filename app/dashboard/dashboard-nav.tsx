"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CalendarCheck2, CalendarDays, Clock3, LogOut, Settings2, UsersRound } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", key: "today" as const, icon: CalendarDays },
  { href: "/dashboard/bookings", key: "bookings" as const, icon: CalendarCheck2 },
  { href: "/dashboard/event-types", key: "eventTypes" as const, icon: Clock3 },
  { href: "/dashboard/availability", key: "availability" as const, icon: CalendarDays },
  { href: "/dashboard/team", key: "team" as const, icon: UsersRound },
  { href: "/dashboard/settings", key: "settings" as const, icon: Settings2 },
];

export function DashboardNav({ hostName }: { hostName: string }) {
  const t = useTranslations("dashboard.nav");
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex shrink-0 flex-col gap-4 border-b border-border/60 px-6 py-6 md:w-56 md:border-r md:border-b-0 md:px-4">
      <Link href="/dashboard" className="flex items-center px-2">
        <Image
          src="/brand/korek-booking-logo.png"
          alt="Korek Booking"
          width={2172}
          height={724}
          className="h-8 w-auto max-w-full"
          priority
        />
      </Link>

      <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <p className="truncate px-2 text-xs text-muted-foreground">{hostName}</p>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="size-4" aria-hidden />
          {t("signOut")}
        </Button>
      </div>
    </nav>
  );
}
