import { defineRouting } from "next-intl/routing";

export const locales = ["en", "fr", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every public page lives under an explicit /{locale} segment, including
  // the default locale — the booking flow's locale must always be visible
  // and shareable in the URL, never implicit.
  localePrefix: "always",
  localeCookie: {
    name: "NEXT_LOCALE",
  },
});
