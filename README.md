# Booksy

[![GitHub repo](https://img.shields.io/badge/GitHub-korekdigitalmarketing--svg%2Fbooksy-blue?logo=github)](https://github.com/korekdigitalmarketing-svg/booksy)

A paid appointment booking platform (Calendly / Cal.com style) — Next.js App
Router, Supabase, Stripe Checkout, Resend, trilingual (en/fr/es) from day
one.

## Stack

Next.js (App Router, TypeScript strict) · Tailwind + shadcn/ui · Supabase
(Postgres, Auth, RLS on every table) · Stripe Checkout + webhooks · Resend +
React Email · Luxon (IANA timezones, no naive `Date` math) · Vercel Cron ·
next-intl (en, fr, es) · Zod on every API input.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

### Environment variables

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page — the `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — the `service_role` secret key. **Server only** — never import `lib/supabase/service.ts` into a Client Component; the `server-only` package makes that a build error, not just a runtime footgun |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys (use a test key locally) |
| `STRIPE_WEBHOOK_SECRET` | printed by `stripe listen` below, or from Developers → Webhooks once deployed |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe dashboard → Developers → API keys |
| `RESEND_API_KEY` | Resend dashboard → API Keys |
| `EMAIL_FROM` | a verified sender on your Resend domain |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally |
| `CRON_SECRET` | any random string — cron routes check `Authorization: Bearer $CRON_SECRET` |

### Database

The schema lives in `supabase/migrations/` (applied in order) and
`supabase/seed.sql` (one host, one free event type, one paid event type,
Mon–Fri 09:00–17:00 availability — idempotent, safe to re-run).

If you're using the Supabase CLI against a local stack:

```bash
supabase start
supabase db reset   # applies migrations, then seed.sql
```

Against a hosted project, apply each file in `supabase/migrations/` in
order (`supabase db push`, or paste into the SQL editor), then run
`supabase/seed.sql` once.

After any schema change, regenerate `lib/supabase/types.ts`:

```bash
supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
```

### Stripe webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET` in
`.env.local`. Trigger events with e.g. `stripe trigger checkout.session.completed`
to exercise the confirmation flow, or `stripe trigger checkout.session.completed`
five times in a row to check webhook idempotency (one confirmation, one
email — see `notifications_log`).

### i18n

`npm run check:i18n` fails if `messages/en.json`, `messages/fr.json`, and
`messages/es.json` don't have identical key sets — it also runs
automatically before every `npm run build`.

## Deploying to Vercel

1. Push this repo to GitHub, then import it into a new Vercel project.
2. In Vercel → Project → Settings → Environment Variables, add every
   variable from the table above for the **Production** environment (and
   Preview, if you want preview deployments to work against the same
   Supabase project). Use **live** Stripe keys (`sk_live_...`) and a
   **verified** Resend sending domain — the `onboarding@resend.dev` sender
   used in local dev can only deliver to the Resend account owner's own
   address, so it won't work for real customers.
3. Set `NEXT_PUBLIC_APP_URL` to the real production domain (e.g.
   `https://booksy.example.com`) — it's used for email links, `.ics`
   files, and hreflang alternates.
4. Apply `supabase/migrations/` and `supabase/seed.sql` against the
   production Supabase project if it's separate from the one used in dev
   (see [Database](#database) above).
5. Deploy. `vercel.json` registers the two cron routes
   (`sweep-holds` every 5 minutes, `reminders` hourly) automatically —
   **verify your current Vercel plan supports that cron frequency** before
   relying on it; Vercel has at times restricted free-tier cron jobs to
   once a day, which would leave expired holds unswept and reminders
   unsent for hours. Set `CRON_SECRET` to a strong random value; Vercel
   sends it automatically as `Authorization: Bearer $CRON_SECRET` for its
   own cron invocations, so no other setup is needed there.
6. In the Stripe dashboard → Developers → Webhooks, add an endpoint at
   `https://<your-domain>/api/webhooks/stripe` subscribed to
   `checkout.session.completed`, `checkout.session.expired`, and
   `charge.refunded` — the three events `app/api/webhooks/stripe/route.ts`
   actually handles. Copy the endpoint's signing secret into
   `STRIPE_WEBHOOK_SECRET` in Vercel.
7. Smoke-test after deploy: complete one free booking and one paid
   booking end-to-end, confirm both a client and host email arrive, then
   replay the Stripe webhook event once from the Stripe dashboard and
   confirm `notifications_log` shows no duplicate rows.

## Project structure

```
app/[locale]/        public, locale-prefixed routes (/{locale}/{hostSlug}/...)
app/dashboard/        host-only routes, no locale prefix (Phase 6)
app/api/               route handlers: bookings, slots, webhooks, cron (Phase 2+)
i18n/                  next-intl routing, navigation, request config
lib/supabase/          browser / server / service-role Supabase clients
lib/availability.ts    slot generation engine (Phase 2)
messages/               en.json, fr.json, es.json
supabase/migrations/   schema, in order
supabase/seed.sql       one host, one free + one paid event type, weekday availability
```
