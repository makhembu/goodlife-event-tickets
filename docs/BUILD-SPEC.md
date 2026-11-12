# GOODLIFE Radio: Build Spec and Rules

## Reference docs
Read docs/ARCHITECTURE.md and docs/RADIO-PLAN.md before every phase. If the code contradicts them, the code wins: note the difference in the phase report.

## Locked decisions
1. Single playout system: Liquidsoap/Icecast is the one station. The R2 virtual timeline stays only as an automatic emergency fallback. The playout stack must be deployable to a small VPS (home server is not a long-term dependency). Code must not assume the LAN address.
2. The timetable lives in Neon: presenters, shows, show_slots. Liquidsoap asks the Next.js app (via the daemon, HMAC-signed) whether a presenter may connect.
3. Separate presenter accounts (own table, own signed cookie, password hashing). Presenters can never access /admin, /vendor, /scanner or any ticketing/vendor data.
4. Listener interaction is moderated shoutouts/requests (web form plus WhatsApp inbound). No live chat room.
5. Recorded live sets are PRIVATE by default and become public only after presenter/admin approval (music licensing risk).
6. Roster at launch is 6 to 10 presenters. No swap-bidding engine: a presenter requests a cover, an admin approves or reassigns.
7. WAHA is used only for internal operator alerts and presenter pings. No bulk listener broadcasts through WAHA. Listener reminders go through a provider interface that defaults to disabled/dry-run until the official WhatsApp Cloud API is configured.
8. Stream keys are show-once: shown in full once at creation/regeneration; only a hash and a preview prefix (e.g. gl_live_...9f4a) are stored.
9. Default listener audio is low-bitrate (64 to 96 kbps). 192 kbps is an opt-in "Hi-Fi" toggle.
10. Times: store UTC, generate recurrences in Africa/Nairobi (EAT, no DST), display Nairobi by default with a toggle to the viewer's local time.
11. Tips are GOODLIFE revenue paid into the GOODLIFE PayHero account. Presenters are staff and are paid through the existing staff module. The radio app does not track tip balances owed to presenters and does not pay out.
12. Pre-recorded show fallback is a stretch goal, not on the critical path.

## Rules for every phase
- Work on a new git branch named after the phase (e.g. phase-1-timetable). Commit in small logical steps.
- Migrations are additive and idempotent only (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS). Never drop or rewrite existing tables or columns. Existing ticketing, vendor and scanner flows must keep working.
- Do NOT run any migration against a production database. Run them only against a local or branch database, and print the SQL for me to review.
- Never hardcode secrets or fallback salts. Missing secrets must fail closed. List new environment variables by name only, in the phase report.
- New API routes must guard themselves (the /api/radio/* prefix is public by default). State the auth rule for each new route in the report.
- Follow the existing code style, UI style (brutalist navy/cream palette) and test convention (tests/*.check.ts run with tsx).
- Run the type check and every relevant test before finishing. Do not claim something works unless you ran it.
- Keep the UI mobile-first and light on data.
- If a requirement is unclear or something in the code makes it infeasible, say so in the report instead of guessing.
- At the end write docs/PHASE-N-REPORT.md with: what was built (file paths), what changed in the database, new env vars, new routes and their auth, how I test it manually step by step, what was not done and why, and open questions. Then give me a 10-line summary.
