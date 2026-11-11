# Hard 30 Tracker
Static PWA (index.html, app.js, score.js, config.js, sw.js, manifest.webmanifest, icon.svg) backed by Supabase project hard30-tracker (ref dscsrszpkdwojondhxyp, free plan).
config.js holds only the public publishable key. Never add the service_role or secret key.

Daily 15: 9 exercises (keys "0".."8"): Tib raises 2x20, Split squat 2x8 each leg, Glute bridges 2x15, Dead bug 2x10, Bird dogs 2x8 each side,
Hollow hold 2x20s (20 s timer), Lying leg raises 2x10, Standing side bends 2x10 each side (tip shown), Couch stretch 60s each side (60 s timer).
One round shows 1x and still counts as a finished Daily 15. It is not completion by itself.
The Hard 30 workout check is done when all 9 exercises are done, or when checks.alt_workout is true (any real workout, described in the note). If both are set, the day is shown as Daily 15.
Hard 30: walk + 8k (manual), water 100 oz, protein 120 g, no alcohol, 10 pages, filmed clip. Optional steps number (does not auto-check walk).

Writes: patch_day(day, patch) for checks (walk, no_alcohol, read, clip, alt_workout), exercises, one_round, note, steps, clear, restore; increment_counter(day, field, delta, op_id) for water and protein.
patch_day merges checks and exercises with jsonb ||. A later edit does not drop alt_workout or any other unknown key. No new SQL for this. Nothing to apply by hand.
Sync: IndexedDB outbox in order; network/auth errors retry, other errors go to a Failed list (Retry/Discard). Refetch on focus only after the outbox drains.
Export CSV button downloads November from the server.

SQL: supabase/001_schema.sql, 002_steps.sql, 003_inc_replay.sql (apply in order). Tests: supabase/rls_test.sql (set the second user's id first).
Seeds: supabase/seed_2026-11-01.sql (applied), supabase/seed_template.sql for Wendy's later days.

## Sign-in (default Supabase email template, no template edits)

The app uses the implicit auth flow (`flowType: "implicit"`). The default Magic Link email links to `/auth/v1/verify?token=<token_hash>&type=magiclink&redirect_to=https://chiefpep.github.io/hard30-tracker/`. In implicit flow that token is a plain token hash, so `verifyOtp({ token_hash, type: "magiclink" })` (falling back to `type: "email"`) works on any device. With PKCE it would be `pkce_...` and need the code verifier stored in the requesting browser, which breaks the paste path, so PKCE is not used. A `?code=` redirect is still handled with `exchangeCodeForSession` in case the flow ever changes.

- Laptop or Safari: tap the link. Supabase redirects back with `#access_token=...`, `detectSessionInUrl` stores the session, and auth params are stripped from the URL.
- iPhone Home Screen app: do not tap the link (tapping consumes it and signs in Safari, which has separate storage). Long-press the link in Mail, Copy, paste into "Paste sign-in link", tap Sign in.
- The 6-digit code box stays as a fallback for when the template ever carries `{{ .Token }}`.

Required Supabase settings (Authentication > URL Configuration): Site URL `https://chiefpep.github.io/hard30-tracker/`, and the same URL in Redirect URLs. Authentication > Sign In / Providers: "Allow new users to sign up" off.

Tests: `node tests/auth-link.test.js` (link parsing and URL cleanup). `node tests/workout.test.js` (alt workout credit, Daily 15 unchanged, merge keeps alt_workout). Service worker cache: `h30-shell-v6`.
