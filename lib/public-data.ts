import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Server Component-only reads for the public booking surface. profiles/
// event_types carry no anon RLS policy at all (section 4), so these go
// through the service client — but every select list here is deliberately
// narrow: host identity + scheduling config only, never invitee data
// (that lives on bookings, which this module never touches).

export interface PublicHost {
  id: string;
  fullName: string;
  slug: string;
  timezone: string;
  locale: string;
  avatarUrl: string | null;
  brandColor: string | null;
}

export interface PublicEventType {
  id: string;
  slug: string;
  title: Record<string, string>;
  description: Record<string, string>;
  durationMin: number;
  priceCents: number;
  currency: string;
  requiresPayment: boolean;
  locationKind: "video" | "phone" | "in_person" | "custom";
  maxDaysAhead: number;
}

export interface PublicQuestion {
  id: string;
  label: Record<string, string>;
  questionType: "text" | "select";
  options: string[];
  isRequired: boolean;
}

export async function getHostBySlug(hostSlug: string): Promise<PublicHost | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, slug, timezone, locale, avatar_url, brand_color")
    .eq("slug", hostSlug)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    slug: data.slug,
    timezone: data.timezone,
    locale: data.locale,
    avatarUrl: data.avatar_url,
    brandColor: data.brand_color,
  };
}

export async function getActiveEventTypes(ownerId: string): Promise<PublicEventType[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("event_types")
    .select(
      "id, slug, title, description, duration_min, price_cents, currency, requires_payment, location_kind, max_days_ahead",
    )
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((et) => ({
    id: et.id,
    slug: et.slug,
    title: (et.title ?? {}) as Record<string, string>,
    description: (et.description ?? {}) as Record<string, string>,
    durationMin: et.duration_min,
    priceCents: et.price_cents,
    currency: et.currency,
    requiresPayment: et.requires_payment ?? et.price_cents > 0,
    locationKind: et.location_kind,
    maxDaysAhead: et.max_days_ahead,
  }));
}

export async function getActiveEventTypeBySlug(
  ownerId: string,
  eventSlug: string,
): Promise<PublicEventType | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("event_types")
    .select(
      "id, slug, title, description, duration_min, price_cents, currency, requires_payment, location_kind, max_days_ahead",
    )
    .eq("owner_id", ownerId)
    .eq("slug", eventSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    slug: data.slug,
    title: (data.title ?? {}) as Record<string, string>,
    description: (data.description ?? {}) as Record<string, string>,
    durationMin: data.duration_min,
    priceCents: data.price_cents,
    currency: data.currency,
    requiresPayment: data.requires_payment ?? data.price_cents > 0,
    locationKind: data.location_kind,
    maxDaysAhead: data.max_days_ahead,
  };
}

// event_type_questions carries no anon RLS policy either (owner-only, same
// as event_types) — same service-client pattern as everything else here.
export async function getEventTypeQuestions(eventTypeId: string): Promise<PublicQuestion[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("event_type_questions")
    .select("id, label, question_type, options, is_required")
    .eq("event_type_id", eventTypeId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return data.map((q) => ({
    id: q.id,
    label: (q.label ?? {}) as Record<string, string>,
    questionType: q.question_type as "text" | "select",
    options: (q.options ?? []) as string[],
    isRequired: q.is_required,
  }));
}
