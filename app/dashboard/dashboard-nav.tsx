"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard", key: "today" as const },
  { href: "/dashboard/bookings", key: "bookings" as const },
  { href: "/dashboard/event-types", key: "eventTypes" as const },
  { href: "/dashboard/availability", key: "availability" as const },
  { href: "/dashboard/settings", key: "settings" as const },
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
        <Image src="/brand/booksy-logo.png" alt="Booksy" width={1699} height={926} className="h-7 w-auto" />
      </Link>

      <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <p className="truncate px-2 text-xs text-muted-foreground">{hostName}</p>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          {t("signOut")}
        </Button>
      </div>
    </nav>
  );
}
