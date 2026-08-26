import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "../globals.css";

// A separate root layout (own <html>/<body>) — /login is host-only utility
// UI outside the trilingual public surface (no host identity is known yet
// to pick a locale from), and outside /dashboard's profile-locale scheme
// too. Plain English is a deliberate, narrow scope call for this one
// pre-authentication screen.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sign in | Korek Booking",
  description: "Sign in to manage your Korek Booking schedule.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
