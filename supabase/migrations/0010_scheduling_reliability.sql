-- Scheduling reliability: make availability replacement atomic and ensure
-- whole-day overrides are genuinely unique (NULL values are otherwise
-- considered distinct by a normal Postgres unique constraint).

delete from public.date_overrides a
using public.date_overrides b
where a.owner_id = b.owner_id
  and a.the_date = b.the_date
  and a.start_time is null
  and b.start_time is null
  and a.ctid > b.ctid;

create unique index if not exists date_overrides_one_closed_day
  on public.date_overrides (owner_id, the_date)
  where start_time is null;

create or replace function public.replace_availability_rules(p_rules jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.availability_rules where owner_id = auth.uid();

  insert into public.availability_rules (owner_id, weekday, start_time, end_time)
  select auth.uid(), rule.weekday, rule.start_time::time, rule.end_time::time
  from jsonb_to_recordset(coalesce(p_rules, '[]'::jsonb))
    as rule(weekday integer, start_time text, end_time text);
end;
$$;

revoke all on function public.replace_availability_rules(jsonb) from public;
grant execute on function public.replace_availability_rules(jsonb) to authenticated;

create or replace function public.add_date_override(
  p_date date,
  p_is_closed boolean,
  p_start_time time default null,
  p_end_time time default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_is_closed then
    delete from public.date_overrides
      where owner_id = auth.uid() and the_date = p_date;
  else
    delete from public.date_overrides
      where owner_id = auth.uid() and the_date = p_date and start_time is null;
  end if;

  insert into public.date_overrides (
    owner_id, the_date, is_closed, start_time, end_time
  ) values (
    auth.uid(), p_date, p_is_closed,
    case when p_is_closed then null else p_start_time end,
    case when p_is_closed then null else p_end_time end
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_date_override(date, boolean, time, time) from public;
grant execute on function public.add_date_override(date, boolean, time, time) to authenticated;
