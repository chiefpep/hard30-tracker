# Hard 30 Tracker: test plan for Craig

Project: Supabase `hard30-tracker`, ref `dscsrszpkdwojondhxyp` (org chiefpep, free plan, $0/month confirmed by get_cost).
Code: /workspace/hard30-tracker (index.html, app.js, config.js, sw.js, manifest.webmanifest, icon.svg, supabase/*.sql).
Hosting: NOT YET LIVE (see Blockers). Serve locally with `python3 -m http.server` from the folder to test.

## Already verified by Randy (rerun Nov 1, 3:05 PM ET, after steps column and increment_counter replay fix)
SQL as role authenticated with JWT claims, inside a rolled-back transaction (supabase/rls_test.sql):
| Test | Result |
|---|---|
| increment_counter water +16 | 16 |
| Replay same op_id (double tap / outbox replay) | still 16, counted once |
| Decrement -500 | clamped to 0 |
| patch_day checks.walk then checks.read | merged {walk, read}, no clobber |
| patch_day steps 5500, then an unrelated checks patch | steps stays 5500 |
| Exercise key "8" | accepted |
| Water +24, Clear day, then replay that same op_id (Craig item 6) | day stays cleared (deleted_at set), water not re-added or wiped |
| Write after clear | checks reset to the new tap only, steps null, exercises {} |
| Second user: select daily_log / counter_ops | 0 rows |
| Second user: update Pep's rows | 0 rows updated; Pep's Nov 1 note and steps unchanged |
| Second user: insert with Pep's user_id | denied 42501 |
| Second user patch_day on 2026-11-01 | only creates its own row, Pep's row untouched |
| Second user reuses Pep's op_id | no effect on Pep's data |
| anon select / RPC (SQL and REST with publishable key) | denied 42501 |
| After rollback | only Pep's seeded Nov 1 row; counter_ops 0; throwaway user deleted |
| Security advisors | only "leaked password protection" (password feature, unused) |

Headless Chrome smoke test with a stubbed Supabase client: renders all 9 exercises with 2x doses, the side bends tip, the 20 s hollow hold timer, steps 5500, "Daily 15 done.", Nov 1 yellow (partial). A forced Postgres error (22P02) moved the op to the Failed list with Retry and Discard, the queue emptied, and the badge read "synced · failed 1".

Not yet done: real browser sign-in, real two-device and iOS tests.

## Craig to run (needs a test account; ask Randy to temporarily add one, or use Pep's after launch)
1. **Two-device edit**: open on phone and laptop. Phone checks Walk, laptop checks Read for same day. Refocus each. Expect both checks on both devices. Laptop +16 water, phone +8 water: expect 24.
2. **Offline then reconnect**: airplane mode, tap 5 things (incl. +8 water twice). Badge shows "unsynced 5". Reload app while offline: badge and taps still there (IndexedDB). Reconnect: badge goes to "synced", server row matches, water counted once per tap.
3. **Double tap**: rapid-tap +8 water 6 times. Expect +48 exactly. Kill the app mid-sync and reopen: replay must not double count (op_id idempotency).
3b. **Failed op**: force a server rejection (e.g. revoke grant briefly on a test project) and confirm the op shows under Failed with Retry and Discard, and later taps still sync.
3c. **Offline badge**: airplane mode shows yellow "offline · unsynced N", never red.
4. **Midnight rollover**: leave app open on today past 00:00 America/New_York (or set device clock). Within 60 s, or on refocus, selected day moves to the new date; taps land on the new day. If user had manually picked an older day, it stays pinned.
5. **Second account denied by RLS**: sign in as second account, confirm empty calendar, and no visible or editable Pep data.
6. **Clear day**: confirm dialog appears; Cancel does nothing; OK clears; Restore brings it back.
7. **Calendar/streaks**: complete day blue, partial (incl. note only) yellow, past empty gray, future uncolored; unfinished today does not break current streak.
8. **Timers**: start the 20 s hollow hold, then the 60 s couch stretch; both run independently; background 30 s and return: time correct. On iPhone the beep must play (AudioContext unlocked by the Start tap) and the timer row flashes yellow; vibrate is Android only.
8b. **Notes**: type a note, immediately tap another day: note saved to the original day, textarea shows the new day.
8c. **Export CSV**: desktop browser downloads hard30-november-2026.csv with one row per server day.
8d. **iPhone installed-app export**: on the iPhone, open the app from the home-screen icon (standalone, not Safari), tap Export CSV. Expect the iOS share sheet with hard30-november-2026.csv; Save to Files and confirm it opens with all 9 exercise columns. Cancelling the sheet must not error. If the share sheet does not appear, expect the CSV to open in a new view instead (fallback), never a silent no-op.
8e. **Unsynced export notice**: go offline, tap a few items, confirm "N unsynced, not in export" appears next to Export CSV and that the exported file lacks those taps. Reconnect; the notice clears once the badge reads synced.
8f. **Stale timer state**: with a pre-v2 `h30-timers` entry in localStorage (DevTools), reload; it is removed and both timers show full time with no manual Reset.
9. **Workout check**: the Hard 30 workout box is read-only. It checks when all 9 exercises are done (label "Workout: Daily 15") or when "Other workout (not Daily 15)" is on (label "Workout: other workout (not Daily 15)"). One round alone does not check it. The note is where the other workout is described. Calendar: blue is a complete Daily 15 day, teal is a complete other-workout day. A yellow day with a blue bar has Daily 15 done but the day is not finished. A yellow day with a teal bar is an other workout and the day is not finished. Export adds alt_workout and workout columns after daily15.
10. **Install**: Add to Home Screen on iPhone; sign in with typed 6-digit code inside the installed app.

## Blockers / dashboard steps
- Hosting: cursor-github connector has no create-repo or file-push tool and `gh` on the box is not logged in.
- Auth > Sign In / Providers: turn OFF "Allow new users to sign up" (currently disable_signup=false).
- Auth > Email Templates > Magic Link: include `{{ .Token }}` so the email carries the 6-digit code.
- Free plan built-in email sender is rate limited (a few emails per hour); fine for one user.
- Export data before the free project pauses (about 7 days idle after Nov 30).

## Seeding Wendy's days
Nov 1 is seeded (supabase/seed_2026-11-01.sql). For later days edit supabase/seed_template.sql VALUES rows (exercise keys "0".."8", checks walk/no_alcohol/read/clip, steps, water_oz, protein_g, note) and run via execute_sql. The row there is a placeholder.

## Sign-in with the default template (SW v4)

1. Headless: `node tests/auth-link.test.js` passes.
2. Laptop: request a link, tap it. App opens signed in; address bar shows `https://chiefpep.github.io/hard30-tracker/` with no `#access_token` or `?code`.
3. iPhone Home Screen app: request a link from inside the app. In Mail, long-press the link, Copy (do not tap). Paste in the app, Sign in. Signed in inside the Home Screen app.
4. Paste a link that was already tapped: app says it is used up or expired and to request a new one.
5. Paste garbage: "does not look like a sign-in link".
6. After deploy, confirm the SW cache is `h30-shell-v6` (DevTools > Application > Cache Storage) and `score.js` loads.

## Other workout

`node tests/workout.test.js` covers: alt_workout with no exercises counts as the workout and, with the other Hard 30 items met, the day is done; a finished Daily 15 day is unchanged; one round alone is not completion; a soft-deleted day scores as empty and restore keeps alt_workout; later patches merge checks so alt_workout, the note, counters, and unknown keys stay.

Browser check (local page, signed-in client stubbed, no write to the live project): Nov 10 with alt_workout and zero exercises shows the toggle on, "Workout: other workout (not Daily 15)", and a teal calendar day. Nov 4 shows "Workout: Daily 15" and stays blue even if the toggle is also turned on. Turning the toggle off sends only `{checks:{alt_workout:false}}`. A water tap and a walk edit leave the note and the flag alone. Nov 5 still reads as Daily 15 because that row's exercise keys were not changed.
