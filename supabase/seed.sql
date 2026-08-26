-- Seed data: one host, one free event type, one paid event type, and
-- Mon–Fri 09:00–17:00 availability (section 10, Phase 1).
-- Idempotent — safe to re-run against the same project (fixed UUIDs +
-- ON CONFLICT upserts), so `supabase db reset` or a repeated seed call
-- during development never duplicates rows.

-- The host account. Auth is magic-link only (section 3), so no password is
-- ever used — encrypted_password is left empty and email_confirmed_at is
-- set directly so the seeded host can sign in immediately without going
-- through email confirmation.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'host@example.com', '',
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

-- Matching identity row for the email provider — the shape GoTrue itself
-- creates on signup, so magic-link sign-in finds a consistent record.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'host@example.com',
    'email_verified', true
  ),
  'email', now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, slug, timezone, locale)
values (
  '11111111-1111-4111-8111-111111111111',
  'Alex Korek', 'host@example.com', 'alex', 'Europe/Paris', 'en'
)
on conflict (id) do update set
  full_name = excluded.full_name,
  email     = excluded.email,
  slug      = excluded.slug,
  timezone  = excluded.timezone,
  locale    = excluded.locale;

-- Free event type — requires_payment is a generated column, so leaving
-- price_cents at 0 is what makes this one skip the Stripe flow entirely.
insert into public.event_types (
  id, owner_id, slug, title, description,
  duration_min, slot_increment_min, price_cents, currency,
  location_kind, location_value, buffer_before_min, buffer_after_min,
  min_notice_min, max_days_ahead
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'intro-call',
  jsonb_build_object(
    'en', 'Intro Call',
    'fr', 'Appel de découverte',
    'es', 'Llamada introductoria'
  ),
  jsonb_build_object(
    'en', 'A free 15-minute call to see if we are a good fit.',
    'fr', 'Un appel gratuit de 15 minutes pour voir si nous sommes faits l''un pour l''autre.',
    'es', 'Una llamada gratuita de 15 minutos para ver si encajamos.'
  ),
  15, 15, 0, 'USD',
  'video', 'https://meet.example.com/alex', 0, 0, 60, 30
)
on conflict (owner_id, slug) do update set
  title       = excluded.title,
  description = excluded.description;

-- Paid event type — $150.00, 10-minute buffers on both sides, capped at
-- 4 per day, so the availability engine and Stripe flow both have a real
-- paid case to exercise from Phase 2 onward.
insert into public.event_types (
  id, owner_id, slug, title, description,
  duration_min, slot_increment_min, price_cents, currency,
  location_kind, location_value, buffer_before_min, buffer_after_min,
  min_notice_min, max_days_ahead, max_per_day
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'consulting-session',
  jsonb_build_object(
    'en', 'Consulting Session',
    'fr', 'Séance de consulting',
    'es', 'Sesión de consultoría'
  ),
  jsonb_build_object(
    'en', 'A focused 60-minute paid consulting session.',
    'fr', 'Une séance de consulting payante de 60 minutes.',
    'es', 'Una sesión de consultoría de pago de 60 minutos.'
  ),
  60, 15, 15000, 'USD',
  'video', 'https://meet.example.com/alex', 10, 10, 120, 60, 4
)
on conflict (owner_id, slug) do update set
  title       = excluded.title,
  description = excluded.description;

-- Mon–Fri 09:00–17:00 in the host's timezone (weekday 0 = Sunday, so
-- Mon..Fri = 1..5). The `gs` alias avoids the classic footgun of a
-- correlated subquery's WHERE clause shadowing the outer generate_series
-- column of the same name and comparing it to itself.
insert into public.availability_rules (owner_id, weekday, start_time, end_time)
select '11111111-1111-4111-8111-111111111111', gs.weekday, '09:00', '17:00'
from generate_series(1, 5) as gs(weekday)
where not exists (
  select 1 from public.availability_rules ar
  where ar.owner_id = '11111111-1111-4111-8111-111111111111'
    and ar.weekday = gs.weekday
);
