-- EXERCISE KEY ORDER (9-item list, effective Nov 1 2026; matches EXERCISES in app.js). Do NOT use the old 8-item order.
--   "0" Tib raises         "1" Split squat        "2" Glute bridges
--   "3" Dead bug           "4" Bird dogs          "5" Hollow hold (20s)
--   "6" Lying leg raises   "7" Standing side bends "8" Couch stretch (60s)
-- Daily 15 done = all of "0".."8" true. (Old order had backward walk / calf raises; those keys are retired.)
-- Seed days Wendy logged from chat. Run via Supabase MCP execute_sql (service role context).
-- One VALUES row per day. exercises keys are "0".."8" (index into the exercise list), checks keys: walk, no_alcohol, read, clip.
-- Upsert overwrites only days listed; Daily 15 workout is derived (all exercises true), not stored.
insert into public.daily_log (user_id, day, checks, exercises, one_round, steps, water_oz, protein_g, note)
select u.id, v.day::date, v.checks::jsonb, v.exercises::jsonb, v.one_round, v.steps, v.water_oz, v.protein_g, v.note
from auth.users u,
(values
  ('2026-11-02', '{"walk":false,"no_alcohol":false,"read":false,"clip":false}',
   '{}', false, null::int, 0, 0, 'EXAMPLE, replace')
) as v(day, checks, exercises, one_round, steps, water_oz, protein_g, note)
where u.email = 'jason.pepino@gmail.com'
on conflict (user_id, day) do update set checks = excluded.checks, exercises = excluded.exercises, one_round = excluded.one_round, steps = excluded.steps,
  water_oz = excluded.water_oz, protein_g = excluded.protein_g, note = excluded.note, deleted_at = null;
-- The row above is a PLACEHOLDER example (Nov 1 already seeded via seed_2026-11-01.sql). Replace with Wendy's real values before running.
