insert into public.daily_log (user_id, day, checks, exercises, one_round, steps, water_oz, protein_g, note)
select u.id, date '2026-11-01',
 '{"walk":false,"no_alcohol":false,"read":false,"clip":true}'::jsonb,
 '{"0":true,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true,"7":true,"8":true}'::jsonb,
 false, 5500, 0, 0, '30-min walk done; 5,500 steps so far'
from auth.users u where u.email = 'jason.pepino@gmail.com'
on conflict (user_id, day) do update set checks=excluded.checks, exercises=excluded.exercises, one_round=excluded.one_round,
 steps=excluded.steps, water_oz=excluded.water_oz, protein_g=excluded.protein_g, note=excluded.note, deleted_at=null;
select day, checks, exercises, one_round, steps, water_oz, protein_g, note, deleted_at, updated_at from public.daily_log;
