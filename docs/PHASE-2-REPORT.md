# GOODLIFE Radio 254 - Phase 2 Implementation Report: Live Handover & Credentials

## 1. Executive Summary
- Replaced the station-wide shared harbor password with individual, unguessable credentials (`gl_live_<32hex>`).
- Keys are shown in full exactly once at generation/regeneration; database stores only SHA-256 hashes and 16-character preview prefixes.
- Implemented machine-to-machine connect authentication (`POST /api/internal/radio-auth`) enforced with HMAC-SHA256 signatures.
- Liquidsoap 2.1+ integrates dynamically via a shell auth script (`check-harbor-auth.sh`) bridged to the local daemon and Next.js BFF.
- Slot lifecycle state machine automatically sets `broadcast_mode='live'` and stream title on DJ connect with zero admin clicks.
- Built-in handover anti-collision logic blocks incoming warmup presenters from taking over while another DJ is actively on air.
- Overrun grace (5m) kicks overstaying DJs if another show is queued; disconnect grace (5m) prevents dropouts from ending shows.
- Live recordings default to private (`is_public=false`) and require explicit presenter/admin approval before public vault listing.
- Added public talent recruitment (`/radio/apply`) with 24-hour rate limiting and an admin 1-click onboarding approval queue.
- Verified 100% offline with zero regressions: 30 auth tests passed, 20 lifecycle tests passed, and all 45+ codebase checks green.

---

## 2. Architecture Diff: Phase 1 vs. Phase 2

| Feature | Phase 1 (Baseline) | Phase 2 (Live Handover Implemented) |
|---|---|---|
| **Harbor Password** | Shared station password (`goodlife254dj`) exposed in browser cards. | Individual keys (`gl_live_<hex>`), stored as SHA-256 hash. Zero shared secrets in browser. |
| **Connection Auth** | Static string comparison inside `goodlife-station.liq`. | Dynamic query to Next.js via HMAC-signed `POST /api/internal/radio-auth`. |
| **Schedule Enforcement** | None (any DJ could connect anytime and hijack AutoDJ). | Connection allowed only if presenter has a slot live now or within 15-minute warmup window. |
| **Warmup Collision** | Early connect would instantly knock existing playout off air. | Incoming DJ blocked during warmup if another presenter is on air; given exact second to retry. |
| **Slot Lifecycle** | Static rows in DB; no live transition or actual timestamps. | Automatic transitions: `scheduled` -> `live` -> `completed` / `noshow` / `cancelled`. |
| **Overrun Management** | Overrunning presenter plays forever unless manually stopped. | Overrun grace (5m). Liquidsoap kicks source via telnet `harbor_live_dj.stop` when next slot is due. |
| **Disconnect Resilience** | Single packet loss would immediately mark show finished. | 5-minute reconnection grace window. Brief hiccups keep slot `live`; AutoDJ crossfades in interim. |
| **Recordings Storage** | Mastered live sets saved without show or presenter linkage. | Linked to `show_id`, `slot_id`, and `presenter_id`. Default `is_public=false` (private approval workflow). |
| **Now Playing Truth** | Banner displayed whatever was in `radio_settings`. | Derived strictly from `show_slots WHERE status='live'`; reports live DJ only when genuinely connected. |
| **Talent Intake** | Ad-hoc manual DB inserts by administrators. | Public talent application portal at `/radio/apply` with rate limiting and 1-click admin approval. |

---

## 3. Liquidsoap & Daemon Integration Choice

### Liquidsoap 2.1+ Dynamic Auth Architecture
In Liquidsoap 2.1+ / 2.2+, `input.harbor` accepts an `auth` function `(user, password) -> bool`. We implemented dynamic verification via `/usr/local/bin/check-harbor-auth.sh`:
```liquidsoap
def auth_dj(user, password) =
  log("Validating DJ credentials for #{user}...")
  let auth_cmd = "/usr/local/bin/check-harbor-auth.sh " ^ process.quote(user) ^ " " ^ process.quote(password)
  let result = string.trim(process.read(auth_cmd))
  if result == "ALLOW" then
    log("DJ authenticated successfully via GOODLIFE schedule: #{user}")
    true
  else
    log("DJ authentication rejected for #{user}: #{result}")
    false
  end
end
```

### Why this approach was chosen:
1. **Container Isolation & Simplicity:** Liquidsoap runs in AzuraCast's container. The lightweight shell script uses standard `curl` to reach the `goodlife_daemon` on port 8060, avoiding the need for compiled C or Python bindings inside the audio engine container.
2. **Centralized Cryptography:** `goodlife_daemon` handles all HMAC-SHA256 signature calculations and outbound HTTP calls to Next.js, keeping cryptographic keys within the managed Python daemon.
3. **Fail-Closed Guarantees:** If the daemon or Next.js BFF is unreachable, `check-harbor-auth.sh` returns exit code 1 (`DENY`), ensuring no unauthorized audio enters the broadcast path.
4. **Telnet Overrun Kick (`harbor_live_dj.stop`):** Liquidsoap telnet control is enabled on `127.0.0.1:1234`. When Next.js indicates an overrun handover is required, the daemon sends `harbor_live_dj.stop` over telnet to sever the client socket cleanly, allowing the crossfade to AutoDJ and subsequent slot to take air.

---

## 4. Database Changes

Migration file: `migrations/radio/20261115_02_phase2_live_handover.sql`
- Dry-run tested and verified idempotent via `node scripts/migrate.js --dry-run`.

### New Tables
1. **`radio_connection_log`**:
   - `id SERIAL PRIMARY KEY`
   - `presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL`
   - `slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL`
   - `username VARCHAR(100) NOT NULL`
   - `client_ip VARCHAR(64)`
   - `allowed BOOLEAN NOT NULL`
   - `reason VARCHAR(255) NOT NULL`
   - `attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`
   - Indexes on `attempted_at DESC` and `presenter_id`.

2. **`presenter_applications`**:
   - `id SERIAL PRIMARY KEY`
   - `full_name VARCHAR(150) NOT NULL`, `dj_name VARCHAR(150) NOT NULL`
   - `email VARCHAR(255) NOT NULL`, `phone VARCHAR(30) NOT NULL`
   - `bio TEXT NOT NULL`, `show_concept TEXT NOT NULL`, `genre VARCHAR(100)`
   - `sample_mix_url VARCHAR(500) NOT NULL`, `social_links JSONB DEFAULT '{}'::jsonb`
   - `client_ip VARCHAR(64)`
   - `status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))`
   - `admin_notes TEXT`
   - `created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`, `updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`
   - Indexes on `status`, `email`, and `created_at DESC`.

### Altered Tables
- **`presenters`**:
  - Added `stream_key_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`.
- **`show_slots`**:
  - Added `actual_started_at TIMESTAMP WITH TIME ZONE`
  - Added `actual_ended_at TIMESTAMP WITH TIME ZONE`
  - Added `live_stream_title VARCHAR(255)`
  - Added `cover_requested BOOLEAN NOT NULL DEFAULT false`
  - Added `cover_request_reason TEXT`
  - Added `cover_requested_at TIMESTAMP WITH TIME ZONE`
  - Index on `cover_requested` where `cover_requested = true`.
- **`radio_recordings`**:
  - Added `slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL`
  - Added `show_id INTEGER REFERENCES shows(id) ON DELETE SET NULL`
  - Added `presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL`
  - Added `is_public BOOLEAN NOT NULL DEFAULT false`
  - Added `approved_by_id INTEGER`
  - Added `approved_at TIMESTAMP WITH TIME ZONE`
  - Indexes on `presenter_id`, `slot_id`, and `is_public`.

---

## 5. Environment Variables

| Variable | Scope | Default | Description |
|---|---|---|---|
| `RADIO_BRIDGE_SECRET` / `GOODLIFE_RADIO_SECRET_KEY` | Server (Vercel & VPS) | *Required* | Shared HMAC-SHA256 secret for machine routes (`/api/internal/*`). Fails closed (500) if unset. |
| `GOODLIFE_APP_URL` / `APP_URL` | VPS Daemon | `https://goodlife.co.ke` | URL of the Next.js BFF server. |
| `WARMUP_WINDOW_MINUTES` | Server | `15` | Minutes before slot start time that a presenter is allowed to connect for soundcheck. |
| `OVERRUN_GRACE_MINUTES` | Server | `5` | Minutes past slot end time before forced harbor cutoff kicks in (if next slot is queued). |
| `DISCONNECT_GRACE_MINUTES` | Server | `5` | Minutes to wait after presenter drop before slot is marked `completed` and archived. |
| `NOSHOW_MINUTES` | Server | `10` | Minutes after slot start time before an unattended slot is marked `noshow`. |

---

## 6. Route & Authorization Matrix

| Route | Method | Auth Scheme | Description & Failure Mode |
|---|---|---|---|
| `/api/internal/radio-auth` | `POST` | HMAC-SHA256 (`verifyInternalMachineAuth`) | Ingest machine auth for Liquidsoap. Rejects on signature mismatch (403), skew > 300s (401), or missing secret (500). |
| `/api/internal/radio-tick` | `POST` | HMAC-SHA256 (`verifyInternalMachineAuth`) | Automated lifecycle state machine tick from daemon. Rejects unauthorized machine calls (401/403). |
| `/api/cron/radio-schedule` | `GET`/`POST` | Bearer `CRON_SECRET` (`verifyCronAuth`) | 30-day schedule generator + background fallback lifecycle ticker. Fails closed without `CRON_SECRET` (500). |
| `/api/presenter/stream-key/regenerate` | `POST` | Presenter Session Cookie (`requirePresenter`) | Generates new `gl_live_<hex>` key; returns full key once. Rejects unauthenticated callers (401). |
| `/api/presenter/slots/[id]/request-cover` | `POST` | Presenter Session Cookie (`requirePresenter`) | Submits cover request for presenter's own slot. Rejects unauthorized slots (403). |
| `/api/presenter/connection-status` | `GET` | Presenter Session Cookie (`requirePresenter`) | Returns pre-flight connection readiness, timing window, and encoder parameters. |
| `/api/presenter/recordings` | `GET` | Presenter Session Cookie (`requirePresenter`) | Lists presenter's past live recordings (both private and public). |
| `/api/presenter/recordings/[id]/approve` | `POST` | Presenter Session Cookie (`requirePresenter`) | Presenter toggles `is_public=true` to publish set to public archive. Rejects unowned recordings (403). |
| `/api/radio/apply` | `POST` | Public Form (DB Rate Limited) | Public presenter application. Enforces max 3 applications per 24 hours per IP address (429). |
| `/api/admin/radio/applications` | `GET` | Admin Session Cookie (`requireAdmin`) | Admin review queue for incoming presenter applications. |
| `/api/admin/radio/applications/[id]/review` | `POST` | Admin Session Cookie (`requireAdmin`) | Approve/reject application. On approval: auto-provisions presenter, temporary password, and stream key shown once. |
| `/api/admin/radio/presenters/[id]/stream-key` | `POST` | Admin Session Cookie (`requireAdmin`) | Admin can regenerate or revoke presenter's stream key. Takes effect on next connection attempt. |
| `/api/admin/radio/recordings` | `GET` | Admin Session Cookie (`requireAdmin`) | Station-wide recordings vault manager. |
| `/api/admin/radio/recordings/[id]/approve` | `POST` | Admin Session Cookie (`requireAdmin`) | Admin approval or revoking of recording public visibility. |
| `/api/radio/state` | `GET` | Public | Derived live broadcast status (reports on-air DJ only when genuine `show_slots.status='live'`). |
| `/api/radio/live` | `GET` | Public | Audio stream redirect to Icecast 192k MP3 mount. |

---

## 7. Playout & Handover State Machine Specification

```
                         [ scheduled ]
                               |
              +----------------+----------------+
              | (Starts_at + 10m, no connect)   | (Connects during slot or warmup)
              v                                 v
          [ noshow ]                         [ live ]
                                                |
              +---------------------------------+---------------------------------+
              | (Ends_at + 5m overrun grace     | (Harbor disconnects past        | (Admin manual cancel)
              |  AND next slot is queued)       |  5-minute grace window)         |
              v                                 v                                 v
        [ completed ]                     [ completed ]                     [ cancelled ]
      (Harbor Cutoff Kick)              (Archival Triggered)              (Air Vacated)
```

1. **Auto-Live on Connect:** When a DJ connects via their streaming software during their scheduled slot (or allowed warmup), `show_slots.status` automatically updates to `'live'`, `actual_started_at` is stamped, and `radio_settings` switches `broadcast_mode` to `'live'` with the combined title (`Show Title with DJ Name`).
2. **Warmup Collision Rule:** If a DJ connects up to 15 minutes early during warmup, but the preceding DJ is still actively broadcasting on air, the incoming connection is rejected with `"another_presenter_is_currently_live"` and the exact number of seconds until their slot begins.
3. **Overrun Grace & Cutoff:** A DJ may run 5 minutes past slot end without interruption. Once 5 minutes pass AND another show is queued to start within 15 minutes, the current slot is concluded (`'completed'`), `actual_ended_at` is stamped, and a harbor cutoff kick (`harbor_live_dj.stop`) is executed. If no subsequent show is queued, the DJ may continue broadcasting into open air.
4. **Reconnection Grace:** If a live DJ disconnects (e.g. Wi-Fi glitch, OBS restart), Liquidsoap immediately fades to AutoDJ to prevent dead air. The system maintains the slot in `'live'` status for up to 5 minutes. If the presenter reconnects within 5 minutes, they resume on air seamlessly. If 5 minutes pass without reconnecting, the slot concludes as `'completed'`, triggering the R2 archiver.
5. **No-Show Rule:** If 10 minutes pass after `starts_at` with no presenter connection, the slot is marked `'noshow'`, preventing late unauthorized connections and leaving AutoDJ in control.

---

## 8. Recordings & Vault Workflow (Locked Decision 5)
Live festival and radio recordings carry music licensing considerations.
1. **Private by Default:** All sets captured by the 320kbps harbor tap are uploaded to Cloudflare R2 and inserted into `radio_recordings` with `is_public = false`.
2. **Presenter Review:** Presenters view their private recordings under **Studio -> My Recordings** (`/presenter/dashboard`), where they can play them back privately and click **"Approve for Public Vault"**.
3. **Admin Review:** Administrators can also inspect, rename, approve, or hide recordings from the Admin Radio Console (`/admin/radio`). Only approved recordings appear in the public `/radio` archive.

---

## 9. Frontend & Studio Enhancements

### Presenter Studio (`/presenter/dashboard`)
- **"Go Live" Tab:**
  - Real-time pre-flight connection readiness badge (Ready to stream / Warmup in X min / Waiting for slot / Suspended).
  - Stream settings panel (Server IP/Domain, Port 8005, Mount `/live`, Stream Key prefix).
  - **Show-Once Key Modal:** Displays full `gl_live_<hex>` key on creation/regeneration with a 1-click copy button, warning that it will never be displayed again.
  - **Encoder Setup Guides:** Interactive tabbed setup guides for **BUTT (Broadcast Using This Tool)**, **VirtualDJ**, **Mixxx**, and **OBS Studio**, detailing exact host, port, mountpoint, and credential locations.
- **"My Slots" Tab:**
  - Displays assigned upcoming and completed slots.
  - **Request Cover Modal:** Presenters unable to make their slot can request cover with a reason, highlighting the slot for admin reassignment.
- **"My Recordings" Tab:**
  - Lists recorded sets with duration, date, and private/public status.
  - 1-click approval button to publish recordings to the public goodlife vault.
- **"Edit Profile" Tab:**
  - Update display name, bio, and social links.

### Admin Radio Console (`components/admin/radio/`)
- **Decks Connect Card:** Completely stripped of hardcoded station passwords; replaced with individual presenter credential instructions and stream parameter badges.
- **Applications Queue:** Displays pending presenter talent applications with audio mix URLs, bio, contact details, and a 1-click **"Approve & Onboard"** action that creates the presenter record, generates a temporary password, and reveals their initial stream key.
- **Presenter Roster Controls:** Added **Regenerate Key** and **Revoke Key** buttons per presenter.
- **Slot Indicators:** Added visual **Cover Requested** alerts on affected timetable slots.

### Public Website
- **`/radio/apply`:** Dedicated talent application page matching Goodlife's brutalist dark aesthetic (`#142B4C`, `#F3ECE1`, `#C8A54A`). Features rate limiting, portfolio URL submission, and Kenyan phone validation.
- **`GlobalRadioBar`:** Dynamically reflects live air status: switches between `ON AIR NOW (LIVE)` (with pulsing red indicator and genuine DJ name) and `SCHEDULED (AUTODJ)`.

---

## 10. Verification & Test Results

```
======================================================================
 GOODLIFE Radio Verification Suite Summary (Phase 2)
======================================================================
All 45+ test suites executed against the codebase:
- tests/radio-auth.check.ts ......................... 30/30 PASS
- tests/radio-lifecycle.check.ts .................... 20/20 PASS
- tests/admin-routes-guarded.check.ts .............. 255/255 PASS
- tests/radio-schedule.check.ts ..................... 35/35 PASS
- tests/presenter-auth.check.ts ..................... 17/17 PASS
- tests/public-state.check.ts ....................... 47/47 PASS
- tests/never-invent-prices.check.ts ................ 11/11 PASS
- tests/phone.check.ts .............................. 35/35 PASS
- tests/manifests.check.ts .......................... PASS
- tests/og-social.check.ts .......................... PASS
- tests/settlements.check.ts ........................ 19/19 PASS
- tests/budget.check.ts ............................. 24/24 PASS
- tests/mpesa-qr.check.ts ........................... 15/15 PASS
... and 32 additional pre-existing verification suites.
----------------------------------------------------------------------
TypeScript typecheck (`npx tsc --noEmit`): ............ 0 ERRORS (GREEN)
Database migration (`node scripts/migrate.js --dry-run`): 0 ERRORS (VALID)
======================================================================
```

---

## 11. VPS Deployment Deliverables
- **`home-server/DEPLOY-VPS.md`**: Complete, step-by-step documentation for deploying AzuraCast, Liquidsoap, and the Python daemon on Ubuntu 24.04 cloud VPS. All LAN IP references (`192.168.x.x`) replaced with domain configuration.
- **`scripts/test-stream-encoder.sh`**: Standalone bash script using `ffmpeg` to broadcast a 440Hz test sine tone to Icecast Harbor for verifying presenter credentials and handover timings.

---

## 12. Phase 3 Handover Notes
Phase 2 successfully delivered automated live ingest, schedule enforcement, and handover state machines.
**Ready for Phase 3:**
1. **Moderated Listener Shoutouts & Song Requests:** Web request form on `/radio` plus inbound WhatsApp webhook integration with WAHA/Cloud API.
2. **Presenter Studio Cartwall / Live Drops:** Cartwall in presenter studio to trigger station jingles or read approved shoutouts on air.
3. **M-Pesa Tips & Sponsor Slots:** PayHero STK push integration to tip the on-air DJ into the station ledger.
