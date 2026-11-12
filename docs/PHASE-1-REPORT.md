# GOODLIFE Radio 254: Phase 1 Implementation Report
**Phase:** 1 - Timetable & Presenter Login  
**Branch:** `phase-1-timetable`  
**Date:** November 2026  
**Status:** Complete & Fully Verified

---

## 1. Executive Summary

1. Built a complete, production-ready timetable and presenter management system for GOODLIFE Radio 254.
2. Created an idempotent, transactional migration framework (`scripts/migrate.js`) and database schema for `presenters`, `shows`, and `show_slots`.
3. Implemented a 30-day rolling recurrence engine in `lib/radio/schedule-generator.ts` with Africa/Nairobi (UTC+3) calendar math and single-channel overlap protection.
4. Created the public weekly schedule grid at `/radio/schedule` with instantaneous EAT/Local time toggle, day filters, and status highlights.
5. Delivered show detail pages (`/radio/shows/[slug]`) and presenter profiles (`/radio/presenters/[slug]`) with full SEO and JSON-LD structured data.
6. Implemented RFC 5545 iCalendar (`.ics`) subscription feeds per show for native calendar integration.
7. Shipped the isolated Presenter Studio portal (`/presenter/login`, `/presenter/dashboard`) with HMAC-SHA256 sessions, bcrypt password hashing, and brute-force lockout.
8. Added a full Schedule Management console into `/admin/radio` with show programming, presenter roster, temporary password generation, and slot reassignment.
9. Fixed two critical pre-existing admin bugs: the 405 Method Not Allowed error on broadcast saves and the mode switcher rejecting `live` broadcasts.
10. Verified with 100% passing tests: `radio-schedule.check.ts` (19/19), `presenter-auth.check.ts` (19/19), static route guard audit (242/242 handlers), and clean `tsc --noEmit`.

---

## 2. Architecture Diff

| Component | Before Phase 1 | After Phase 1 |
|---|---|---|
| **Programming Timetable** | None. Listeners had no way of knowing what was airing or scheduled. | Complete weekly grid at `/radio/schedule`, "Now / Up Next" persistent strip in `GlobalRadioBar`, and link from `/radio`. |
| **Recurrence Engine** | None. Shows had to be manually tracked outside the application. | 30-day rolling generator (`lib/radio/schedule-generator.ts`) supporting daily, weekly, biweekly, and one-off shows with Africa/Nairobi time conversion. |
| **Calendar Sync** | None. | Dynamic RFC 5545 `.ics` export per show (`/api/radio/shows/[slug]/calendar.ics`). |
| **Presenter Accounts** | None. Single shared admin password controlled the entire site. | Dedicated `presenters` table with bcrypt hashes, show-once temp passwords, and force-change on first login. |
| **Presenter Auth & Session** | None. Presenters had no portal or authentication. | Edge middleware + route guard (`lib/presenter-auth.ts`, `lib/presenter-session.ts`) using HMAC-SHA256 signed `goodlife_presenter_session` cookie. |
| **Role Isolation** | Admin cookie only. | Strict cryptographic role separation: presenter sessions are explicitly rejected by `/admin/*`, `/vendor/*`, and `/scanner/*`. |
| **Admin Broadcast Save** | `POST /api/admin/radio/broadcast` returned HTTP 405. | Aliased `POST` to `PUT`, allowing seamless broadcast title and status saves from the dashboard. |
| **Admin Mode Switcher** | `POST /api/admin/radio/mode` only allowed `autodj` and `mania`, rejecting `live`. | Expanded mode validation to accept `live`, `curated`, `mania`, and `autodj`. |

---

## 3. Database Changes & Migration Framework

### Migration Framework
- **File:** `scripts/migrate.js`
- **CLI Command:** `npm run migrate:radio` (or `node scripts/migrate.js [--dry-run]`)
- **Safety:** Transactional (`BEGIN` ... `COMMIT` / `ROLLBACK`). Scans and executes migrations in numerical order. Supports `--dry-run` to preview all pending SQL statements without applying changes to the database.

### Schema Migration
- **File:** `migrations/radio/20261115_01_radio_schedule_tables.sql`
- **Tables Created:**
  1. `presenters`:
     - Columns: `id`, `name`, `slug`, `email`, `dj_name`, `bio`, `avatar_url`, `instagram_handle`, `twitter_handle`, `mixcloud_url`, `soundcloud_url`, `password_hash`, `status` (`active`, `inactive`, `suspended`), `must_change_password`, `failed_login_attempts`, `locked_until`, `created_at`, `updated_at`.
     - Constraints: Unique `slug`, unique `email`.
  2. `shows`:
     - Columns: `id`, `title`, `slug`, `tagline`, `description`, `genre_tags` (text array), `poster_url`, `primary_presenter_id` (FK to `presenters`), `recurrence_pattern` (`weekly`, `biweekly`, `daily`, `none`), `day_of_week` (0=Sun, 6=Sat), `start_time_eat` (TIME), `duration_minutes` (INT), `status` (`active`, `hiatus`, `archived`), `created_at`, `updated_at`.
  3. `show_slots`:
     - Columns: `id`, `show_id` (FK to `shows`), `presenter_id` (FK to `presenters`), `substitute_presenter_id` (FK to `presenters`, nullable for covers), `start_time` (TIMESTAMPTZ, UTC), `end_time` (TIMESTAMPTZ, UTC), `status` (`scheduled`, `live`, `completed`, `cancelled`), `title_override`, `notes`, `created_at`, `updated_at`.
     - Indexing: `idx_show_slots_timerange` on `(start_time, end_time)` where `status != 'cancelled'`.

---

## 4. Environment Variables & Security Properties

| Variable | Usage | Security Behavior |
|---|---|---|
| `PRESENTER_SESSION_SECRET` | Secret key used for HMAC-SHA256 signing and verification of the `goodlife_presenter_session` cookie. | **Fails closed:** If unset, session issuance throws an error and verification returns `null`. No fallback salt is permitted. |
| `CRON_SECRET` | Bearer token authenticating nightly schedule generation via `/api/cron/radio-schedule`. | **Fails closed:** Timing-safe buffer comparison. Returns 401 if missing or invalid. |

---

## 5. API Route & Auth Matrix

| Route | Method | Auth Guard | Access Role | Description |
|---|---|---|---|---|
| `/api/radio/schedule` | `GET` | Public Allowlist | Public | Returns 7-day schedule window, current on-air slot, and upcoming shows. |
| `/api/radio/shows/[slug]/calendar.ics` | `GET` | Public Allowlist | Public | Emits RFC 5545 iCalendar file for the show and its upcoming slots. |
| `/api/presenter/auth/login` | `POST` | Public Allowlist | Public | Authenticates presenter via email/password; applies 5-attempt rate-limiting lockout; issues signed HTTP-only cookie. |
| `/api/presenter/auth/logout` | `POST` | Public Allowlist | Presenter | Clears `goodlife_presenter_session` cookie. |
| `/api/presenter/auth/change-password` | `POST` | `requirePresenter` | Presenter | Verifies current password, updates bcrypt hash, clears `must_change_password`. |
| `/api/presenter/me` | `GET`, `PATCH` | `requirePresenter` | Presenter | Reads and updates presenter profile, bio, and social media handles. |
| `/api/presenter/slots` | `GET` | `requirePresenter` | Presenter | Lists assigned upcoming and past broadcast slots for the logged-in presenter. |
| `/api/admin/radio/presenters` | `GET`, `POST` | `requireAdmin` | Admin | Lists presenter roster or creates a new presenter with a show-once temporary password. |
| `/api/admin/radio/shows` | `GET`, `POST` | `requireAdmin` | Admin | Lists shows with presenter joins or creates new show programming. |
| `/api/admin/radio/schedule` | `GET`, `POST` | `requireAdmin` | Admin | Queries slots or schedules a manual/one-off slot with overlap validation. |
| `/api/admin/radio/schedule/[id]` | `PATCH`, `DELETE`| `requireAdmin` | Admin | Reassigns substitute DJ, updates times/notes, or cancels a slot. |
| `/api/admin/radio/schedule/generate` | `POST` | `requireAdmin` | Admin | Triggers 30-day slot generator from active show recurrence definitions. |
| `/api/cron/radio-schedule` | `GET`, `POST` | `CRON_SECRET` | System Cron | Automated 30-day rolling timetable maintenance. |
| `/api/admin/radio/broadcast` | `PUT`, `POST` | `requireAdmin` | Admin | Updates broadcast title/state (fixed 405 error by supporting `POST`). |
| `/api/admin/radio/mode` | `POST` | `requireAdmin` | Admin | Switches station playout mode (fixed validation to accept `live` & `curated`). |

---

## 6. UI Implementations

1. **Public Schedule Grid (`/radio/schedule`):**
   - Clean, brutalist navy and cream design (`#142B4C`, `#F3ECE1`, `#C8A54A`).
   - Timezone toggle: Switch effortlessly between Nairobi Time (EAT, UTC+3) and Viewer's Local Time with relative date headers ("TODAY", "TOMORROW").
   - Day tabs (Mon–Sun) with slot counts.
   - Genre filter pills and "SCHEDULED NOW" live pulsating badges.
   - Per-slot cards showing start/end time, duration, show artwork, title, DJ name, substitute cover badges, and direct links to show and presenter pages.

2. **Show Details Page (`/radio/shows/[slug]`):**
   - High-contrast hero banner with show artwork, genre pills, and recurrence badge (e.g. `EVERY FRIDAY AT 20:00 EAT`).
   - Presenter attribution linking directly to presenter profile.
   - "Add to Calendar" button downloading `.ics` file.
   - Upcoming scheduled air dates list.
   - Past archived episodes list.
   - OpenGraph metadata and JSON-LD `RadioSeries` schema.

3. **Presenter Profile Page (`/radio/presenters/[slug]`):**
   - Presenter avatar, DJ title, and full biography.
   - Social links: Instagram, Twitter/X, SoundCloud, Mixcloud.
   - Shows hosted by this presenter.
   - Upcoming live broadcast slots.
   - JSON-LD `Person` schema.

4. **Persistent Player "Now / Up Next" Strip (`components/radio/GlobalRadioBar.tsx`):**
   - Auto-updating header strip mounted directly onto the floating mobile player card and docked desktop player bar.
   - Displays `ON AIR (SCHED): <Show Title> with <DJ Name>` or `UP NEXT: <Show Title> (<Time EAT>)` with a direct link to `/radio/schedule`.
   - Polls every 60 seconds to track live schedule transitions.

5. **Navigation Integration (`app/radio/page.tsx`):**
   - Prominent `TIMETABLE` button placed in the primary radio navigation bar beside the Live / Playlists / Vault views.

6. **Admin Schedule & Roster Management (`components/admin/radio/ScheduleManager.tsx`):**
   - Embedded seamlessly as a new "Schedule" tab in `/admin/radio`.
   - Three operational sub-views:
     - **Timetable Slots:** Filterable by date, displays all upcoming slots, "Generate 30 Days" trigger button, slot cancellation, and quick reassignment of cover/substitute DJs.
     - **Shows Programming:** Create new shows with recurrence pattern, day of week, Nairobi broadcast time, and duration; assign primary presenter; view existing show library.
     - **Presenter Roster:** Add new presenters, assign DJ names and social handles, and copy one-time auto-generated temporary passwords.

7. **Presenter Studio Portal (`/presenter/login` & `/presenter/dashboard`):**
   - Dedicated login screen branded with Goodlife brutalist styling.
   - First-time login detection: Mandatory change password modal if `must_change_password` is flagged.
   - Studio Dashboard: Displays upcoming assigned broadcast slots, past show history, and editable presenter profile details (bio, socials).

---

## 7. Bug Fixes in Existing Code

1. **Broadcast Save HTTP 405 Fix:**
   - `app/api/admin/radio/broadcast/route.ts` previously only exported `PUT`. The dashboard frontend UI performs a `POST` request when saving broadcast parameters. Added `export const POST = PUT;` to resolve the 405 error.
2. **Playout Mode Switcher `live` Rejection:**
   - `app/api/admin/radio/mode/route.ts` previously rejected `live` and `curated`, allowing only `autodj` and `mania`. Expanded validation to cleanly accept `live`, `curated`, `mania`, and `autodj`.
3. **Hardcoded String Grep Violation:**
   - `tests/radio-hardcoding-grep.check.ts` detected a hardcoded domain in `.ics` UID formatting. Refactored `app/api/radio/shows/[slug]/calendar.ics/route.ts` to dynamically resolve domain identity from the request host and environment.

---

## 8. Verification Results

All tests were executed locally against the codebase:

```
> .\node_modules\.bin\tsx.cmd tests/radio-schedule.check.ts
=== Goodlife Radio Schedule & Timezone Checks ===
  ✓ Nairobi 20:00:00 (8 PM EAT) converts to UTC 17:00:00 (5 PM UTC)
  ✓ Nairobi 02:00:00 (2 AM EAT) converts to previous day UTC 23:00:00
  ✓ Nairobi midnight converts to 21:00:00 UTC previous day
  ✓ UTC 17:00 converts back to Nairobi date '2026-11-20'
  ✓ UTC 17:00 converts back to Nairobi dateTime '2026-11-20 20:00:00'
  ✓ Partially overlapping slot is detected as collision
  ✓ Enclosed slot is detected as collision
  ✓ Back-to-back adjacent slot does NOT collide (end == start)
  ✓ Immediately prior adjacent slot does NOT collide (start == end)
  ✓ Weekly show matches Friday on Friday candidate
  ✓ Weekly show rejects Saturday candidate for Friday show
  ✓ Biweekly shows alternate weeks (one true, one false)
  ✓ ICS contains BEGIN:VCALENDAR
  ✓ ICS contains VERSION:2.0
  ✓ ICS contains BEGIN:VEVENT
  ✓ ICS contains DTSTART in Zulu format (Z)
  ✓ ICS contains DTEND in Zulu format (Z)
  ✓ ICS contains SUMMARY with show and presenter
  ✓ ICS ends with END:VCALENDAR

19 passed, 0 failed

> .\node_modules\.bin\tsx.cmd tests/presenter-auth.check.ts
=== Goodlife Presenter Authentication Checks ===
  ✓ hashPresenterPassword produces standard bcrypt hash starting with $2
  ✓ comparePresenterPassword accepts correct password
  ✓ comparePresenterPassword rejects incorrect password
  ✓ comparePresenterPassword rejects empty password
  ✓ signPresenterSession returns token with dot separator
  ✓ verifyPresenterSession successfully parses valid token
  ✓ verified payload preserves presenterId
  ✓ verified payload preserves email
  ✓ verified payload preserves role 'presenter'
  ✓ verified payload preserves djName
  ✓ Tampered signature is rejected
  ✓ Tampered payload with original signature is rejected
  ✓ signPresenterSession throws error when PRESENTER_SESSION_SECRET is unset (fail-closed)
  ✓ verifyPresenterSession returns null when PRESENTER_SESSION_SECRET is unset (fail-closed)
  ✓ Presenter token lacks vendorId and is rejected by Vendor auth
  ✓ Presenter token has role 'presenter' != 'scanner' and is rejected by Scanner auth
  ✓ Presenter token (2 parts) fails Admin cookie 3-part signature format
  ✓ Foreign admin cookie format rejected by verifyPresenterSession
  ✓ Token with role != 'presenter' is rejected by verifyPresenterSession

19 passed, 0 failed

> .\node_modules\.bin\tsx.cmd tests/admin-routes-guarded.check.ts
=== Checking Route Guards Across ENTIRE Codebase (AST Body Inspection) ===
Scanned 146 exported HTTP handlers in app/api/admin. Failed: 0
Scanned 96 exported HTTP handlers in non-admin routes (60 in-handler guarded, 36 explicit public allowlist). Failed: 0
PASS: All 242 exported handlers across the codebase are verified guarded or explicitly allowlisted.

> npx tsc --noEmit
Exit Code: 0 (No TypeScript compilation errors)

> Full Test Suite Run (55 test files)
All 55 verification suites OK. 0 failures.
```

---

## 9. Manual Verification Guide

1. **Database Migration:**
   ```bash
   # Preview migration without touching the database
   node scripts/migrate.js --dry-run
   # Apply migration
   npm run migrate:radio
   ```

2. **Admin Roster & Programming:**
   - Log into `/admin` using your admin credentials.
   - Navigate to `/admin/radio` and select the **Schedule** tab in the sidebar.
   - In **Presenters**, click "Add Presenter" (`DJ Test`, `dj@test.com`). Note the one-time temporary password displayed in the success banner.
   - In **Shows**, click "Add Show" (`The Sunset Groove`, Weekly on Friday at 18:00 EAT, 120 min, assigned to `DJ Test`).
   - Click "Generate 30 Days". Switch to the **Slots** view to verify that slots were automatically scheduled in UTC matching 18:00 EAT every Friday.

3. **Presenter Portal:**
   - Navigate to `/presenter/login`.
   - Log in with `dj@test.com` and the temporary password.
   - The "Change Temporary Password" modal will appear immediately. Enter the current temporary password and set a new password (min 8 chars).
   - In the Presenter Studio Dashboard, observe your assigned upcoming slots and update your bio and Instagram handle.

4. **Public Timetable & Player Integration:**
   - Visit `/radio/schedule`. Toggle between "Nairobi Time (EAT)" and "Local Time". Verify slot timing adjusts according to your local timezone.
   - Click on the show card to view `/radio/shows/the-sunset-groove`. Click "Add to Calendar (.ics)" to download the calendar event file.
   - Click on the presenter name to visit `/radio/presenters/dj-test`.
   - Navigate to `/` or `/events/*` and observe the `GlobalRadioBar` bottom strip showing the scheduled broadcast status with the direct link to `/radio/schedule`.

---

## 10. Phase 2 Handover Notes

Phase 1 provides the complete timetable and presenter identity foundation. Ready for Phase 2:
1. **Liquidsoap Harbor Authentication:** When a presenter connects via Icecast/Harbor (VirtualDJ, Mixxx, BUTT), the playout daemon will send an HMAC-signed request to Next.js with the presenter's stream key to query whether the presenter has a valid slot starting within their connect grace window.
2. **Slot-Aware Handover & Grace Period:** Implement slot-boundary enforcement, 5-minute disconnect grace buffers, and automatic fallbacks to backup mixes if a presenter drops out or overruns.
