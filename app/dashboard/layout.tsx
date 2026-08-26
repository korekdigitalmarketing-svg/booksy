import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { requireHostProfile } from "@/lib/dashboard-data";
import { DashboardNav } from "./dashboard-nav";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard | Korek Booking",
  description: "Manage appointments, availability, event types, and team scheduling.",
};

// A third independent root layout (own <html>/<body>, alongside
// app/[locale]/layout.tsx and app/login/layout.tsx) — /dashboard's
// language is the signed-in host's own profiles.locale, never a URL
// segment, so it can't share the [locale] tree's routing.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireHostProfile();

  // Sets the locale this request's getTranslations()/getMessages() calls
  // resolve to — the same mechanism app/[locale]/layout.tsx uses via the
  // URL param, just fed from the database instead.
  setRequestLocale(profile.locale);
  const messages = await getMessages();

  return (
    <html
      lang={profile.locale}
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <NextIntlClientProvider locale={profile.locale} messages={messages}>
          <div className="flex min-h-full flex-col md:flex-row">
            <DashboardNav hostName={profile.fullName} />
            <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
          </div>
          <Toaster position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
