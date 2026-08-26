-- Team scheduling foundation: organizations, team hosts, routing forms,
-- collective/round-robin modes, and group-booking capacity.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

insert into public.organizations (name, slug, owner_id)
select
  coalesce(nullif(full_name, ''), email, slug) || '''s workspace',
  slug || '-workspace',
  id
from public.profiles
on conflict (slug) do nothing;

insert into public.organization_members (organization_id, profile_id, role)
select organizations.id, organizations.owner_id, 'owner'
from public.organizations
on conflict (organization_id, profile_id) do nothing;

alter table public.event_types
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists scheduling_mode text not null default 'solo'
    check (scheduling_mode in ('solo', 'round_robin', 'collective')),
  add column if not exists max_invitees_per_slot int not null default 1
    check (max_invitees_per_slot between 1 and 250);

update public.event_types
set organization_id = organizations.id
from public.organizations
where event_types.owner_id = organizations.owner_id
  and event_types.organization_id is null;

create table if not exists public.event_type_hosts (
  event_type_id uuid not null references public.event_types(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  weight int not null default 1 check (weight between 1 and 100),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_type_id, profile_id)
);

insert into public.event_type_hosts (event_type_id, organization_id, profile_id, sort_order)
select id, organization_id, owner_id, 0
from public.event_types
on conflict (event_type_id, profile_id) do nothing;

alter table public.bookings
  add column if not exists assigned_host_id uuid references public.profiles(id) on delete set null,
  add column if not exists seats_reserved int not null default 1 check (seats_reserved between 1 and 250);

update public.bookings
set assigned_host_id = owner_id
where assigned_host_id is null;

create index if not exists bookings_assigned_host_starts_at_idx
  on public.bookings (assigned_host_id, starts_at);

create table if not exists public.booking_invitees (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  name text not null,
  email text not null,
  timezone text,
  locale text check (locale in ('en', 'fr', 'es')),
  created_at timestamptz not null default now(),
  unique (booking_id, email)
);

create table if not exists public.routing_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.routing_form_rules (
  id uuid primary key default gen_random_uuid(),
  routing_form_id uuid not null references public.routing_forms(id) on delete cascade,
  sort_order int not null default 0,
  question_key text not null,
  operator text not null default 'equals'
    check (operator in ('equals', 'contains', 'is_empty', 'is_not_empty')),
  value text,
  event_type_id uuid not null references public.event_types(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.event_types
  add column if not exists routing_form_id uuid references public.routing_forms(id) on delete set null;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and profile_id = auth.uid()
  );
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and profile_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.event_type_hosts enable row level security;
alter table public.booking_invitees enable row level security;
alter table public.routing_forms enable row level security;
alter table public.routing_form_rules enable row level security;

drop policy if exists "event_types_org_member_select" on public.event_types;
drop policy if exists "event_types_org_admin_insert" on public.event_types;
drop policy if exists "event_types_org_admin_update" on public.event_types;
drop policy if exists "bookings_assigned_host_select" on public.bookings;
drop policy if exists "organizations_member_select" on public.organizations;
drop policy if exists "organizations_owner_insert" on public.organizations;
drop policy if exists "organizations_admin_update" on public.organizations;
drop policy if exists "organization_members_member_select" on public.organization_members;
drop policy if exists "organization_members_admin_all" on public.organization_members;
drop policy if exists "event_type_hosts_member_select" on public.event_type_hosts;
drop policy if exists "event_type_hosts_admin_all" on public.event_type_hosts;
drop policy if exists "booking_invitees_owner_select" on public.booking_invitees;
drop policy if exists "routing_forms_owner_or_org_all" on public.routing_forms;
drop policy if exists "routing_form_rules_owner_or_org_all" on public.routing_form_rules;

create policy "event_types_org_member_select"
  on public.event_types for select
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

create policy "event_types_org_admin_insert"
  on public.event_types for insert
  with check (
    owner_id = auth.uid()
    and organization_id is not null
    and public.is_organization_admin(organization_id)
  );

create policy "event_types_org_admin_update"
  on public.event_types for update
  using (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
  with check (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  );

create policy "bookings_assigned_host_select"
  on public.bookings for select
  using (assigned_host_id = auth.uid());

create policy "organizations_member_select"
  on public.organizations for select
  using (public.is_organization_member(id));

create policy "organizations_owner_insert"
  on public.organizations for insert
  with check (owner_id = auth.uid());

create policy "organizations_admin_update"
  on public.organizations for update
  using (public.is_organization_admin(id))
  with check (public.is_organization_admin(id));

create policy "organization_members_member_select"
  on public.organization_members for select
  using (public.is_organization_member(organization_id));

create policy "organization_members_admin_all"
  on public.organization_members for all
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy "event_type_hosts_member_select"
  on public.event_type_hosts for select
  using (
    organization_id is null
    or public.is_organization_member(organization_id)
  );

create policy "event_type_hosts_admin_all"
  on public.event_type_hosts for all
  using (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  )
  with check (
    organization_id is not null
    and public.is_organization_admin(organization_id)
  );

create policy "booking_invitees_owner_select"
  on public.booking_invitees for select
  using (
    exists (
      select 1
      from public.bookings
      where bookings.id = booking_invitees.booking_id
        and bookings.owner_id = auth.uid()
    )
  );

create policy "routing_forms_owner_or_org_all"
  on public.routing_forms for all
  using (
    owner_id = auth.uid()
    or (
      organization_id is not null
      and public.is_organization_admin(organization_id)
    )
  )
  with check (
    owner_id = auth.uid()
    or (
      organization_id is not null
      and public.is_organization_admin(organization_id)
    )
  );

create policy "routing_form_rules_owner_or_org_all"
  on public.routing_form_rules for all
  using (
    exists (
      select 1
      from public.routing_forms
      where routing_forms.id = routing_form_rules.routing_form_id
        and (
          routing_forms.owner_id = auth.uid()
          or (
            routing_forms.organization_id is not null
            and public.is_organization_admin(routing_forms.organization_id)
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.routing_forms
      where routing_forms.id = routing_form_rules.routing_form_id
        and (
          routing_forms.owner_id = auth.uid()
          or (
            routing_forms.organization_id is not null
            and public.is_organization_admin(routing_forms.organization_id)
          )
        )
    )
  );
