create table public.daily_log (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null check (day between '2026-10-01' and '2027-01-31'),
  checks jsonb not null default '{}'::jsonb,
  exercises jsonb not null default '{}'::jsonb,
  one_round boolean not null default false,
  water_oz int not null default 0 check (water_oz >= 0),
  protein_g int not null default 0 check (protein_g >= 0),
  note text not null default '',
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table public.counter_ops (
  op_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  field text not null check (field in ('water_oz','protein_g')),
  delta int not null check (delta between -500 and 500),
  created_at timestamptz not null default now()
);
create index counter_ops_user_idx on public.counter_ops(user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger daily_log_touch before insert or update on public.daily_log
for each row execute function public.touch_updated_at();

alter table public.daily_log enable row level security;
alter table public.counter_ops enable row level security;
create policy dl_select on public.daily_log for select to authenticated using (user_id = (select auth.uid()));
create policy dl_insert on public.daily_log for insert to authenticated with check (user_id = (select auth.uid()));
create policy dl_update on public.daily_log for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy co_select on public.counter_ops for select to authenticated using (user_id = (select auth.uid()));
create policy co_insert on public.counter_ops for insert to authenticated with check (user_id = (select auth.uid()));
create policy co_update on public.counter_ops for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.daily_log, public.counter_ops from anon, public;
grant select, insert, update on public.daily_log, public.counter_ops to authenticated;

-- Per-key merge patch. Keys: checks{walk,no_alcohol,read,clip}, exercises{"0".."8"}, one_round, note, clear, restore.
create or replace function public.patch_day(p_day date, p_patch jsonb)
returns public.daily_log language plpgsql security invoker set search_path = '' as $$
declare r public.daily_log;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.daily_log(day) values (p_day) on conflict (user_id, day) do nothing;
  if p_patch ? 'clear' then
    update public.daily_log set deleted_at = now() where user_id = auth.uid() and day = p_day;
  elsif p_patch ? 'restore' then
    update public.daily_log set deleted_at = null where user_id = auth.uid() and day = p_day;
  else
    update public.daily_log d set
      checks = case when d.deleted_at is not null then '{}'::jsonb else d.checks end || coalesce(p_patch->'checks','{}'::jsonb),
      exercises = case when d.deleted_at is not null then '{}'::jsonb else d.exercises end || coalesce(p_patch->'exercises','{}'::jsonb),
      one_round = coalesce((p_patch->>'one_round')::boolean, case when d.deleted_at is not null then false else d.one_round end),
      note = coalesce(p_patch->>'note', case when d.deleted_at is not null then '' else d.note end),
      water_oz = case when d.deleted_at is not null then 0 else d.water_oz end,
      protein_g = case when d.deleted_at is not null then 0 else d.protein_g end,
      deleted_at = null
    where user_id = auth.uid() and day = p_day;
  end if;
  select * into r from public.daily_log where user_id = auth.uid() and day = p_day;
  return r;
end $$;

-- Idempotent counter increment, clamped at 0. SECURITY INVOKER, so RLS applies.
create or replace function public.increment_counter(p_day date, p_field text, p_delta int, p_op_id uuid)
returns public.daily_log language plpgsql security invoker set search_path = '' as $$
declare r public.daily_log; n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_field not in ('water_oz','protein_g') then raise exception 'bad field'; end if;
  insert into public.counter_ops(op_id, day, field, delta) values (p_op_id, p_day, p_field, p_delta)
    on conflict (op_id) do nothing;
  get diagnostics n = row_count;
  insert into public.daily_log(day) values (p_day) on conflict (user_id, day) do nothing;
  if exists (select 1 from public.daily_log where user_id = auth.uid() and day = p_day and deleted_at is not null) then
    perform public.patch_day(p_day, '{}'::jsonb);
  end if;
  if n = 1 then
    if p_field = 'water_oz' then
      update public.daily_log set water_oz = greatest(0, water_oz + p_delta), deleted_at = null
       where user_id = auth.uid() and day = p_day;
    else
      update public.daily_log set protein_g = greatest(0, protein_g + p_delta), deleted_at = null
       where user_id = auth.uid() and day = p_day;
    end if;
  end if;
  select * into r from public.daily_log where user_id = auth.uid() and day = p_day;
  return r;
end $$;

revoke execute on function public.increment_counter(date,text,int,uuid), public.patch_day(date,jsonb), public.touch_updated_at() from public, anon;
grant execute on function public.increment_counter(date,text,int,uuid), public.patch_day(date,jsonb) to authenticated;
