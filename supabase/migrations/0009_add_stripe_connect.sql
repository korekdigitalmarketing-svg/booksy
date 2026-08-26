-- Multi-host payouts: each host connects their own Stripe Express account
-- so a client's payment routes directly to them (a destination charge,
-- see app/api/bookings/route.ts) instead of landing in one shared platform
-- account. Hosts who never connect keep working exactly as before — the
-- checkout route only adds transfer_data when stripe_account_id is set
-- AND the account can actually accept charges.
--
-- charges_enabled / payouts_enabled mirror Stripe's own Account fields
-- rather than a single "connected" boolean: a host can have an account id
-- while still mid-onboarding (can't accept charges yet) or accepting
-- charges but not yet payouts-eligible (e.g. pending identity
-- verification) — collapsing that into one flag would hide which state
-- a host is actually stuck in.

alter table profiles add column if not exists stripe_account_id text;
alter table profiles add column if not exists stripe_charges_enabled boolean not null default false;
alter table profiles add column if not exists stripe_payouts_enabled boolean not null default false;

create unique index if not exists profiles_stripe_account_id_key on profiles (stripe_account_id)
  where stripe_account_id is not null;

-- Records which connected account (if any) actually received the funds
-- for THIS booking's charge — not derivable from the host's current
-- profile, which can change after the fact (connect, disconnect,
-- reconnect a different account) in ways that must never rewrite what
-- already happened to past money. A refund needs this to know whether to
-- pass reverse_transfer (see app/api/bookings/[id]/cancel/route.ts).
alter table bookings add column if not exists stripe_destination_account_id text;
