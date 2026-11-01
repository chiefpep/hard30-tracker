# Hard 30 Tracker
Static PWA (index.html, app.js, config.js, sw.js, manifest.webmanifest, icon.svg) backed by Supabase project hard30-tracker (ref dscsrszpkdwojondhxyp, free plan).
config.js holds only the public publishable key. Never add the service_role or secret key.

Daily 15: 9 exercises (keys "0".."8"): Tib raises 2x20, Split squat 2x8 each leg, Glute bridges 2x15, Dead bug 2x10, Bird dogs 2x8 each side,
Hollow hold 2x20s (20 s timer), Lying leg raises 2x10, Standing side bends 2x10 each side (tip shown), Couch stretch 60s each side (60 s timer).
One round shows 1x and still counts. Daily 15 workout check is derived from all 9.
Hard 30: walk + 8k (manual), water 100 oz, protein 120 g, no alcohol, 10 pages, filmed clip. Optional steps number (does not auto-check walk).

Writes: patch_day(day, patch) for checks, exercises, one_round, note, steps, clear, restore; increment_counter(day, field, delta, op_id) for water and protein.
Sync: IndexedDB outbox in order; network/auth errors retry, other errors go to a Failed list (Retry/Discard). Refetch on focus only after the outbox drains.
Export CSV button downloads November from the server.

SQL: supabase/001_schema.sql, 002_steps.sql, 003_inc_replay.sql (apply in order). Tests: supabase/rls_test.sql (set the second user's id first).
Seeds: supabase/seed_2026-11-01.sql (applied), supabase/seed_template.sql for Wendy's later days.
