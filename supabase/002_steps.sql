alter table public.daily_log add column steps int check (steps is null or steps between 0 and 200000);
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
      steps = case when p_patch ? 'steps' then (p_patch->>'steps')::int when d.deleted_at is not null then null else d.steps end,
      water_oz = case when d.deleted_at is not null then 0 else d.water_oz end,
      protein_g = case when d.deleted_at is not null then 0 else d.protein_g end,
      deleted_at = null
    where user_id = auth.uid() and day = p_day;
  end if;
  select * into r from public.daily_log where user_id = auth.uid() and day = p_day;
  return r;
end $$;
revoke execute on function public.patch_day(date,jsonb) from public, anon;
grant execute on function public.patch_day(date,jsonb) to authenticated;
