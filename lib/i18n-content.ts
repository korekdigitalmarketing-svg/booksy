import { routing } from "@/i18n/routing";

// Host-authored JSONB content (event_types.title/description) stores one
// entry per locale, e.g. {"en":"Consultation","fr":"Consultation"}. Only
// the host's own default locale is required at write time — this resolves
// requested → host default → first available, so a page NEVER renders
// undefined or a blank heading even when a translation is missing
// (acceptance test: "An event type with only a French title renders on
// the English page using the French fallback").
export function getLocalized(
  field: Record<string, string> | null | undefined,
  requestedLocale: string,
  hostDefaultLocale: string,
): string {
  if (!field) return "";
  if (field[requestedLocale]) return field[requestedLocale];
  if (field[hostDefaultLocale]) return field[hostDefaultLocale];

  for (const locale of routing.locales) {
    if (field[locale]) return field[locale];
  }

  const firstValue = Object.values(field)[0];
  return firstValue ?? "";
}
