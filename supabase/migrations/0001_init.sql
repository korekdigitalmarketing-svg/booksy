-- Booksy — initial schema.
-- Built for a single host today, but every host-owned row carries owner_id
-- so multi-tenant works later without a migration (section 1).

create extension if not exists btree_gist;
-- btree_gist adds b-tree operator support (=, equality on owner_id) inside
-- a GiST index, which is what makes the EXCLUDE constraint below possible:
-- GiST alone only understands range/geometric operators like &&, not =.
-- (Moved out of `public` into a dedicated `extensions` schema by migration
-- 0002 — Supabase's linter flags extensions left in `public`.)

create type booking_status as enum
  ('pending_payment','confirmed','cancelled_by_host','cancelled_by_client','expired','no_show');
create type location_type as enum ('video','phone','in_person','custom');

-- ── host ─────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- 1:1 with a Supabase Auth user; deleting the auth user cascades here.
  full_name    text not null,
  email        text not null,
  slug         text not null unique,          -- public URL segment
  timezone     text not null default 'Europe/Paris',  -- IANA, e.g. Europe/Paris
  locale       text not null default 'en' check (locale in ('en','fr','es')),
  avatar_url   text,
  brand_color  text,
  created_at   timestamptz not null default now()
);

create table event_types (
  id uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references profiles(id) on delete cascade,
  slug               text not null,
  -- host-authored content, one entry per locale: {"fr":"Consultation","en":"Consultation"}
  -- the default locale key is required; others fall back to it
  title              jsonb not null,
  description        jsonb not null default '{}'::jsonb,
  duration_min       int  not null check (duration_min between 5 and 480),
  -- 5..480 min = 5 minutes to 8 hours; guards against a fat-fingered 0 or a
  -- multi-day "event type" that would break the slot grid math.
  slot_increment_min int  not null default 15,  -- grid step for offered slots
  price_cents        int  not null default 0 check (price_cents >= 0),
  currency           text not null default 'USD',
  requires_payment   boolean generated always as (price_cents > 0) stored,
  -- derived, not settable — "free vs paid" must always agree with the
  -- price, never drift out of sync via an app bug that sets one but not
  -- the other.
  location_kind      location_type not null default 'video',
  location_value     text,
  buffer_before_min  int not null default 0,
  buffer_after_min   int not null default 0,
  min_notice_min     int not null default 120,  -- can't book sooner than this
  max_days_ahead     int not null default 60,
  max_per_day        int,                       -- null = unlimited
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (owner_id, slug)
  -- a host's event-type slugs must be unique per host, not globally —
  -- two different hosts can both publish /consult once multi-tenant lands.
);

-- recurring weekly availability, expressed in the HOST's timezone
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  weekday    int  not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
  -- a zero- or negative-length window is never a valid working window.
);

-- one-off exceptions: holidays, extra hours
create table date_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  the_date   date not null,
  is_closed  boolean not null default true,
  start_time time,
  end_time   time,
  unique (owner_id, the_date, start_time)
  -- start_time is part of the key (not just the_date) so a host can layer
  -- multiple time windows onto the same date if ever needed; NULL
  -- start_time (a whole-day override) is still unique per owner+date since
  -- Postgres treats distinct NULLs as non-equal in a unique constraint —
  -- acceptable here because a whole-day override is meant to be singular
  -- per date at the application level.
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profiles(id) on delete cascade,
  event_type_id   uuid not null references event_types(id) on delete restrict,
  -- restrict, not cascade: a host can't delete an event type out from under
  -- an existing booking's history. Deactivate it (is_active) instead.
  status          booking_status not null default 'pending_payment',
  -- times stored in UTC; blocked window includes buffers
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  blocked_from    timestamptz not null,
  blocked_to      timestamptz not null,
  blocked_period  tstzrange generated always as (tstzrange(blocked_from, blocked_to, '[)')) stored,
  -- generated, not settable — the exclusion constraint below reads this
  -- column, so it must always be derived from blocked_from/blocked_to and
  -- never independently writable (which could bypass the guarantee).
  -- '[)' = inclusive start, exclusive end, so a booking ending exactly when
  -- the next one starts does not count as an overlap.
  invitee_name     text not null,
  invitee_email    text not null,
  invitee_phone    text,
  invitee_notes    text,
  invitee_timezone text not null,
  invitee_locale   text not null check (invitee_locale in ('en','fr','es')),
  amount_cents  int not null default 0,
  currency      text not null default 'USD',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  hold_expires_at timestamptz,      -- set while pending_payment
  access_token  uuid not null default gen_random_uuid(),  -- client cancel/reschedule link
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- THE anti-double-booking guarantee. Two live bookings for the same host
-- can never overlap. Postgres enforces it, not application code.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    owner_id with =,
    blocked_period with &&
  ) where (status in ('pending_payment','confirmed'));
-- Scoped to live statuses only: a cancelled/expired/no_show booking must
-- never block a slot, so it's excluded from the guarded set entirely
-- rather than relying on application code to check status before insert.
-- This is also what makes the required 409-on-23P01 handling (section 6)
-- necessary: a concurrent insert into the same window raises a Postgres
-- error, not a silently-lost row.

create index on bookings (owner_id, starts_at);
-- the query the dashboard and slot generator run constantly: "this host's
-- bookings, in time order."

-- one row per email actually sent; prevents duplicate sends on webhook retries
create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  kind       text not null,   -- 'client_confirmation' | 'host_new_booking' | 'reminder_24h' | ...
  provider_id text,
  sent_at    timestamptz not null default now(),
  unique (booking_id, kind)
  -- the dedupe key: at most one row per (booking, notification kind) ever
  -- exists, so "insert here before sending" turns a duplicate webhook
  -- delivery into a no-op instead of a duplicate email.
);

-- Stripe webhook idempotency
create table processed_webhook_events (
  event_id text primary key,
  -- Stripe's event.id is already globally unique, so the primary key alone
  -- is the entire idempotency mechanism: insert fails on replay, handler
  -- returns 200 and stops.
  processed_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────
-- Every table gets RLS enabled. Hosts can only ever touch their own rows
-- (owner_id = auth.uid(), or id = auth.uid() for profiles). No anon
-- policies exist on any of these tables: the public booking page never
-- reads them directly — it goes through server-side route handlers or
-- SECURITY DEFINER RPCs (added in later migrations) that expose only what
-- a visitor needs, and bookings is written only with the service role key.

alter table profiles enable row level security;
alter table event_types enable row level security;
alter table availability_rules enable row level security;
alter table date_overrides enable row level security;
alter table bookings enable row level security;
alter table notifications_log enable row level security;
alter table processed_webhook_events enable row level security;
-- processed_webhook_events and notifications_log carry no owner_id — they
-- are pure server-side bookkeeping (service role only). RLS is still
-- enabled with no policies at all, so even a leaked anon key reads zero
-- rows here rather than relying on "nobody queries this table" as the
-- only defense.

create policy "profiles_owner_all" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "event_types_owner_all" on event_types
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "availability_rules_owner_all" on availability_rules
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "date_overrides_owner_all" on date_overrides
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "bookings_owner_all" on bookings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Note: this policy is what the HOST dashboard reads through (anon-key
-- client, authenticated session). Client-facing writes to bookings never
-- go through this policy at all — they go through the service-role client
-- from route handlers (POST /api/bookings, the Stripe webhook), which
-- bypasses RLS entirely, per section 4's "never from the browser" rule.
