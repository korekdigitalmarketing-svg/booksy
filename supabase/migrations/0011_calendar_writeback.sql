-- Maps each Korek Booking appointment to the event created in every connected calendar.
-- A separate table supports hosts who connect both Google and Microsoft.

create table if not exists public.booking_calendar_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  external_event_id text not null,
  created_at timestamptz not null default now(),
  unique (booking_id, connection_id)
);

create index if not exists booking_calendar_events_owner_id_idx
  on public.booking_calendar_events (owner_id);

alter table public.booking_calendar_events enable row level security;

drop policy if exists "booking_calendar_events_owner_select" on public.booking_calendar_events;

create policy "booking_calendar_events_owner_select"
  on public.booking_calendar_events for select
  using (owner_id = auth.uid());
