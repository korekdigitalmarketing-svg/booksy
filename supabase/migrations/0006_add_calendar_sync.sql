-- Phase 1 of Google Calendar sync: import-only, webhook-driven.
--
-- Two tables, deliberately separate:
-- 1. calendar_connections — one row per host per provider, holding OAuth
--    tokens and the Google push-notification "watch" channel's state.
-- 2. calendar_busy_blocks — a LOCAL CACHE of the host's external busy
--    intervals, refreshed on webhook receipt. /api/slots and
--    /api/bookings read this table, never Google's API directly — the
--    public booking flow can't depend on a third-party API's latency or
--    uptime, matching how every other blocking source (bookings itself)
--    already works: recomputed from data stored in our own DB.
--
-- Known gap, not solved here: access_token/refresh_token are stored as
-- plain columns, protected by RLS the same way access_token capability
-- tokens are elsewhere in this schema — NOT encrypted at rest. A real
-- envelope-encryption pass (KMS-backed key, rotation) is a deliberate
-- follow-up, not an oversight; flagged to the user rather than silently
-- accepted.

create table calendar_connections (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  provider            text not null default 'google' check (provider in ('google')),
  access_token        text not null,
  refresh_token       text not null,
  token_expires_at    timestamptz not null,
  external_calendar_id text not null default 'primary',
  -- Google's incremental-sync cursor (https://developers.google.com/calendar/api/guides/sync) —
  -- null until the first full sync completes, after which every
  -- subsequent events.list call is a cheap delta instead of a full scan.
  sync_token          text,
  -- The registered push-notification channel (events.watch). Channels
  -- expire (Google's max is 30 days) and must be renewed before then —
  -- see the daily cron in vercel.json, which is well within the Hobby
  -- plan's once-daily limit since renewal only needs day-level precision.
  channel_id          text,
  resource_id         text,
  channel_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (owner_id, provider)
);

create table calendar_busy_blocks (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles(id) on delete cascade,
  connection_id  uuid not null references calendar_connections(id) on delete cascade,
  -- Google's event id for this connection — the natural key for
  -- upsert/delete on each delta sync, since Google reports "this event
  -- changed" or "this event was deleted" by id, not by time range.
  external_event_id text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (connection_id, external_event_id)
);

create index on calendar_busy_blocks (owner_id, starts_at, ends_at);

alter table calendar_connections enable row level security;
alter table calendar_busy_blocks enable row level security;

create policy "calendar_connections_owner_all" on calendar_connections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Read-only for the host's own session (matches other host-dashboard
-- reads); all writes come from the webhook route via the service client,
-- which bypasses RLS entirely — a host never writes their own busy
-- blocks directly, Google's API is the only source of truth for them.
create policy "calendar_busy_blocks_owner_select" on calendar_busy_blocks
  for select using (owner_id = auth.uid());
