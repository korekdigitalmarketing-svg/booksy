import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/supabase/types";

// Dashboard reads go through the session-scoped (anon-key + cookie)
// client, never the service client — RLS's `owner_id = auth.uid()` policy
// is what actually scopes every query to "this host's own rows" here,
// exactly as section 4 intends ("this policy is what the HOST dashboard
// reads through").

export interface DashboardProfile {
  id: string;
  fullName: string;
  email: string;
  slug: string;
  timezone: string;
  locale: string;
  avatarUrl: string | null;
  brandColor: string | null;
  onboardingCompleted: boolean;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "host";
}

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  slug: string;
  timezone: string;
  locale: string;
  avatar_url: string | null;
  brand_color: string | null;
  onboarding_completed: boolean;
};

/** Every new auth user lands here with no `profiles` row yet — there's no
 * separate sign-up form, so the first successful login IS the sign-up.
 * Runs under the user's own session: RLS's `profiles_owner_all` policy
 * (`id = auth.uid()`) is what actually authorizes the insert, not a
 * service-role bypass. Retries the slug on a uniqueness collision rather
 * than failing the user's very first login over a taken email-derived slug. */
async function createDefaultProfile(
  supabase: SupabaseClient<Database>,
  user: User,
): Promise<ProfileRow> {
  const email = user.email ?? "";
  const localPart = email.split("@")[0] || "host";
  const baseSlug = slugify(localPart);
  const fullName = localPart.charAt(0).toUpperCase() + localPart.slice(1);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: user.id, full_name: fullName, email, slug })
      .select("id, full_name, email, slug, timezone, locale, avatar_url, brand_color, onboarding_completed")
      .single();

    if (!error) return data;
    if (error.code !== "23505") throw new Error(`Failed to create profile: ${error.message}`);
    // 23505 = unique_violation on the slug — another host already has it, retry with a suffix.
  }
  throw new Error("Failed to create profile: slug collisions exhausted retries");
}

/** Fetches the signed-in host's own profile — creating one on first login
 * — or redirects to /login. The proxy already gates unauthenticated
 * requests, but a session can expire between the gate and this read, so
 * the user check here is a real check, not a formality. */
export async function requireHostProfile(): Promise<DashboardProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: existing, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, slug, timezone, locale, avatar_url, brand_color, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (error) redirect("/login");

  const profile = existing ?? (await createDefaultProfile(supabase, user));

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    slug: profile.slug,
    timezone: profile.timezone,
    locale: profile.locale,
    avatarUrl: profile.avatar_url,
    brandColor: profile.brand_color,
    onboardingCompleted: profile.onboarding_completed,
  };
}

export interface DashboardBooking {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  inviteeName: string;
  inviteeEmail: string;
  eventTitle: string;
  eventTypeId: string;
  maxDaysAhead: number;
  amountCents: number;
  totalPriceCents: number;
  currency: string;
}

/**
 * Fetches this host's bookings and resolves each one's event-type title —
 * a separate query rather than an embedded `event_types(title)` select,
 * matching the two-step pattern used elsewhere in this codebase (see
 * app/api/slots/route.ts) rather than depending on supabase-js's embedded
 * relation type inference.
 */
async function attachEventTitles(
  bookings: Array<{
    id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    invitee_name: string;
    invitee_email: string;
    amount_cents: number;
    total_price_cents: number;
    currency: string;
    event_type_id: string;
  }>,
  locale: string,
): Promise<DashboardBooking[]> {
  if (bookings.length === 0) return [];
  const supabase = await createClient();
  const eventTypeIds = [...new Set(bookings.map((b) => b.event_type_id))];
  const { data: eventTypes } = await supabase
    .from("event_types")
    .select("id, title, max_days_ahead")
    .in("id", eventTypeIds);

  const titleById = new Map<string, Record<string, string>>();
  const maxDaysAheadById = new Map<string, number>();
  for (const et of eventTypes ?? []) {
    titleById.set(et.id, (et.title ?? {}) as Record<string, string>);
    maxDaysAheadById.set(et.id, et.max_days_ahead);
  }

  return bookings.map((b) => {
    const titleMap = titleById.get(b.event_type_id) ?? {};
    const eventTitle = titleMap[locale] ?? titleMap[Object.keys(titleMap)[0]] ?? "";
    return {
      id: b.id,
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      inviteeName: b.invitee_name,
      inviteeEmail: b.invitee_email,
      eventTitle,
      eventTypeId: b.event_type_id,
      maxDaysAhead: maxDaysAheadById.get(b.event_type_id) ?? 60,
      amountCents: b.amount_cents,
      totalPriceCents: b.total_price_cents,
      currency: b.currency,
    };
  });
}

/** Live (confirmed/pending) bookings from now onward, for the "Today &
 * upcoming" dashboard home. */
export async function getUpcomingBookings(locale: string): Promise<DashboardBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, invitee_name, invitee_email, amount_cents, total_price_cents, currency, event_type_id",
    )
    .in("status", ["confirmed", "pending_payment"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error || !data) return [];
  return attachEventTitles(data, locale);
}

export interface DashboardStats {
  totalConfirmed: number;
}

/** All-time count of confirmed bookings (past + future), for the dashboard
 * home's stats row. A separate `count`-only query rather than reusing
 * getUpcomingBookings/getBookingsList — those fetch full rows and are
 * scoped to a time window, neither of which this needs. */
export async function getBookingsStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed");

  if (error) return { totalConfirmed: 0 };
  return { totalConfirmed: count ?? 0 };
}

export type BookingFilter = "upcoming" | "past" | "all";

/** The full bookings list, for /dashboard/bookings. */
export async function getBookingsList(
  locale: string,
  filter: BookingFilter,
): Promise<DashboardBooking[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, invitee_name, invitee_email, amount_cents, total_price_cents, currency, event_type_id",
    );

  const now = new Date().toISOString();
  if (filter === "upcoming") {
    query = query.gte("starts_at", now).order("starts_at", { ascending: true });
  } else if (filter === "past") {
    query = query.lt("starts_at", now).order("starts_at", { ascending: false });
  } else {
    query = query.order("starts_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return attachEventTitles(data, locale);
}

export interface DashboardEventType {
  id: string;
  slug: string;
  title: Record<string, string>;
  description: Record<string, string>;
  durationMin: number;
  slotIncrementMin: number;
  priceCents: number;
  depositCents: number | null;
  currency: string;
  locationKind: "video" | "phone" | "in_person" | "custom";
  locationValue: string | null;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  maxPerDay: number | null;
  isActive: boolean;
}

export async function getEventTypesList(): Promise<DashboardEventType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .select(
      "id, slug, title, description, duration_min, slot_increment_min, price_cents, deposit_cents, currency, location_kind, location_value, buffer_before_min, buffer_after_min, min_notice_min, max_days_ahead, max_per_day, is_active",
    )
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data.map(mapEventType);
}

export async function getEventTypeById(id: string): Promise<DashboardEventType | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .select(
      "id, slug, title, description, duration_min, slot_increment_min, price_cents, deposit_cents, currency, location_kind, location_value, buffer_before_min, buffer_after_min, min_notice_min, max_days_ahead, max_per_day, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapEventType(data);
}

function mapEventType(et: {
  id: string;
  slug: string;
  title: unknown;
  description: unknown;
  duration_min: number;
  slot_increment_min: number;
  price_cents: number;
  deposit_cents: number | null;
  currency: string;
  location_kind: string;
  location_value: string | null;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  max_days_ahead: number;
  max_per_day: number | null;
  is_active: boolean;
}): DashboardEventType {
  return {
    id: et.id,
    slug: et.slug,
    title: (et.title ?? {}) as Record<string, string>,
    description: (et.description ?? {}) as Record<string, string>,
    durationMin: et.duration_min,
    slotIncrementMin: et.slot_increment_min,
    priceCents: et.price_cents,
    depositCents: et.deposit_cents,
    currency: et.currency,
    locationKind: et.location_kind as DashboardEventType["locationKind"],
    locationValue: et.location_value,
    bufferBeforeMin: et.buffer_before_min,
    bufferAfterMin: et.buffer_after_min,
    minNoticeMin: et.min_notice_min,
    maxDaysAhead: et.max_days_ahead,
    maxPerDay: et.max_per_day,
    isActive: et.is_active,
  };
}

export interface DashboardQuestion {
  id: string;
  label: Record<string, string>;
  questionType: "text" | "select";
  options: string[];
  isRequired: boolean;
  sortOrder: number;
}

export async function getEventTypeQuestions(eventTypeId: string): Promise<DashboardQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_type_questions")
    .select("id, label, question_type, options, is_required, sort_order")
    .eq("event_type_id", eventTypeId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((q) => ({
    id: q.id,
    label: (q.label ?? {}) as Record<string, string>,
    questionType: q.question_type as "text" | "select",
    options: (q.options ?? []) as string[],
    isRequired: q.is_required,
    sortOrder: q.sort_order,
  }));
}

export interface DashboardAvailabilityRule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export async function getAvailabilityRules(): Promise<DashboardAvailabilityRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .select("id, weekday, start_time, end_time")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    weekday: r.weekday,
    startTime: r.start_time,
    endTime: r.end_time,
  }));
}

export interface DashboardDateOverride {
  id: string;
  theDate: string;
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
}

export async function getDateOverrides(): Promise<DashboardDateOverride[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("date_overrides")
    .select("id, the_date, is_closed, start_time, end_time")
    .gte("the_date", new Date().toISOString().slice(0, 10))
    .order("the_date", { ascending: true });

  if (error || !data) return [];
  return data.map((o) => ({
    id: o.id,
    theDate: o.the_date,
    isClosed: o.is_closed,
    startTime: o.start_time,
    endTime: o.end_time,
  }));
}

export interface DashboardCalendarConnection {
  provider: string;
  externalCalendarId: string;
  updatedAt: string;
}

export async function getCalendarConnection(
  provider: "google" | "microsoft",
): Promise<DashboardCalendarConnection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_connections")
    .select("provider, external_calendar_id, updated_at")
    .eq("provider", provider)
    .maybeSingle();

  if (!data) return null;
  return {
    provider: data.provider,
    externalCalendarId: data.external_calendar_id,
    updatedAt: data.updated_at,
  };
}
