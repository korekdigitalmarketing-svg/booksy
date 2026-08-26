-- Optional per-event-type deposits: a host can require just a partial
-- payment ("acompte") to secure a booking instead of the full price, with
-- the remaining balance collected manually (in person, invoiced, however
-- the host normally would) - Korek Booking only tracks and displays it, there's
-- no second Stripe charge.

alter table event_types add column deposit_cents integer;
alter table event_types add constraint event_types_deposit_lt_price
  check (deposit_cents is null or (deposit_cents > 0 and deposit_cents < price_cents));

-- The full service price at booking time, snapshotted for the same
-- reason bookings.amount_cents already is (a later edit to the event
-- type's price must not retroactively change a past booking's numbers).
-- For a non-deposit booking this simply equals amount_cents; for a
-- deposit booking amount_cents is the (smaller) deposit actually charged,
-- and total_price_cents - amount_cents is the balance still due.
alter table bookings add column total_price_cents integer not null default 0;

-- Backfill: every booking that already exists predates this feature, so
-- none of them used a deposit — total_price_cents must equal amount_cents
-- for all of them, not the column's bare 0 default (which would read as
-- "balance due" on every past booking).
update bookings set total_price_cents = amount_cents;
