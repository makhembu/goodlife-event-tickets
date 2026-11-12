# GOODLIFE Radio 254: Phase 4 Report (Two-Way Interaction)

## Executive Summary
Phase 4 implements a robust, two-way interaction layer bridging listeners and presenters on GOODLIFE Radio 254. It introduces moderated shoutouts and song requests (via web form and inbound WhatsApp `SHOUT`/`REQUEST` triggers), real-time interactive polls ("Vote Next Track"), on-air contest giveaways with atomic festival ticket issuance, and scheduled show reminder opt-ins with strict opt-out handling (`STOP`). To guarantee complete safety for the station's official WhatsApp number, all outbound listener reminders default to DRY-RUN mode behind an abstracted messaging provider, reserving WAHA solely for internal resident presenter standby alerts and operator notifications. All database tables were added additively and tested offline; phone numbers are never returned in public APIs or UI marquees; and the entire 43-suite verification suite passes with 100% success.

---

## 1. What Was Built (File Paths)

### Core Backend & Services
- `lib/radio/shoutout-filter.ts`: Message length validation, link/spam blocklist regex (`http`, `telegram`, `wa.me`), Sheng/English profanity filter, name sanitization, deterministic salted hash generator (`hashIdentifier`), and phone number masker (`maskPhone` -> `0712***678`).
- `lib/radio/messaging-provider.ts`: Provider abstraction (`RadioMessagingProvider`, `HybridRadioMessagingProvider`) isolating internal WAHA operations from listener mass reminders. Enforces DRY-RUN by default for listener pings.
- `scripts/phase4-migrations.sql`: Additive SQL migration script defining tables, foreign keys, check constraints, and performance indices for shoutouts, polls, contests, and reminders.

### API Routes & Endpoints
- `app/api/radio/shoutouts/route.ts`:
  - `GET`: Public list of approved/featured shoutouts for the marquee ticker (omits phone numbers completely).
  - `POST`: Listener shoutout submission with DB rate limiting (max 3 per 15 min per sender hash), validation, and live slot attachment.
- `app/api/presenter/shoutouts/route.ts`:
  - `GET`: Moderation queue for presenters (scoped strictly to their own show slots) and admins (all). Masked phone numbers.
  - `PATCH`: Actions: `approved`, `read`, `rejected`, `is_featured`.
- `app/api/whatsapp/webhook/route.ts`:
  - Webhook parser for incoming WhatsApp deliveries (HMAC/Secret verified).
  - Recognizes `SHOUT <msg>`, `REQUEST <track>`, and `STOP`/`UNSUBSCRIBE`.
  - Attaches items to live slots and sends minimal single acknowledgment if enabled.
- `app/api/radio/polls/route.ts`:
  - `GET`: Fetches active polls with live vote tallies and device vote state.
  - `POST`: Presenter/admin poll creation (2 to 4 options, auto-closing timer).
- `app/api/radio/polls/vote/route.ts`:
  - `POST`: Listener voting with composite device/phone fingerprint uniqueness.
- `app/api/radio/contests/route.ts`:
  - `GET`: Active on-air contests.
  - `POST`: Presenter/admin giveaway launcher with ticket budget caps.
- `app/api/radio/contests/enter/route.ts`:
  - `POST`: Contest answer submission. If correct, invokes genuine ticketing engine (`createTicket`, price=0, `amount_paid: 0`) and sends pass via WhatsApp.
- `app/api/radio/reminders/route.ts`:
  - `POST`: Opt-in show reminder.
  - `DELETE`: Unsubscribe by token.
- `app/api/cron/radio-reminders/route.ts`:
  - `GET`: Protected cron (`CRON_SECRET`) executing show reminders 15 min prior (dry-run) and resident presenter harbor connect pings 30 min prior (WAHA).

### Frontend Components
- `components/radio/ShoutoutWall.tsx`: Public ticker marquee and submission form on `/radio`.
- `components/radio/LivePollWidget.tsx`: Live poll voting card with progress bars on `/radio`.
- `components/radio/LiveContestWidget.tsx`: Passphrase and trivia claim box on `/radio`.
- `components/radio/ShowReminderButton.tsx`: Opt-in button for show pages (`app/radio/shows/[slug]/page.tsx`).
- `components/presenter/PresenterShoutoutQueue.tsx`: Live-polling moderation queue in presenter dashboard.
- `components/presenter/PresenterInteractionTools.tsx`: Poll and contest creation cards in presenter dashboard.

### Verification Suites
- `tests/radio-shoutouts.check.ts`: Standalone verification of phone masking, salted hashing, spam/profanity filtering, contest caps, public API phone omission, and dry-run defaults.
- `tests/admin-routes-guarded.check.ts`: Updated to cover all newly introduced routes and cron verification.

---

## 2. Database Changes (Additive Only)

Defined in [`scripts/phase4-migrations.sql`](file:///c:/Users/Khesh/Downloads/goodlife-event-tickets/scripts/phase4-migrations.sql):
1. **`radio_shoutouts`**:
   - `id SERIAL PRIMARY KEY`
   - `slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL`
   - `sender_name VARCHAR(100)`, `sender_phone VARCHAR(30)`, `sender_hash VARCHAR(64)`
   - `message TEXT`, `request_track VARCHAR(255)`, `source VARCHAR(20) DEFAULT 'web'`
   - `status VARCHAR(20) DEFAULT 'pending'`, `is_featured BOOLEAN DEFAULT FALSE`
   - `moderated_by VARCHAR(100)`, `moderated_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`
2. **`radio_polls`**:
   - `id SERIAL PRIMARY KEY`
   - `slot_id INTEGER REFERENCES show_slots(id) ON DELETE CASCADE`
   - `presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL`
   - `question VARCHAR(255)`, `poll_type VARCHAR(50)`, `status VARCHAR(20) DEFAULT 'active'`
   - `duration_minutes INTEGER`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`
3. **`radio_poll_options`**:
   - `id SERIAL PRIMARY KEY`, `poll_id INTEGER REFERENCES radio_polls(id) ON DELETE CASCADE`
   - `option_text VARCHAR(255)`, `vote_count INTEGER DEFAULT 0`, `display_order INTEGER`
4. **`radio_poll_votes`**:
   - `id SERIAL PRIMARY KEY`, `poll_id INTEGER REFERENCES radio_polls(id) ON DELETE CASCADE`
   - `option_id INTEGER REFERENCES radio_poll_options(id) ON DELETE CASCADE`
   - `voter_hash VARCHAR(64) NOT NULL`
   - `CONSTRAINT uq_poll_voter UNIQUE (poll_id, voter_hash)`
5. **`radio_contests`**:
   - `id SERIAL PRIMARY KEY`, `slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL`
   - `presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL`
   - `title VARCHAR(255)`, `passphrase VARCHAR(100)`, `contest_type VARCHAR(50)`
   - `event_id INTEGER REFERENCES events(id)`, `tier_id VARCHAR(50)`
   - `max_winners INTEGER DEFAULT 1`, `winners_awarded INTEGER DEFAULT 0`
   - `CONSTRAINT chk_contest_winners_cap CHECK (winners_awarded <= max_winners)`
6. **`radio_contest_entries`**:
   - `id SERIAL PRIMARY KEY`, `contest_id INTEGER REFERENCES radio_contests(id) ON DELETE CASCADE`
   - `listener_name VARCHAR(100)`, `listener_phone VARCHAR(30)`, `participant_hash VARCHAR(64)`
   - `answer_text TEXT`, `is_winner BOOLEAN DEFAULT FALSE`, `awarded_ticket_id VARCHAR(50) REFERENCES tickets(id)`
   - `CONSTRAINT uq_contest_participant UNIQUE (contest_id, participant_hash)`
7. **`radio_reminders`**:
   - `id SERIAL PRIMARY KEY`, `phone VARCHAR(30)`, `phone_hash VARCHAR(64)`
   - `show_id INTEGER REFERENCES shows(id) ON DELETE CASCADE`
   - `unsubscribe_token VARCHAR(64) UNIQUE`, `is_active BOOLEAN DEFAULT TRUE`
   - `CONSTRAINT uq_phone_show_reminder UNIQUE (phone_hash, show_id)`
8. **`radio_messaging_log`**:
   - Audit trail table recording delivery channel (`waha`, `cloud_api`, `dry_run`), message type, status, and anonymized recipient hash.

---

## 3. New Environment Variables

| Variable | Required | Default / Description |
|---|---|---|
| `ENABLE_WHATSAPP_CLOUD_API` | No | `false`. Set to `true` when official WhatsApp Cloud API is configured. When `false`, all mass listener reminders default to DRY-RUN mode. |
| `ENABLE_RADIO_WHATSAPP_ACK` | No | `false`. If `true`, sends a single short acknowledgment to listeners who send `SHOUT` or `REQUEST`. |
| `PHONE_HASH_SALT` | No | Internal salt for hashing listener phone numbers and composite device fingerprints (defaults to internal safe salt). |

---

## 4. New Routes & Auth Rules

| Route | Method | Auth Rule | Scope / Behavior |
|---|---|---|---|
| `/api/radio/shoutouts` | GET | Public | Approved and featured shoutouts ticker. Never returns phone numbers. |
| `/api/radio/shoutouts` | POST | Public | Listener web shoutout submission. Rate limited per IP/Phone. |
| `/api/presenter/shoutouts` | GET | Presenter Session or Admin Cookie | Moderation queue. Presenters only see their assigned slot items. Phone numbers masked (`0712***678`). |
| `/api/presenter/shoutouts` | PATCH | Presenter Session or Admin Cookie | Moderate shoutout: approve, read, feature, reject. Slot ownership enforced. |
| `/api/whatsapp/webhook` | POST | HMAC (`X-Webhook-Hmac`) or Secret (`X-Webhook-Secret`) | Inbound WhatsApp processing for `SHOUT`, `REQUEST`, `STOP`. Always responds 200. |
| `/api/radio/polls` | GET | Public | Active polls for current slot with anonymous vote state. |
| `/api/radio/polls` | POST | Presenter Session or Admin Cookie | Create 2-4 option poll for active show slot. |
| `/api/radio/polls/vote` | POST | Public | Cast vote. Enforces 1 vote per device/phone hash. |
| `/api/radio/contests` | GET | Public | Active on-air contests. Omits passphrase from response. |
| `/api/radio/contests` | POST | Presenter Session or Admin Cookie | Launch giveaway contest with max winners cap. |
| `/api/radio/contests/enter` | POST | Public | Submit contest answer/passphrase. Generates genuine ticket pass via `createTicket` if winning. |
| `/api/radio/reminders` | POST | Public | Opt-in show reminder with rate limit. |
| `/api/radio/reminders` | DELETE | Public (Token-guarded) | Unsubscribe using secret `unsubscribe_token`. |
| `/api/cron/radio-reminders` | GET | Bearer `CRON_SECRET` | Automated 15-min show reminder dispatch & 30-min presenter standby alert. |

---

## 5. Step-by-Step Manual Verification

1. **Web Shoutout & Moderation Queue:**
   - Go to `http://localhost:3000/radio`.
   - Scroll to "Shoutouts & Song Requests". Type Name: `Nairobi Crew`, Message: `Big up Marara Camp festival vibes!`. Click "Submit to Live Airwaves".
   - Open `http://localhost:3000/presenter/dashboard` (logged in as resident presenter). Click tab "Shoutouts & Polls".
   - In "Live Listener Shoutout Queue", verify `Nairobi Crew` appears in the "Pending" tab.
   - Click "Feature". Verify the shoutout updates with a gold "Featured" badge and appears live in the public ticker on `/radio`.
2. **WhatsApp Inbound (`SHOUT` / `REQUEST` / `STOP`):**
   - Simulate an inbound WhatsApp webhook POST to `/api/whatsapp/webhook` with header `x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>` and payload:
     `{ "from": "254712345678", "body": "SHOUT Locked in from Westlands!", "pushName": "Kevo" }`.
   - Verify 200 OK. Check presenter moderation queue; confirm item appears under source `whatsapp`.
   - Send `{ "from": "254712345678", "body": "STOP" }`. Verify active reminder is unsubscribed.
3. **Live Polls ("Vote Next Track"):**
   - In presenter dashboard ("Shoutouts & Polls"), create a poll: Question: `Next drop: Amapiano or Afro Tech?`, Type: `Vote Next Track`, Options: `Amapiano`, `Afro Tech`. Click "Launch Poll Live".
   - Refresh `/radio`. The poll appears immediately. Click "Amapiano".
   - Confirm vote percentage updates to 100%, and second attempt returns 409 Conflict ("You have already voted on this poll").
4. **On-Air Contest Ticket Giveaway:**
   - In presenter dashboard, create a giveaway: Title: `Marara VIP Pass Giveaway`, Passphrase: `mararavibes254`, Max Winners: `1`.
   - On `/radio`, find the contest banner. Enter Name: `Mary Wambui`, Phone: `0722000000`, Passphrase: `mararavibes254`.
   - Click "Claim Pass". Confirm success alert: "CONGRATULATIONS! You won a free ticket pass...". Verify ticket ID issued (`WIN-XXXX`) in database.
   - Enter again with different phone: verify error "All ticket passes for this contest have already been won!".
5. **Show Reminders & Cron Dry-Run:**
   - Go to `/radio/shows/<slug>`. Click "Remind Me". Enter Kenyan phone `0712345678`.
   - Trigger cron: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/radio-reminders`.
   - Inspect server logs: verify `[RadioMessagingProvider:DRY_RUN] Reminder for listener 0712***` was logged without sending spam via WAHA.

---

## 6. What Was Not Done & Why

1. **Automatic Playout Deck Insertion from Polls:**
   - The user specification strictly required: *"Vote the next track only suggests the winner to the presenter (no automatic playout insertion)."* Playout insertion is left entirely under the resident DJ's live creative control.
2. **Live Unmoderated Chat Room:**
   - As per locked architectural decision #4, real-time unmoderated chat was intentionally excluded in favor of moderated shoutouts and WhatsApp inbound to eliminate moderation overhead and platform toxicity.

---

## 7. Open Questions

1. **WhatsApp Cloud API Migration Timeline:**
   - When the official Meta WhatsApp Cloud API credentials (`WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) are ready, should we implement template message approval for show reminders, or continue using dry-run logging?

---

## 8. Verification Suite Results

- `tests/radio-shoutouts.check.ts`: **PASS** (Phone masking, hash uniqueness, length/spam/profanity filters, contest ticket issuance & caps, WhatsApp command parsing, dry-run default).
- `tests/admin-routes-guarded.check.ts`: **PASS** (Scanned 268 exported HTTP handlers across the entire repository; 0 unauthorized routes).
- Full Verification Suite: **43/43 test suites passed**.
- Typecheck: `npx tsc --noEmit` passed with **0 errors**.
