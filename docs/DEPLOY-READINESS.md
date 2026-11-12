# GOODLIFE Radio 254 - Deployment Readiness Audit Report

**Date of Audit:** 2026-11-12  
**Target Codebase:** GOODLIFE Event Tickets & Radio (`goodlife-event-tickets`)  
**Auditor Mode:** Verification Audit & Hardening Remediation  

---

## 1. Branch State & Git Integration
- **Branch Topology:**
  - `phase-1-timetable` (commit `49ba29d`)
  - `phase-2-live-handover` (commit `18f4ca1`)
  - `phase-3-listener-experience` (commit `1778184`)
  - `phase-4-interaction` (commit `c529a0b`)
  - `phase-5-ops-money` (current active branch)
  - `master` (commit `4f457e2`)
- **Stacking Status:**
  - Phases 1 through 5 are stacked linearly: Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5.
  - Zero git merge conflicts.
- **Working Tree State:**
  - All Phase 5 code, migrations, tests, and configuration are consolidated on branch `phase-5-ops-money`.

---

## 2. Type Check, Lint, Build & Verification Suite Results

### A. TypeScript Type Check (`npx tsc --noEmit`)
- **Status:** **PASS**
- **Result:** `0 errors`. Full codebase typecheck passed completely.

### B. Linter (`npm run lint` / `eslint .`)
- **Status:** **BLOCKED / PRE-EXISTING HARNESS ERROR**
- **Result:** `ESLint: 9.39.1 - Error: Failed to patch ESLint because the calling module was not recognized (rushstack/eslint-patch)`
- **Detail:** ESLint 9 is installed with legacy `@rushstack/eslint-patch`, causing `npm run lint` CLI to fail on start. As noted in `AGENTS.md`, `eslint.ignoreDuringBuilds: true` is configured in `next.config.ts`, so lint does not gate production build.

### C. Production Build (`npm run build`)
- **Status:** **PASS (VERIFIED GREEN)**
- **Result:** `Compiled successfully in 46s. Generating static pages (117/117)`. All 117 dynamic and static routes compiled with zero errors.
- **Investigation & Resolution:**
  - The previous build failure (`Can't resolve '.../app/api/og/radio/route.tsx'`, etc.) was diagnosed as a stale `.next/` and `tsconfig.tsbuildinfo` build cache (a known issue documented in `AGENTS.md`: *"A stale `.next/` crashes the build... `npm run clean` then `npm run build` fixes it"*).
  - All route files were verified tracked in git (`git ls-files`).
  - After removing the stale `.next` cache directory and `tsconfig.tsbuildinfo`, Next.js 15 App Router production build succeeded cleanly.

### D. Verification Test Suite (`tests/*.check.ts`)
- Executed all 62 standalone verification test suites with `node_modules/.bin/tsx.cmd`:
- **Result:** **62/62 suites PASS (0 skipped, 0 failing).**
  - Core ticketing invariants: `never-invent-prices.check.ts` (PASS), `public-state.check.ts` (PASS), `phone.check.ts` (PASS), `settlements.check.ts` (PASS), `budget.check.ts` (PASS), `mpesa-qr.check.ts` (PASS).
  - Radio & security suites: `admin-routes-guarded.check.ts` (PASS), `admin-security-hardening.check.ts` (PASS), `radio-auth.check.ts` (PASS), `radio-lifecycle.check.ts` (PASS), `radio-tips.check.ts` (PASS), `radio-fallback.check.ts` (PASS), `admin-roles.check.ts` (PASS), `radio-shoutouts.check.ts` (PASS).

---

## 3. Database Migrations Audit

All migrations are located in `migrations/radio/` with sequential numbering:
1. `migrations/radio/20261115_01_radio_schedule_tables.sql` (Phase 1)
2. `migrations/radio/20261115_02_phase2_live_handover.sql` (Phase 2)
3. `migrations/radio/20261115_03_phase4_interaction.sql` (Phase 4 - moved from scripts)
4. `migrations/radio/20261115_04_phase5_ops_money.sql` (Phase 5 - moved from scripts)

| File | Content | Additive? | Idempotent? | Locks / Table Rewrites? |
|---|---|---|---|---|
| `20261115_01_radio_schedule_tables.sql` | `CREATE TABLE IF NOT EXISTS presenters, shows, show_slots` | YES | YES (`CREATE TABLE IF NOT EXISTS`, `INDEX IF NOT EXISTS`) | None. Brand new radio tables. Zero overlap with ticketing. |
| `20261115_02_phase2_live_handover.sql` | `ALTER TABLE presenters, show_slots, radio_recordings ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS radio_connection_log, presenter_applications` | YES | YES (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) | None. Affects only radio tables. |
| `20261115_03_phase4_interaction.sql` | `CREATE TABLE IF NOT EXISTS radio_shoutouts, radio_polls, radio_poll_options, radio_poll_votes, radio_contests, radio_contest_entries, radio_reminders` | YES | YES (`CREATE TABLE IF NOT EXISTS`, `INDEX IF NOT EXISTS`) | None. Independent radio interaction tables. |
| `20261115_04_phase5_ops_money.sql` | `CREATE TABLE IF NOT EXISTS radio_tips, radio_sponsors, radio_audit_logs; ALTER TABLE presenters ADD COLUMN IF NOT EXISTS staff_id` | YES | YES (`IF NOT EXISTS`) | None. Additive only. |

- **Dry-Run Verification:** Executed `npm run migrate:radio -- --dry-run`. All 4 migration files parsed and validated successfully against Neon target.
- **Table Isolation Guarantee:** Zero SQL touches or acquires locks on `events`, `tickets`, `event_details`, `pending_payments`, `pos_sales`, `pos_sale_items`, `customer_tabs`, or `vendors`.

---

## 4. Environment Variables Audit

All required variables are now documented in `.env.example` (names and documentation only):

| Variable Name | Required Service | Fails Closed Without It? | Present in `.env.example`? |
|---|---|---|---|
| `DATABASE_URL` | Vercel, Daemon | YES (App cannot query database) | YES |
| `APP_URL` | Vercel | NO (Falls back to localhost/canonical checks) | YES |
| `ADMIN_PASSWORD` | Vercel | YES (Returns 500 "Server misconfiguration") | YES |
| `ADMIN_SESSION_SECRET` | Vercel | YES (Falls back to `ADMIN_PASSWORD`, then fails closed) | YES |
| `PRESENTER_SESSION_SECRET` | Vercel | YES (Middleware & login return 401/500) | YES |
| `SCANNER_SESSION_SECRET` | Vercel | YES (Fails closed without salt) | YES |
| `VENDOR_SESSION_SECRET` | Vercel | YES (Fails closed without salt) | YES |
| `RADIO_DAEMON_SECRET` | Vercel, Daemon | YES (HMAC machine route rejects requests with 401) | YES (Aliases supported: `GOODLIFE_RADIO_SECRET_KEY`, `RADIO_BRIDGE_SECRET`, `RADIO_DAEMON_SECRET`) |
| `CRON_SECRET` | Vercel | YES (All 4 cron routes reject with 401/500) | YES |
| `RADIO_STREAM_URL` | Vercel | NO (Web player falls back to default stream) | YES |
| `RADIO_STREAM_HIFI_URL` | Vercel | NO (Hi-Fi toggle falls back to main stream) | YES |
| `RADIO_UPSTREAM_URL` | Vercel | NO (Playout telemetry displays offline fallback) | YES |
| `PAYHERO_USERNAME` | Vercel | YES (PayHero STK push fails closed) | YES |
| `PAYHERO_PASSWORD` | Vercel | YES (PayHero STK push fails closed) | YES |
| `PAYHERO_CHANNEL_ID` | Vercel | YES (PayHero STK push fails closed) | YES |
| `PAYHERO_CALLBACK_TOKEN` | Vercel | **YES in production** (Returns 500 if unset when `NODE_ENV=production`) | YES |
| `PAYHERO_MIN_BALANCE` | Vercel | NO (Defaults to 50 KES float) | YES |
| `WHATSAPP_GATEWAY_URL` | Vercel, Daemon | NO (WhatsApp messaging silently logs warning) | YES |
| `WHATSAPP_API_KEY` | Vercel, Daemon | NO (Only sent if configured) | YES |
| `WHATSAPP_SESSION_ID` | Vercel, Daemon | NO (Defaults to "default") | YES |
| `OPERATOR_WHATSAPP_NUMBERS` | Vercel | NO (Operator notifications skipped) | YES |
| `R2_ACCOUNT_ID` | Vercel, Daemon | YES (Archive & R2 uploads fail) | YES |
| `R2_ACCESS_KEY_ID` | Vercel, Daemon | YES (R2 uploads fail) | YES |
| `R2_SECRET_ACCESS_KEY` | Vercel, Daemon | YES (R2 uploads fail) | YES |
| `R2_RADIO_BUCKET` | Vercel, Daemon | YES (R2 uploads fail) | YES |
| `R2_RADIO_PUBLIC_URL` | Vercel, Daemon | YES (Audio URLs cannot be resolved) | YES |

---

## 5. Payments Integrity & Isolation

1. **Callback Hardening:**
   - In `app/api/payhero/callback/route.ts`: If `PAYHERO_CALLBACK_TOKEN` is unset in `production`, the route immediately fails closed with HTTP 500 (`"Server misconfiguration: PAYHERO_CALLBACK_TOKEN required in production"`).
2. **Strict Reference Routing Isolation:**
   - Ticket payments: `GL-` prefix.
   - Tab payments: `TABPAY_` prefix.
   - Radio Tips: `TIP-` prefix.
   - When a reference begins with `TIP-`, execution branches immediately into `fulfillRadioTip()` or `markRadioTipFailed()`. It returns early (`NextResponse.json(...)`) and never touches `pending_payments` or ticket fulfillment logic.
3. **Core Ticketing Files Untouched:**
   - `app/api/payhero/initialize/route.ts`: 0 diff lines.
   - `lib/payhero.ts`: 0 diff lines.
   - `lib/payhero-fulfill.ts`: 0 diff lines.
   - `lib/payhero-alerts.ts`: 0 diff lines.

---

## 6. Authentication & Boundary Verification

1. **Legacy Admin Cookie Bypass Removed:**
   - `lib/admin-session.ts`: `if (token === "true") return null;`
   - `middleware.ts`: legacy `"true"` cookie branch completely removed.
   - Tested and verified in `tests/admin-security-hardening.check.ts`.
2. **Fail-Closed Secrets:**
   - `lib/admin-session.ts` fails closed if neither `ADMIN_SESSION_SECRET` nor `ADMIN_PASSWORD` is set.
   - `lib/scanner-auth.ts` and `app/api/scanner/auth/route.ts` fail closed if `SCANNER_SESSION_SECRET` is unset.
   - `lib/vendor-tab-auth.ts` and `app/api/vendor/auth/route.ts` fail closed if `VENDOR_SESSION_SECRET` is unset.
3. **Presenter Boundary Isolation:**
   - `goodlife_presenter_session` cookie grants access only to `/presenter/*` and `/api/presenter/*`.
   - Access to `/admin/*`, `/vendor/*`, `/scanner/*`, and `/api/admin/*` explicitly rejects presenter sessions.

---

## 7. Hardcoded Secrets & Salt Audit

1. **DecksConnectCard.tsx:**
   - Station-wide password (`goodlife254dj`) was completely removed. Presenters are instructed to use their personal `gl_live_<hex>` key.
2. **Fallback Salt Check:**
   - Zero fallback salts exist in production application paths.
3. **Machine API Secret Alignment:**
   - `lib/radio/internal-auth.ts` accepts `GOODLIFE_RADIO_SECRET_KEY || RADIO_BRIDGE_SECRET || RADIO_DAEMON_SECRET`, ensuring seamless alignment with the Python daemon.

---

## 8. Public Data & Privacy Audit

1. **Phone Masking & Database Rate Limits:**
   - Public endpoint `/api/radio/shoutouts` never selects or exposes `sender_phone`.
   - Presenter moderation endpoint `/api/presenter/shoutouts` returns masked phone (`0712***678`).
   - Rate limiting on `/api/radio/shoutouts` is backed by database queries (`SELECT COUNT(*) FROM radio_shoutouts WHERE sender_hash = $1 AND created_at > ...`).
2. **Stream Keys & Passwords:**
   - Stream keys are shown in full only once on generation.
   - Database stores only SHA-256 hash and 16-character preview prefix.
   - `/api/presenter/me` strips `password_hash` before returning user data.

---

## 9. Playout & Streaming Verification

1. **Unit & Integration Logic:**
   - Handover state machine, overrun kick, disconnect grace, and connect auth verified with automated check scripts.
2. **Live Ingest (Harbor Live DJ):**
   - **NOT VERIFIED ON HARDWARE:** No physical DJ encoder (VirtualDJ/Mixxx) or live hardware audio interface was tested in a staging or production broadcast run. Verified strictly through architecture contracts, unit tests, and shell simulation scripts (`scripts/test-stream-encoder.sh`).
3. **VPS Guide:**
   - `home-server/DEPLOY-VPS.md` documents deployment on Ubuntu 24.04 VPS with Icecast, Liquidsoap, and Docker daemon. Zero local LAN IPs remain in application code.

---

## 10. Operations, Crons & Rollback Plan

1. **Registered Vercel Crons (`vercel.json`):**
   - `/api/cron/radio-schedule` @ `0 0 * * *` (Daily schedule window generation)
   - `/api/cron/radio-reminders` @ `*/5 * * * *` (WhatsApp show notifications)
   - `/api/cron/radio-drops` @ `0 * * * *` (Hourly station drops sync)
   - `/api/cron/radio-health-monitor` @ `*/5 * * * *` (Stream & presenter health watchdog)
2. **Fail-Closed Crons:**
   - All 4 cron endpoints return HTTP 500 when `CRON_SECRET` is unset, and HTTP 401 when unauthorized.
3. **Rollback Safety:**
   - All migrations are strictly additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
   - If a rollback is needed, Vercel deployment can be rolled back to the previous release with zero database rollbacks required.

---

## Deploy Readiness Scorecard

| Area | Status | Evidence |
|---|---|---|
| **Git Stacking & Branches** | **Ready** | Phases 1–5 linearly stacked on `phase-5-ops-money`. Zero conflicts. |
| **Verification Test Suite** | **Ready** | `tests/*.check.ts` (62/62 suites PASS, 0 failures). |
| **TypeScript Typecheck** | **Ready** | `npx tsc --noEmit` exited 0 errors. |
| **Production Build (`next build`)** | **Ready** | Clean build compiled 117/117 routes successfully with zero errors. |
| **Database Migrations** | **Ready** | All 4 migrations in `migrations/radio/`; dry-run validated; additive only. |
| **Payment Isolation** | **Ready** | Core ticket routes untouched; `TIP-` references segregated; callback fails closed. |
| **Authentication & RBAC** | **Ready** | Legacy bypass deleted; fail-closed secrets; role gating enforced. |
| **Secrets & Hardcoding** | **Ready** | DecksConnectCard cleaned; zero fallback salts in application logic. |
| **Public Data & Privacy** | **Ready** | Phone numbers masked/omitted; password & key hashes stripped. |
| **Cron & Operational Safety** | **Ready** | All 4 crons in `vercel.json`; guarded by `CRON_SECRET`; 30m alert cooldown. |
| **Live Playout & Streaming (Harbor Ingest)** | **Not verified** | No live hardware/software DJ encoder (Mixxx, VirtualDJ) tested on live broadcast. |
| **ESLint Harness** | **Needs work** | ESLint 9 / rushstack compatibility issue prevents CLI lint script execution. |

---

## Final Recommendation: GO FOR STAGING / PREVIEW DEPLOY

The codebase is hardened, 100% typecheck clean, production build green across all 117 routes, with all 62 verification suites passing.

### Required Steps Before Promoting to Production Traffic:
1. **Set Production Environment Secrets in Vercel:**
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `PRESENTER_SESSION_SECRET`
   - `SCANNER_SESSION_SECRET`
   - `VENDOR_SESSION_SECRET`
   - `CRON_SECRET`
   - `PAYHERO_CALLBACK_TOKEN`
   - `RADIO_DAEMON_SECRET` (matching VPS daemon)
2. **Execute Database Migrations on Neon:**
   - Run `npm run migrate:radio` against the target database branch.
3. **Hardware Encoder Soundcheck:**
   - Perform a live 5-minute soundcheck with a real DJ software encoder (VirtualDJ, Mixxx, or BUTT) to verify audio buffer stability through Icecast harbor.
