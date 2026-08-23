-- Custom questions a host attaches to one event type, asked on the public
-- booking form in addition to the fixed name/email/phone/notes fields.
create table event_type_questions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  -- denormalized, same as bookings.owner_id alongside bookings.event_type_id —
  -- lets the dashboard's owner-scoped RLS policy avoid a join to event_types.
  event_type_id uuid not null references event_types(id) on delete cascade,
  -- host-authored, one entry per locale: {"en":"...", "fr":"...", "es":"..."} —
  -- same shape as event_types.title.
  label         jsonb not null,
  question_type text not null default 'text' check (question_type in ('text', 'select')),
  -- flat array of strings, e.g. ["Option A","Option B"] — only read when
  -- question_type = 'select'. Not localized (unlike label): keeping this
  -- one field simple rather than doubling every question's edit form with
  -- a second set of per-locale inputs.
  options       jsonb not null default '[]'::jsonb,
  is_required   boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index on event_type_questions (event_type_id, sort_order);

alter table event_type_questions enable row level security;

create policy "event_type_questions_owner_all" on event_type_questions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Keyed by event_type_questions.id, e.g. {"<question_id>": "the answer"} —
-- kept as a single jsonb blob on the booking row (like invitee_notes)
-- rather than a normalized answers table: there's exactly one owner per
-- booking and no need to query "all answers to question X across
-- bookings" today, so the extra join would buy nothing.
alter table bookings add column custom_answers jsonb not null default '{}'::jsonb;
