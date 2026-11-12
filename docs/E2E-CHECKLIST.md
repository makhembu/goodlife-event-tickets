# GOODLIFE Radio: End-to-End Operational Checklist

This checklist verifies the stability, security, audio integrity, and monetisation readiness of GOODLIFE Radio inside the event ticketing infrastructure.

---

## 1. Listener Experience & Audio Pipeline
- [ ] **Low-Bitrate & Hi-Fi Streams:** Player defaults to 64–96 kbps Data Saver stream. Opt-in Hi-Fi toggles 192 kbps stream.
- [ ] **Player Fallback & Recovery:** When live stream is unavailable, player automatically fails over to curated R2 festival warmup mixes with "Venue stream reconnecting... playing curated festival warmup" indicator, polling live stream in background and auto-recovering without page reload.
- [ ] **Media Session:** Lock screen and notification controls reflect current track title, artist, show name, and resident DJ avatar.
- [ ] **Schedule & Timetable:** Timetable (`/radio/schedule`) renders weekly recurring shows with Nairobi EAT / Local Time toggle, show details, and resident presenter links.
- [ ] **PWA Support:** Standalone PWA installable on mobile devices with scoped navigation.

---

## 2. Presenter Portal & Playout Authentication
- [ ] **Presenter Authentication:** Login via email/password (`/presenter/login`). HMAC-signed `goodlife_presenter_session` cookie issued.
- [ ] **Stream Key Isolation:** Stream keys format `gl_live_<random>`, stored only as SHA-256 hash and 6-char preview prefix. Revocation takes effect immediately on next connection.
- [ ] **Schedule-Enforced Playout:** Connection to Liquidsoap via `/api/internal/radio-auth` verifies presenter slot timing and rejects early connections if another DJ is on air.
- [ ] **Presenter Live Deck:** Live dashboard provides countdown to air, live connection state, on-air shoutout queue, and audio telemetry.

---

## 3. Listener Interaction & Shoutouts
- [ ] **Web Submission:** Listeners can send shoutouts and track requests via `/radio` with DB-backed rate limits, spam/link filters, and phone hashing.
- [ ] **WhatsApp Inbound:** Messages to the station number starting with `SHOUT` or `REQUEST` automatically ingest into `radio_shoutouts` attached to the current on-air slot.
- [ ] **Presenter Moderation:** Presenters can approve, mark as read, or reject shoutouts in real-time from their portal.
- [ ] **On-Air Ticker:** Approved shoutouts appear on the public player ticker with phone numbers strictly masked (`0712***678`).

---

## 4. Monetisation: Listener Tips & PayHero M-Pesa STK
- [ ] **Tip Initiation:** Listener selects preset amount (KES 50, 100, 250, 500, 1000) or enters custom amount (min KES 10) and enters M-Pesa phone number.
- [ ] **Prefix Isolation:** Tip references strictly start with `TIP-` (e.g. `TIP-ABCD1234`), keeping them completely isolated from ticket checkout (`GL-`) and tab self-pay (`TABPAY_`).
- [ ] **PayHero Webhook & Verification:** Callback route `/api/payhero/callback` safely routes `TIP-` to tip fulfillment without touching `pending_payments` or creating tickets.
- [ ] **Revenue Policy:** Tips are GOODLIFE revenue in the PayHero merchant account. No presenter payout balances or split liabilities are tracked in the app.
- [ ] **Admin Tips Ledger:** Overview available in admin console with filter by presenter/show, status breakdown, and CSV export.

---

## 5. Security & Role-Based Access Control (RBAC)
- [ ] **Admin Roles:**
  - `superadmin`: Full unrestricted access to tickets, vendors, finance, budget, and radio console.
  - `station_manager`: Restricted strictly to `/admin/radio/*`. Attempted navigation or API calls to tickets, vendors, settlements, or budget are blocked with 403.
  - `ticketing_admin`: Restricted to box office and tickets. Attempted access to `/admin/radio/*` is blocked.
- [ ] **Session Hardening:**
  - No hardcoded fallback salts for admin, scanner, or vendor sessions.
  - Fail-closed if signing secrets are missing from environment.
  - Legacy unauthenticated session cookies (`true`) are strictly rejected.
  - Vendor and scanner session tokens are cryptographically verified with HMAC-SHA256 in both middleware and API route handlers.
- [ ] **Radio Bridge Server Security:** All Python automation endpoints (`scripts/radio-bridge-server.py`) require timestamped HMAC-SHA256 signatures.

---

## 6. Station Safety & Operator Monitoring
- [ ] **Automated Health Monitor:** Cron job `/api/cron/radio-health-monitor` checks stream availability, presenter noshows (>10m late), and archive queue health.
- [ ] **Operator Alert Cooldowns:** WhatsApp alerts to operators enforce a 30-minute cooldown per incident category to avoid alert fatigue.
- [ ] **Sponsor Engine:** Active sponsor banners appear across timetable and show pages, with "Brought to you by" sponsor lines in the player.
