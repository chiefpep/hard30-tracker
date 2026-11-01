create or replace function public.increment_counter(p_day date, p_field text, p_delta int, p_op_id uuid)
returns public.daily_log language plpgsql security invoker set search_path = '' as $$
declare r public.daily_log; n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_field not in ('water_oz','protein_g') then raise exception 'bad field'; end if;
  insert into public.counter_ops(op_id, day, field, delta) values (p_op_id, p_day, p_field, p_delta)
    on conflict (op_id) do nothing;
  get diagnostics n = row_count;
  if n = 1 then
    insert into public.daily_log(day) values (p_day) on conflict (user_id, day) do nothing;
    if exists (select 1 from public.daily_log where user_id = auth.uid() and day = p_day and deleted_at is not null) then
      perform public.patch_day(p_day, '{}'::jsonb);
    end if;
    if p_field = 'water_oz' then
      update public.daily_log set water_oz = greatest(0, water_oz + p_delta) where user_id = auth.uid() and day = p_day;
    else
      update public.daily_log set protein_g = greatest(0, protein_g + p_delta) where user_id = auth.uid() and day = p_day;
    end if;
  end if;
  select * into r from public.daily_log where user_id = auth.uid() and day = p_day;
  return r;
end $$;
revoke execute on function public.increment_counter(date,text,int,uuid) from public, anon;
grant execute on function public.increment_counter(date,text,int,uuid) to authenticated;
