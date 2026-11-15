# GOODLIFE Event Tickets

Next.js 15 App Router + TypeScript + Tailwind v4. One repo, two products:

- **Ticketing** — Supabase PostgreSQL (`DATABASE_URL`), live M-Pesa via **PayHero STK push**, PDF/WhatsApp tickets, QR gate scanning, vendor POS + customer tabs, event budgets/settlements.
- **GOODLIFE Radio 254** — a full radio station: home-server playout (AzuraCast/Liquidsoap + a Python daemon) with this Next.js app as the BFF/console and public player. ~40 modules under `lib/radio/`, 24 test files.

`CLAUDE.md`, `README.md`, `DESIGN.md`, `PRODUCT.md` drift badly (they still describe Neon + Paystack + Netlify). This file is the verified one. Re-verified against the working tree on **2026-11-15**.

## Commands

```sh
npm run dev            # next dev
npm run build          # next build — runs `npm run clean` first (prebuild), so it self-heals a stale .next/
npm run start          # next start
npm run lint           # eslint .   ← CURRENTLY BROKEN, see below
npm run clean          # rm -rf .next tsconfig.tsbuildinfo
npm run migrate:radio  # runs migrations/radio/*.sql via scripts/migrate.js (see Database)
npx tsx tests/<name>.check.ts   # the verification suite (see below)
```

- `next.config.ts`: `typescript.ignoreBuildErrors: false` + `eslint.ignoreDuringBuilds: true`. So **`npm run build` is the typechecker** (a red build = a TS error). Because `build` cleans first, the old "stale `.next/` crashes with `Cannot read properties of undefined (reading 'length')`" failure is auto-mitigated; if it still happens, run `npm run clean` by hand.
- **`npm run lint` currently crashes** before linting anything: `Failed to patch ESLint because the calling module was not recognized` from `@rushstack/eslint-patch` (ESLint 9.39.1 + eslint-config-next 15.5.29). Don't read it as "my change broke lint". `eslint.config.mjs` ignores `.netlify/**`, `replace.js`, `check.js`; the ignores **must** live in their own config object to act globally in flat config.
- `tsconfig.json` **excludes `tests` and `scripts`**, so `npx tsc --noEmit` does NOT typecheck the test suite. `tsconfig.tsbuildinfo` is gitignored — keep it untracked.
- HMR is disabled only when `DISABLE_HMR=true` is exported (`next.config.ts` `webpack()`); it is not in `.env.local`.
- No CI, no test framework, no `test` script. `scripts/` (~250 files) is gitignored and hits the **live** DB; don't run it casually.

## Verification suite (`tests/`)

64 `*.check.ts` files (plus 2 `*.e2e.ts` the runner below skips). Each is a standalone `tsx` script that prints PASS/FAIL and exits non-zero on failure. Run them all:

```powershell
Get-ChildItem tests -Filter *.check.ts | ForEach-Object {
  $n = $_.Name
  & ".\node_modules\.bin\tsx.cmd" "tests/$n" *> "$env:TEMP\chk.log"
  if ($LASTEXITCODE) { "FAILED: $n"; Get-Content "$env:TEMP\chk.log" | Select-String "FAIL" }
  else { "OK: $n" }
}
```

Use the **local** `tsx.cmd`, not `npx tsx` — inside a `ForEach-Object` block `npx` fails with `could not determine executable to run` on this machine (npm 11) and every suite looks broken.

Groups (not exhaustive):
- Ticketing core: `public-state` (`--live` re-runs the same routing decisions read-only against the real DB), `never-invent-prices`, `phone`, `event-media`, `story-deck`, `og-social`, `manifests`, `settlements`, `budget`, `mpesa-qr`, `customer-audit-unification`.
- Auth/security: `scanner-vendor-auth`, `admin-vendor-auth`, `admin-security-hardening`, `admin-roles`, `admin-delete`, `admin-routes-guarded` (statically scans every `app/api/**/route.ts` for an in-handler auth guard or an explicit public allowlist).
- DB/ops: `db-backup`.
- Radio: 24 files (`radio*.check.ts`) — sequencer, schedule, playlists, playback, signed playback, drops, ingest signature, harmonizer, listeners, tips, shoutouts, contests, etc.

`tests/` lives outside `scripts/` on purpose: `.gitignore` excludes `scripts/` (its ad-hoc scripts hardcode the production DB password), so anything the codebase depends on must not live there. **Add a case before changing routing, pricing, phone matching, session auth, PWA scope, social metadata, or radio playout.**

Caveat: `admin-routes-guarded.check.ts` only greps for the *presence* of a guard token, so it accepts a decode-only `getSession()` as valid auth (see Auth).

## Environment gotchas

- `.env.local` holds only local values; production secrets live in the Vercel dashboard. It currently contains `DATABASE_URL`, `APP_URL`, legacy `DARAJA_*`, `WHATSAPP_GATEWAY_*`, `PAYSTACK_*`.
- **Secrets are now fail-closed.** The old hardcoded fallback salts (`goodlife_scanner_secret_salt` etc.) were removed. Resolution order is `SCANNER_SESSION_SECRET` / `VENDOR_SESSION_SECRET` / (`ADMIN_SESSION_SECRET` or `ADMIN_PASSWORD`) / `PRESENTER_SESSION_SECRET` → `TAB_SELF_PAY_SECRET` → `PAYHERO_CALLBACK_TOKEN`; if the resolved secret is empty the verifier returns null/false. A missing secret means nobody can log in — **not** forgeable cookies. (The salts survive only as fixtures in `tests/`.)
- Absent locally, each fails differently:
  - `PAYHERO_*` → checkout returns "PayHero not configured".
  - `ADMIN_PASSWORD` → `POST /api/admin/login` returns **500 "Server misconfiguration"** (fail-closed). `/login` is untestable locally without it.
  - `SIMULATOR_PASSWORD`, `GATE_SCANNER_PIN` → those toggles/PINs never match.
  - `PRESENTER_SESSION_SECRET` unset → the whole `/presenter` portal refuses every session.
- `.env.example` documents the ticketing + radio keys (`ADMIN_*`, `PRESENTER/SCANNER/VENDOR_SESSION_SECRET`, `CRON_SECRET`, `PAYHERO_*`, `TAB_SELF_PAY_SECRET`, R2 + radio playback/bridge keys, `IMGBB_API_KEY`, `OPERATOR_WHATSAPP_NUMBERS`). It still omits `SIMULATOR_PASSWORD`, `GATE_SCANNER_PIN`, `WAHA_*` — add them if you touch auth.
- `/api/mpesa/*` is dead Daraja code. `lib/supabase-db.ts`'s *client* branch of `createPendingPayment` still posts to `/api/mpesa/stkpush`; the live PayHero routes call the server branch instead. `app/api/vendor/mpesa/stk` is a *misnomer*: it drives PayHero.
- `scripts/`, `backups/`, `scan-qr.html`, `SECURITY-AUDIT.md`, `/research/`, root `*.png`, and root debug files are untracked/gitignored so credentials, DB dumps, and audit findings don't leak. Assume the DB credential is already burned. `scripts/test-e2e-suite.js` INSERTs/UPDATEs/DELETEs rows for event `2` in the live DB — not a unit test.

## Database

PostgreSQL via `pg.Pool` + SSL.

| Role | Key | Host |
|---|---|---|
| Primary (production) | `DATABASE_URL` | `aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres` (Supabase, Sydney pooler) |
| Secondary / home server | `BACKUP_DATABASE_URL` | `0.tcp.in.ngrok.io:24142/goodlife` |
| Legacy | — | `schema-neon.sql` / README / CLAUDE say Neon; live is Supabase |

- **50 public tables** (23 are `radio*`). Ticketing: `events`, `event_details`, `event_expenses`, `event_gallery`, `event_waitlist`, `ticket_tiers`, `tickets`, `payment_logs`, `pending_payments`, `payhero_webhook_outbox`, `db_backup_logs`, `pos_sales`, `pos_sale_items`, `pos_split_payments`, `customer_tabs`, `tab_transactions`, `till_sessions`, `vendors`, `vendor_items`, `vendor_operators`, `vendor_event_assignments`. Radio: `presenters`, `presenter_applications`, `shows`, `show_slots`, `radio_playlists`, `radio_playlist_tracks`, `radio_drops`, `radio_plays`, `radio_recordings`, `radio_sets`, `radio_settings`, `radio_polls`, `radio_shoutouts`, `radio_sponsors`, `radio_tips`, `radio_reminders`, `soundboard_banks`, `soundboard_pads`, `radio_audit_logs`, plus `radio_*` telemetry/log tables.
- `lib/supabase-db.ts` (~172 KB) **is** the data layer. Every function branches on `typeof window === "undefined"`: server → SQL via `neonQuery()` (connects to `DATABASE_URL`), client → `fetch` to its own `/api/*`. Adding a field means editing `lib/supabase-db-types.ts`, the function's server branch, and its client fallback.
- Some modules (`lib/payhero-fulfill.ts`, several API routes) build a **new `Pool` per call** and `pool.end()` it — that's the existing pattern.
- **Migrations:** only the radio subsystem has a runner — `npm run migrate:radio` applies `migrations/radio/*.sql` in filename order, each in a transaction, tracking applied files in a `schema_migrations` ledger (`scripts/migrate.js`; supports `--dry-run`). Everything else is ad-hoc `scripts/*.js|ts` that parse `DATABASE_URL` from `.env.local`. Always check the live schema before assuming a column exists.

## Automated 12-hour DB backups

- **Why a home-server cron, not Vercel Cron:** Vercel Hobby allows 1 cron/day, so `0 */12 * * *` runs on the user's home server against Supabase.
- `lib/db-backup.ts` → `executeDatabaseBackup()` dumps all 50 public tables to SQL, gzips (`level: 9`) to `backups/db/goodlife-db-<timestamp>.sql.gz`, streams it to Cloudflare R2 (`goodlife` bucket, `backups/db/`), prunes both locations at 30 days, and logs to `db_backup_logs`.
- Runners: `scripts/run-backup.sh` (Linux cron) / `scripts/run-backup.bat` (Windows Task Scheduler) / `scripts/server-cron-backup.ts`.
- Triggers: `POST /api/admin/backup` (admin session) and `POST /api/cron/db-backup` (`Authorization: Bearer <CRON_SECRET>`). Guarded by `tests/db-backup.check.ts`. (These backup files are currently untracked in git.)

## Data model — events vs event_details

Two overlapping "event" models; mixing them breaks checkout/tiers/scans:

| Source | Scope |
|---|---|
| `events` (many rows, `event_id` everywhere) | real events: checkout, tiers, tickets, vendors, gallery, radio events, waitlist, gate scans |
| `event_details` (singleton `id = 1`) | site-wide settings only: WhatsApp templates, `gate_pin`, `simulators_enabled`, `operator_notifications_enabled`, footer, `payment_contact`; also the source for `app/layout.tsx` `generateMetadata` |

## Payments

1. **PayHero STK push (primary)** — `POST /api/payhero/initialize` → customer PIN → checkout polls `GET /api/payhero/verify` → ticket issued. `POST /api/payhero/callback` does the same fulfillment, so both paths must stay idempotent through `lib/payhero-fulfill.ts`, keyed on `pending_payments.checkout_request_id` (our `GL-XXXX` ref, not PayHero's own).
   - **Fee float:** PayHero bills collection fees from its *service wallet*; at zero balance collections fail. `initialize` hard-blocks at 0 (503) and WhatsApp-alerts below `PAYHERO_MIN_BALANCE` (default 50). Monitoring failure must never block sales (fail-open on purpose).
2. **Manual till** — `POST /api/payments/till-submit` writes a `till_pending` row; an admin approves it (`/api/admin/pending-payments/approve`) before any ticket exists. The endpoint currently has **no UI caller**.
3. **Vendor tab self-pay** — public `/pay/tab/[id]?t=<hmac>`; the token is HMAC-SHA256 verified with `timingSafeEqual`. Never add an unauthenticated tab route (tab IDs are enumerable). Vendor-initiated tab STK is `/api/vendor/mpesa/stk` (PayHero under the hood).
4. **Paystack** — code kept, hidden behind `NEXT_PUBLIC_ENABLE_PAYSTACK=true`. `NEXT_PUBLIC_*` is baked at build time, so toggling needs a redeploy.
5. `/api/mpesa/*` (Daraja) is legacy and unused by the UI.

## Event lifecycle (read before touching routing or status)

`publicState()` in `lib/event-availability.ts` is the **only** function that decides which public page an event gets (`recap | coming_soon | checkout | unavailable`). `app/page.tsx` calls it and nothing else. Rule order:

1. `canonicalStatus(status) === 'closed'` → `recap`
2. `status === 'archived'` or `archived_at` set → `unavailable` (404)
3. `getEventAvailability().reason === 'not_live'` → `coming_soon`
4. `category === 'mini'` → `reason === 'not_open_yet' ? 'coming_soon' : 'checkout'`
5. `reason === 'not_open_yet'` → `coming_soon`
6. `reason === 'event_finished'` → `recap`
7. otherwise → `checkout`

- **`status` is a hand-set label; the recurrence engine is the truth for minis.** A mini festival parked on `scheduled` is sellable today, so gating its page on `status` would show a countdown while the payment API took its money. Never re-derive page choice from `status` anywhere else.
- Anything advertising "on sale" must use `isEventSellable(e)` (wraps `getEventAvailability().sellable`), not a `status` comparison — a banner that disagrees with checkout is a dead end.
- `recurrence_pattern` supports only `daily | weekly | biweekly | none`. Anything else logs `[event-availability] recurrence_pattern="monthly" is not supported yet` and is treated as **non-recurring**, so availability silently falls back to the one-shot `event_date`. Add a new cadence to `cadenceFor()` **and** a `public-state.check.ts` case.
- **Legacy `active` → `live`:** old UI wrote `status = 'active'`, which `getEventAvailability` rejects (working page, refused every payment). `canonicalStatus()` folds `active` to `live`; use `canonicalStatus`, not `e.status`, in any status comparison.
- **Never invent prices.** There is no fallback tier ladder anywhere. Zero tiers means zero tiers: `app/page.tsx` downgrades a tierless checkout to `coming_soon` (with `tiersPending` for distinct copy), and `CheckoutClientPage` guards the empty ladder *first* (line ~754) and shows an empty-state panel. Don't reintroduce a default ladder, and don't make a read function write.
- `sales_open_date` / `sales_close_date` are editable ("Tickets Open" / "Tickets Close", `datetime-local`, entered as Kenya time — the column is a naive EAT string). They gate both page and payment. Don't add a second hand-rolled auto-open rule.
- **Closing ≠ archiving.** `POST /api/events/[id]/archive` takes `mode: activate | close | archive`; `closeEvent()` sets `status='closed'` and keeps the recap page, `archiveEvent()` stamps `archived_at` and 404s it. For backward compat `activate: true` still works; absent a `mode`, it archives.
- `isHiddenFromSite()` shares `publicState`'s "may this be linked" rule — use it rather than re-checking `archived_at`.

## Media: posters, teaser video, hero

- `lib/event-flyer.ts` is the only place media URLs are decided: `resolveEventFlyer(event)` → `/flyer.png`, or `/flyer-park-chill.png` when `category === 'mini'` or the title/subtitle mentions chill / park & chill / sunday (a custom `flyer_url` other than `/flyer.png` always wins). `resolveEventVideo(event)` → R2 bucket URLs (`${R2_DOMAIN}/videos/goodlife-hype.mp4` or `park-chill-speakers.mp4`) by the same rule, with `events.video_url` winning. Both are wired in `app/page.tsx`'s `eventDetails`, so adding an event column means adding it there too.
- **`components/admin/PosterUploader.tsx` uploads straight from the browser to ImgBB with a hardcoded API key** — no server route, no auth. That's why `i.ibb.co` is a whitelisted image host. Posters land in a third-party bucket, not the repo.
- `components/StoryDeckHero.tsx` is the story-style hero on **both** checkout and coming-soon pages: 5s poster countdown → teaser autoplay, poster/video expand lightboxes. Tapping the media expands whatever is on screen (the only path to the lightbox — no invisible tap zones), and the POSTER/TEASER pill is the sole slide switcher. `tests/story-deck.check.ts` guards that contract.
- `public/` holds real production assets (`BebasNeue.ttf`, `flyer*.png`, `promo.mp4`); heavy teasers live on Cloudflare R2 to keep the bundle lean. Not build artifacts — don't gitignore or "clean" them.

## Social cards (og:image) — generated, never checked in

- Every og:image is a 1200x630 PNG rendered per event by `next/og` from that event's own poster (`resolveEventFlyer`). There is deliberately **no** `og-*.jpg` and no `resolveEventOgImage`: the flyers are portrait (896x1200) and 2.8–3.3 MB, which platforms reject or letterbox. `tests/og-social.check.ts` fails if a static banner filename or an `openGraph.images` block creeps back in.
  - `lib/og-image.tsx` `renderEventOgImage(event)` — 1200x630, poster cropped to a 300x400 card, Bebas Neue from `public/BebasNeue.ttf`, ~350 KB. Poster loading is guarded (bad `flyer_url`, missing file, dead ImgBB URL → text-only card, never a 500) and reads only inside `public/` (no `../../.env.local` leak).
  - `app/opengraph-image.tsx` (site-wide default, file convention, `revalidate = 3600`), `app/events/[id]/opengraph-image.tsx`, `app/radio/opengraph-image.tsx`, and `app/og/route.tsx` (`GET /og?event=<id>`, the only banner source for `/?event=<id>`; public by design, `s-maxage=3600`).
- **A page must not declare `openGraph.images`/`twitter.images` unless it means to override the generated banner** — config beats file convention, so a portrait `images` entry silently undoes the whole fix.
- Canonical URLs are per route, never in `app/layout.tsx` (a layout-level canonical is inherited by every route). Titles overriding the layout use `title: { absolute }`.
- `lib/seo.ts` owns the copy split: `description` (~150 chars) vs `ogDescription` (≤124). `siteUrl()` **refuses** a localhost/ngrok `APP_URL` as a canonical identity. `components/SeoStructuredData.tsx` emits Event + WebSite JSON-LD with no `price` on purpose (tiers live in the DB).

## PWA (scoped, deliberately)

- **Five operational manifests** — `public/manifests/{vendor,scanner,radio,presenter,admin}.json` — referenced from `metadata.manifest` in `app/{vendor,scanner,radio,presenter,admin}/layout.tsx`, each with its own `scope`/`start_url`. **There must be no root `app/manifest.ts`** (it would bleed the POS prompt onto every public visitor); `tests/manifests.check.ts` fails if one appears.
- The public site has a separate, non-operational `public/site.webmanifest` (`display: minimal-ui`, start_url `/`), declared in `app/layout.tsx` for SEO / "Add to Home Screen". Consequence: the public checkout is installable on Android. To revert, delete the `manifest:` line and the file — nothing else depends on it.
- `public/sw.js` is hand-written (no serwist/next-pwa): precaches only icons, network-first, and **skips every `/api/` request** (so it can never serve stale money/ticket state). It returns a plain-text 503 "Terminal Offline - Reconnecting..." instead of failing the fetch.
- `components/ui/PwaInstallButton.tsx` registers `/sw.js` (the only registration site) and renders `null` unless `beforeinstallprompt` fired or the UA is iOS.
- Icons: `public/icons/{vendor,scanner,admin}-*` plus maskable variants; radio/presenter reuse the generic `icon-*`/`maskable-*`. A new surface = new manifest + layout `metadata` entry + icons.

## Auth & middleware

- **Admin:** `admin@goodlife.com` / `ADMIN_PASSWORD` → signed HMAC cookie `goodlife_admin_session=<payload>.<sig>` (1 day, httpOnly, secure, sameSite=strict), verified by `verifyAdminSession()` (`lib/admin-session.ts`) / `requireAdmin(request?, allowedRoles?)` (`lib/admin-auth.ts`). No Supabase Auth. Legacy `"true"` cookies are now **strictly rejected** (`ALLOW_LEGACY_ADMIN_COOKIE` is gone). The same password is re-typed to confirm permanent deletes and doubles as the gate-scanner superuser bypass.
- **Admin roles (RBAC):** `superadmin | station_manager | ticketing_admin` (default `superadmin`). `middleware.ts` enforces: `station_manager` may reach only `/admin/radio` + `/api/admin/radio/*`; `ticketing_admin` is blocked from all `/admin/radio*`. `requireAdmin(req, ["ticketing_admin"])` gates inside handlers.
- **Presenter portal:** `/presenter` + `/api/presenter/*` with its own signed cookie `goodlife_presenter_session` (`lib/presenter-session.ts`, `PRESENTER_SESSION_SECRET`, fail-closed). `requirePresenter()` (`lib/presenter-auth.ts`) loads the `presenters` row (bcrypt `password_hash`) and rejects non-`active` accounts. Admin cookies are **not** accepted as presenter.
- **Scanner/vendor sessions:** HMAC-SHA256 signed, `base64url(payload).base64url(sig)`. Scanner payload requires `role === "scanner"`; vendor payload requires a `vendorId`. Gate PIN is `event_details.gate_pin` → `GATE_SCANNER_PIN` → admin password (each a plain `===`, not `timingSafeEqual`).
- **`config.matcher` (explicit allowlist):** `/admin/:path*`, `/scanner/:path*`, `/vendor/:path*`, `/presenter/:path*`, `/api/admin/:path*`, `/api/scanner/:path*`, `/api/presenter/:path*`, `/api/event-details`. **A new `/api/*` route is public until you add it here** — or guard it in-handler; `tests/admin-routes-guarded.check.ts` requires one or the other.
- **⚠️ `/api/vendor/*` is NOT in the matcher** (unlike the `/vendor/*` pages). Vendor API handlers decode `goodlife_vendor_session` themselves, and several define a local `getSession`/`getVendorSession` that only base64-decodes the payload **without verifying the HMAC** (e.g. `vendor/sales`, `vendor/tabs`, `vendor/items`, `vendor/mpesa/stk`). `lib/vendor-tab-auth.ts` `verifyVendorSession`/`getTabActor` **do** verify — prefer them. Never treat a `vendorId` from a request body as trusted. `admin-routes-guarded.check.ts` counts a bare `getSession()` as a valid guard, so it won't catch this.
- `lib/vendor-tab-auth.ts` accepts the admin cookie as a **superuser** on customer tabs (`getTabActor`/`tabOwnershipGuard`). Operators pass only for their own tabs; tabs with NULL `vendor_id` are legacy and open to all vendors.
- `/admin/vendors/[id]/login-as` impersonates a vendor, creating an operator row with a random PIN if the vendor has none (writes `vendor_operators` in prod).
- `/scanner` + `/scanner/login` are their own route pair with `goodlife_scanner_session`; middleware redirects `/admin/scanner` → `/scanner` when a scanner session exists. "Protected by middleware" ≠ "admin cookie".
- `/api/hub/*` is **not** in the matcher: `hub/gallery` POST and `hub/radio` POST call `requireAdmin()`; `hub/waitlist` POST is intentionally public.
- `lib/rate-limit.ts` is per-instance in-memory (resets on cold start, useless across replicas) and is already wired onto admin/scanner/vendor/presenter login, tab self-pay, rsvp-free, till-submit, vendor STK, Paystack init, and PayHero init — follow that pattern for new sensitive routes.

## Phone numbers (the customer-audit join)

`lib/phone.ts` exists because the same human was recorded four ways (`tickets.phone_number` `"0712345678"`, `pos_split_payments.payer_phone` `"+254 712 345 678"`, `customer_tabs.customer_phone` `"254712345678"`, `tickets.whatsapp_number` `"0712 345 678"`), so a customer's tab didn't join to their ticket spend and "BALANCE DUE" read KES 0.

- **Never compare raw phone strings across tables.** Use `phoneMatchKey` / `phonesMatch` / `normalizePhone` (collapse everything to national `07XXXXXXXX`) and `toWhatsAppNumber` for `wa.me` links.
- `normalizePhone` returns `""` for anything it can't confidently read; `phonesMatch` is **false** whenever either side is empty — two blanks must never match, or every anonymous walk-in collapses into one phantom customer.

## WhatsApp gateway console (WAHA)

- `/admin/whatsapp` — pairing QR + test console. Polling is event-driven: fetch on mount, then 5s for `SCAN_QR_CODE`/`STARTING`, 10s for `OFFLINE`, and **stop entirely at `CONNECTED`**; also skipped while `document.hidden`.
- `lib/waha.ts` is the only egress to WAHA and is server-only (throws if imported in the browser). The base URL, `X-Api-Key`, version payloads, and WAHA's prose errors never reach a client — callers get only a `WahaStatus` (`STARTING | SCAN_QR_CODE | CONNECTED | OFFLINE`), a normalized `me`, and allow-listed messages.
- `app/api/admin/whatsapp/{qr,status,test,restart}` call `requireAdmin()` and **always answer HTTP 200** for a reachable gateway (401 when unauthenticated). `/qr` returns `{ status, me, qrRaw, qrDataUrl, sessionId, checkedAt }`.
- **Never add a route that forwards a WAHA body, or the gateway URL/credentials, to the client.** (An earlier version of this page printed the WAHA dashboard URL *and* its admin password.)
- Env: `WAHA_*` → `WHATSAPP_GATEWAY_*` → hardcoded defaults. `WAHA_*` takes priority so the console can point at a different engine while `lib/whatsapp.ts` (the ticket dispatcher) keeps using `WHATSAPP_GATEWAY_*` (+ `WHATSAPP_GATEWAY_TYPE`).
- `app/api/whatsapp/webhook` logs only a redacted shape summary; never write raw inbound bodies/phone numbers to a file (`webhook-logs.txt` is gitignored for that reason).

## Radio subsystem (GOODLIFE Radio 254)

- **A second, large product.** Home-server playout: AzuraCast + Liquidsoap + a Python FastAPI daemon (NVIDIA NIM for DJ copy, Fish Audio/Edge-TTS for Swahili voice, ffmpeg ducking/mastering); this Next.js app is the BFF/console and the public player. Read `docs/RADIO-SPECIFICATION.md` (architecture) and `docs/RADIO-PLAN.md` before touching it.
- **`radio.darajadigital.com` is a SEPARATE PROJECT — never route Goodlife streams, APIs, or metadata through it.** Public delivery is Cloudflare R2 (`goodlife` bucket) + Goodlife edge domains. `live-dj.darajadigital.com` is only an Icecast/harbor TCP-8005 ingest host for DJ decks (BUTT/Rekordbox), not a listener domain.
- Code: `lib/radio/*` (~40 modules: `sequencer`, `schedule-generator`, `playlist-slotter`/`-resolver`, `drop-engine`, `broadcast-state`, `r2-signer`, `ops-service`, `ai-drops`, `listener-tracker`, …), `context/RadioContext.tsx` + `context/SoundboardContext.tsx` (client state), `components/radio/*` and `components/admin/radio/*`.
- Pages: public `/radio`, `/radio/shows/[slug]`, `/radio/presenters/[slug]`, `/radio/schedule`, `/radio/apply`, `/radio/embed` (frame-embeddable via a CSP `frame-ancestors *` carve-out in `next.config.ts`); console `/admin/radio` (station managers only); `/presenter/{login,dashboard}`.
- APIs: `/api/radio/*` (mostly public listener reads/telemetry, allow-listed in the guard test), `/api/admin/radio/*`, `/api/presenter/*`, `/api/internal/radio-{auth,tick}` (machine HMAC), `/api/cron/radio-{schedule,reminders,drops,health-monitor}`, `/api/webhooks/radio-ingest` (HMAC `X-Bridge-Signature`).
- Env: `RADIO_UPSTREAM_URL` (server-only BFF upstream; unset → station shows offline), `RADIO_STREAM_URL` / `RADIO_STREAM_HIFI_URL` (+ `NEXT_PUBLIC_*`), `R2_RADIO_*`, `RADIO_R2_BUCKET`, `RADIO_USE_SIGNED_PLAYBACK` / `RADIO_PLAYBACK_TTL_SEC` / `RADIO_PLAYBACK_WINDOW_SEC`, `GOODLIFE_RADIO_SECRET_KEY`, `RADIO_BRIDGE_URL`/`RADIO_BRIDGE_SECRET`, `RADIO_DAEMON_SECRET`, `HARBOR_PASSWORD`, `ICECAST_SOURCE_PASSWORD`.
- 24 `tests/radio*.check.ts` cover playout, schedule, playlists, playback, signed playback, drops, ingest, sequencer, listeners, tips, shoutouts, contests.

## Tickets & gate scanning

- Ticket id **is** the merchant reference: `GL-XXXX`, and multi-ticket `GL-XXXX-1`, `-2`, … (`lib/payhero-fulfill.ts`). The PDF QR encodes `${APP_URL}/admin/scanner?ticket=<id>`; the scanner also accepts a raw id and `/admin/scan/<id>`.
- Scans are **partial admission**: `tickets.guest_count` vs `admitted_count`, with `is_scanned` flipping only once everyone is in. `processTicketScan` rejects a scan whose `event_id` doesn't match the ticket's (cross-event gate defense). Multi-ticket amounts are `amountPaid / quantity` per ticket.
- PDF generation reads `public/BebasNeue.ttf` from `process.cwd()` at runtime — the file must exist or every WhatsApp ticket send fails.

## Route map (non-obvious parts)

- Public: `/` (checkout), `/events`, `/events/[id]`, `/events/[id]/tickets/[tier]`, `/tickets/[tier]`, `/gallery`, `/radio*`, `/pay/tab/[id]`, `/pay/till`, `/login`, `/privacy`, `/terms`, `/refunds`.
  - `publicState` picks the component: `checkout` → `CheckoutClientPage`, `coming_soon` → `ScheduledEventClientPage`, `recap` → `ClosedEventClientPage`, `unavailable` → `notFound()`. All three client pages render `LiveMiniEventBanner`, so sellable minis are advertised even when the flagship isn't selling.
- Event switching is **client-side**: `handleSwitchEvent` inside `app/CheckoutClientPage.tsx` refetches tiers, rewrites the whole `eventDetails` object in state (re-running `resolveEventFlyer`/`resolveEventVideo`), then `window.history.pushState('…', '?event=<id>')` — no server round-trip. `app/page.tsx` reads `?event=` only for the initial render and `generateMetadata`. `EventSelector` is the admin-dashboard control.
- Gate scanner: `/scanner`, `/scanner/login` (own session, reached from the ticket QR via `/admin/scanner`).
- Admin: `/admin/dashboard` (~233 KB monolith: tickets, tiers, trash, events, vendors, settlements), `/admin/events/[id]/edit`, `/admin/scanner`, `/admin/vendors` (+`/[id]/qr`), `/admin/gallery`, `/admin/settlements`, `/admin/budget`, `/admin/radio`, `/admin/whatsapp`.
- Vendor POS: `/vendor/login`, `/vendor/menu`, `/vendor/sell` (~178 KB), `/vendor/sales`, `/vendor/tabs` (~73 KB) — per-event assignments, commission, split payments, customer tabs. `components/admin/VendorDetailDrawer.tsx` (~205 KB) is the admin-side customer audit for the same data.

## Half-removed payment code (do not resurrect blindly)

- `app/api/tickets/rsvp-free/route.ts` still issues a ticket for **no payment**, but the checkout's free-RSVP pipeline was deleted while the UI keeps `totalPrice === 0` branches ("KES 0 (FREE)", "INSTANT PASS ISSUED DIRECTLY TO WHATSAPP"). `CheckoutClientPage` guards the empty-ladder case *before anything else*, so a zero-ladder page can't hand out a pass that doesn't exist. KES 0 is a *discount*, never a giveaway.

## Conventions

- Tailwind v4, **no `tailwind.config.js`** — tokens live in `@theme` in `app/globals.css`. Type: `text-caption` / `text-footnote` / `text-body` (never `text-[Npx]`). Shadows: `shadow-(--shadow-brut-*)`. Haptics via `HapticFeedback.trigger()` (`components/ui/haptic-feedback.ts`). No daisyUI or shadcn.
- `tsconfig` alias is `@/*` → **project root**, not `src/`.
- `next.config.ts`: global security headers (with a `frame-ancestors *` carve-out for `/radio/embed`), `transpilePackages: ['motion']`, `outputFileTracingRoot: process.cwd()`, and **no** `output: "standalone"` (CLAUDE.md is wrong). Whitelisted remote image hosts: `picsum.photos`, `i.ibb.co`, `**.r2.dev`, `**.cloudflarestorage.com`, `**.hearthis.at`.
- `.eslintrc.json` is dead — ESLint 9 uses the flat `eslint.config.mjs`.
- `.netlify/`, `deno.lock`, `metadata.json`, `docs/root.bolt`, `schema*.sql` are Google AI Studio / Netlify CLI leftovers, not source of truth. `hooks/` has five plain React hooks (`use-eat-today`, `use-mobile`, `useCountdown`, `useOnlineStatus`, `use-audio-recorder`).
- Deploy: Vercel project `goodlife-event-tickets` (`.vercel/project.json`) via `vercel --prod --token=$env:VERCEL_TOKEN`. `vercel.json` is an empty schema stub — crons moved to the home-server daemon.
