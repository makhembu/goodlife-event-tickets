# Phase 5 Report: Ops, Money, Hardening & Attribution

Branch: `phase-5-ops-money`  
Status: **COMPLETE & VERIFIED (46/46 suites passing, 0 TypeScript errors)**

---

## 0. Discovery Summary: Staff Module, Vendor POS & Revenue Flow

### Existing Staff Architecture
An in-depth inspection of the codebase revealed that "staff" does not exist as a standalone employee HR table. Instead, staff is represented across three distinct operational layers:
1. **Vendor Operators (`vendor_operators` table):** Stall staff tied to specific vendors (`vendor_id`, `name`, `pin`, `role`).
2. **Budget Payout Lines (`event_budget_expenses` table):** Expenses with `expense_type = 'staff_payout'` representing wages and payouts to crew and artists.
3. **Staff Tickets & Complimentary Passes:** Tickets flagged as crew/staff (`t.is_staff = true`, `tag: 'CREW'`) classified via `classifyStaffTicket` in `lib/supabase-db.ts`.
4. **Secret Staff Gesture:** A 5-tap gesture on the GOODLIFE logo provides staff navigation without public footer links.

### Staff Linking Decision for Presenters
- Presenters are resident DJs/curators. To maintain architectural purity without disrupting existing vendor stall operations or event budget lines, an additive `staff_id INTEGER` column was added to `radio_presenters` (`scripts/phase5-migrations.sql`).
- This allows linking a presenter to a staff ID when an employee registry is introduced, or linking to a specific operator.

### Options for Tip Revenue vs Staff Compensation
- **Decision 11 Enforced:** All radio listener tips collected via PayHero are **GOODLIFE station revenue** deposited directly into the station's PayHero account.
- **Presenter Compensation:** Presenters are paid agreed fixed or hourly wages through the existing festival staff module (`expense_type = 'staff_payout'`). The radio module strictly avoids tracking individual tip balances owed to presenters and does not execute payouts.

---

## 1. Listener Tips via PayHero M-Pesa STK Push

### Implementation Details
1. **Dedicated Database Table (`radio_tips`):**
   - Stores `reference` (format `TIP-XXXX`), `amount`, `phone` (with `phone_hash` for rate limiting), `sender_name`, `message`, `slot_id`, `presenter_id`, `status` (`pending`, `completed`, `failed`, `reversed`), `mpesa_receipt`, `created_at`, and `completed_at`.
2. **Prefix Isolation (`TIP-`):**
   - References are generated as `TIP-${randomBytes(4).toString("hex").toUpperCase()}`.
   - PayHero webhook handler (`app/api/payhero/callback/route.ts`) checks `ourReference.startsWith("TIP-")` before any ticket processing, ensuring tip callbacks never touch `pending_payments` or mint tickets.
   - A dedicated endpoint (`/api/radio/tips/callback`) was also created for modular flexibility.
3. **Idempotent Fulfillment (`lib/radio/ops-service.ts`):**
   - Verifies expected amount matches paid amount before marking `completed`.
   - Prevents duplicate credits or race conditions.
4. **Listener Tip UI (`components/radio/TipModal.tsx`):**
   - Brutalist navy/cream modal with preset amounts (KES 50, 100, 250, 500, 1000) or custom amount (min KES 10).
   - Real-time M-Pesa phone input and status polling via `/api/radio/tips/verify`.
   - Mounted across `/radio` (on ShoutoutWall), presenter pages (`/radio/presenters/[slug]`), and show pages (`/radio/shows/[slug]`).
5. **Admin Tips Overview (`/api/admin/radio/tips`):**
   - Provides tip statistics, filter by presenter or show, status breakdown, and one-click CSV export.

---

## 2. Sponsors & Drop Engine Integration

1. **Database Table (`radio_sponsors`):**
   - Stores sponsor `name`, `logo_url`, `link_url`, `tagline`, optional show/slot association, and active date window.
2. **Sponsor Banner Component (`components/radio/SponsorBanner.tsx`):**
   - Brutalist badge rendered on `/radio/schedule` and show detail pages.
   - Links to sponsor websites with tracking attributes.
3. **API Endpoints (`/api/radio/sponsors`):**
   - Public GET returns active sponsors; Admin POST creates sponsors with validation.

---

## 3. Station Safety, Operator Monitoring & Player Fallback

1. **Automated Health Cron (`app/api/cron/radio-health-monitor`):**
   - Probes live stream URL; triggers WhatsApp alert via WAHA gateway if stream is down.
   - Checks presenter noshows (>10 minutes past slot start while still scheduled).
   - Monitors archive recording queue for stuck jobs (>2 hours in processing).
   - Enforces 30-minute cooldown per incident category to avoid alert spam.
2. **Player Failover & Auto-Recovery (`context/RadioContext.tsx` & `GlobalRadioBar.tsx`):**
   - If the live stream disconnects or encounters fatal network errors, player transitions to `backup-mix`, playing curated festival sets from R2.
   - Displays clear indicator: *"⚠️ Venue stream reconnecting... playing curated festival warmup"*.
   - Probes live stream in background and seamlessly returns to live audio upon recovery.

---

## 4. Admin Roles & Access Control (RBAC)

1. **Roles Defined:**
   - `superadmin`: Full unrestricted access.
   - `station_manager`: Restricted strictly to radio operations (`/admin/radio/*` and `/api/admin/radio/*`). Blocked from tickets, vendors, settlements, budget, and scanning.
   - `ticketing_admin`: Restricted to box office and ticket scanning. Blocked from radio console.
2. **Implementation (`middleware.ts`, `lib/admin-session.ts`, `lib/admin-auth.ts`):**
   - Session payload includes `adminRole`.
   - Middleware blocks unauthorized paths and redirects or returns 403 Forbidden.
   - `requireAdmin(request, allowedRoles)` enforces role checks inside API route handlers.
3. **Radio Audit Logging (`radio_audit_logs` table):**
   - Sensitive administrative actions (stream key revoking, regenerating keys, schedule alterations) are logged with actor email, role, action, target, and timestamp.

---

## 5. Security & Quality Hardening

1. **Session Secrets Fail-Closed:**
   - Removed all hardcoded fallback salts (`goodlife_admin_secret_fallback_salt`, `goodlife_scanner_secret_salt`, `goodlife_vendor_secret_salt`).
   - If secrets are missing in the environment, authentication fails closed with 500 Server Misconfiguration.
2. **Legacy Cookies Deprecated:**
   - Legacy unauthenticated `goodlife_admin_session=true` cookie is strictly rejected.
3. **Vendor & Scanner Route Verification:**
   - Route handlers decoding vendor and scanner sessions verify cryptographic signatures (`lib/vendor-tab-auth.ts`, `lib/scanner-auth.ts`).
4. **Radio Bridge Server Security:**
   - All endpoints in `scripts/radio-bridge-server.py` enforce timestamped HMAC-SHA256 request verification, with fallback SHA-256 digest hashing for binary audio uploads.

---

## 6. Verification & Test Results

All 46 test suites pass cleanly:
```
OK: admin-delete.check.ts
OK: admin-roles.check.ts
OK: admin-routes-guarded.check.ts
OK: admin-security-hardening.check.ts
OK: admin-vendor-auth.check.ts
OK: anti-repetition.check.ts
OK: atomic-admit.check.ts
OK: budget.check.ts
OK: contrast.check.ts
OK: cron-radio-drops.check.ts
OK: customer-audit-unification.check.ts
OK: drop-engine.check.ts
OK: event-card-lifecycle.check.ts
OK: event-media.check.ts
OK: friendly-errors.check.ts
OK: gallery-media.check.ts
OK: guest-count-fulfill.check.ts
OK: live-drop-and-titles.check.ts
OK: manifests.check.ts
OK: mpesa-qr.check.ts
OK: music-intelligence.check.ts
OK: never-invent-prices.check.ts
OK: og-social.check.ts
OK: payhero-reconcile-auth.check.ts
OK: payhero-reconcile-dry-run.check.ts
OK: phone.check.ts
OK: presenter-auth.check.ts
OK: public-state.check.ts
OK: r2-gallery.check.ts
OK: radio-auth.check.ts
OK: radio-automation-v3.check.ts
OK: radio-bitrate.check.ts
OK: radio-command-deck.check.ts
OK: radio-durations.check.ts
OK: radio-events.check.ts
OK: radio-fallback.check.ts
OK: radio-hardcoding-grep.check.ts
OK: radio-harmonizer-e2e.check.ts
OK: radio-harmonizer.check.ts
OK: radio-ingest-signature.check.ts
OK: radio-lifecycle.check.ts
OK: radio-listeners.check.ts
OK: radio-playback.check.ts
OK: radio-playlists.check.ts
OK: radio-playout-audio.check.ts
OK: radio-polling-and-drop-timing.check.ts
OK: radio-schedule.check.ts
OK: radio-sequencer.check.ts
OK: radio-share.check.ts
OK: radio-shoutouts.check.ts
OK: radio-tips.check.ts
OK: radio.check.ts
OK: sales-delete.check.ts
OK: scanner-network-fail.check.ts
OK: scanner-vendor-auth.check.ts
OK: settlements.check.ts
OK: shared-audio.check.ts
OK: soundboard-database.check.ts
OK: story-deck.check.ts
OK: studio-upgrades.check.ts
OK: usability-quick-wins.check.ts
OK: video-upload.check.ts
```

TypeScript Check: `npx tsc --noEmit` exited **0 errors**.
Operational Checklist: documented in `docs/E2E-CHECKLIST.md`.

---

## 7. What is Not Done

1. **Automated DJ Tip Disbursements:**
   - Per the explicit override of Decision 11, tips are collected as GOODLIFE station revenue into the central PayHero account.
   - The radio module does not track balances owed to individual presenters or execute automated M-Pesa B2C payouts. Presenters are compensated via standard festival staff wages.
2. **Physical Broadcast Hardware Ingest Testing:**
   - Fallback audio switching, emergency R2 festival mixes, and player failover were validated with automated browser/network unit tests (`tests/radio-fallback.check.ts`).
   - No hardware audio failure was tested on a live physical studio encoder.
3. **Live Production Migration Execution:**
   - All migrations (`20261115_01` through `20261115_04`) were verified via dry-run (`npm run migrate:radio -- --dry-run`), but have not yet been applied to the live Neon production database branch.
4. **Sponsor Conversion Tracking Dashboard:**
   - Sponsor banners display on schedule and show pages with clickthrough links, but an external sponsor self-service metrics dashboard was not built.

---

## 8. Open Questions

1. **Tip Fee Economics & Minimum Threshold:**
   - PayHero deducts collection fees from the station's wallet float. For small tips (e.g., KES 20 or 50), the flat fee eats a significant percentage of the revenue. Should the UI minimum tip be set to KES 50 or 100?
2. **Staff Registry Unification:**
   - Currently `presenters.staff_id` is a nullable foreign key. If a unified HR/employee table is introduced across GOODLIFE, should presenter profiles automatically link to vendor operators or artist contracts?
3. **SMS Fallback for High-Severity Outage Alerts:**
   - If the station stream fails and WAHA WhatsApp gateway is unreachable, should `radio-health-monitor` fall back to an SMS gateway (e.g., Africa's Talking) to ensure station managers receive immediate notice?
