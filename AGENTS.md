# GOODLIFE Event Tickets

Next.js 15 App Router + TypeScript + Tailwind v4. Single **Neon Postgres** database. Live M-Pesa payments via **PayHero STK push**. `CLAUDE.md`, `DESIGN.md`, and `PRODUCT.md` also exist — they drift; this file is the verified one. Last full re-verification: **2026-10-02**.

## Commands

```sh
npm run dev     # next dev
npm run build   # next build  (this is the ONLY typecheck)
npm run start   # next start
npm run lint    # eslint .
npm run clean   # removes .next/ and tsconfig.tsbuildinfo
npx tsx tests/<name>.check.ts   # the only verification suite (see below)
```

- `next.config.ts` sets `typescript.ignoreBuildErrors: false` + `eslint.ignoreDuringBuilds: true` — so **`npm run build` is the typechecker** (a red build = a TS error, not a lint error) and `npm run lint` must be run by hand. Build was **green** on 2026-10-02.
- **A stale `.next/` crashes the build** with `TypeError: Cannot read properties of undefined (reading 'length')` and no stack trace, partway through "Creating an optimized production build". It is not a code error — bisect with `git stash` before debugging. `npm run clean` then `npm run build` fixes it.
- `tsconfig.json` sets `incremental: true`, and `tsconfig.tsbuildinfo` was **tracked in git while also being gitignored** (gitignore does not apply to tracked files). It is now untracked — don't re-add it, a stale committed copy reintroduces the crash above.
- There is no `typecheck` script; use `npx tsc --noEmit` for a fast check that skips the Next build.
- HMR is only disabled when `DISABLE_HMR=true` is present in the environment (checked in `next.config.ts` `webpack()`). It is **not** in `.env.local`; export it yourself (`$env:DISABLE_HMR="true"; npm run dev`).
- No CI, no test framework, no `test` npm script. Verification is the `tests/*.check.ts` scripts plus manual clicking; the rest of `scripts/*.js` hits the **live** database.
- `npm run lint` is currently **red**: **37 problems (24 errors, 13 warnings)** across 15 files, all pre-existing. `react/no-unescaped-entities` and `react-hooks/set-state-in-effect` dominate, over `CheckoutClientPage`, `ClosedEventClientPage`, `components/StoryDeckHero.tsx`, `components/admin/VendorDetailDrawer.tsx`, `components/ui/PwaInstallButton.tsx`, `admin/dashboard`, `admin/gallery`, `admin/settlements`, `admin/whatsapp`, `login`, `pay/tab/[id]`, `scanner`, `vendor/login`, `vendor/sales`, `vendor/sell`. Read the count against this baseline before blaming your change. `eslint.config.mjs` ignores `.netlify/**`, `replace.js` and `check.js` (all non-source), and the ignores **must** live in their own config object to act globally in flat config.

## Verification suite (`tests/`, tracked)

Each file is a standalone `tsx` script that prints `PASS`/`FAIL` lines and exits non-zero on failure. Run them all:

```powershell
Get-ChildItem tests -File | ForEach-Object { npx tsx $_.FullName; if ($LASTEXITCODE) { "FAILED: $($_.Name)" } }
```

| File | Locks down |
|---|---|
| `public-state.check.ts` | every `publicState` / `getEventAvailability` routing rule + the routing↔payment agreement invariant (**47 passing**) |
| `never-invent-prices.check.ts` | no fallback tier ladder, no `\|\| 1` event fallback, till/paystack reject a missing tier (11) |
| `phone.check.ts` | `lib/phone.ts` normalization across every shape the codebase stores (35) |
| `scanner-vendor-auth.check.ts` | signed-cookie tampering / wrong-secret / wrong-role rejection (14) |
| `customer-audit-unification.check.ts` | types + queries that join tickets, POS splits and tabs into one customer |
| `manifests.check.ts` | the three scoped PWA manifests, `public/sw.js`, and that **no root `app/manifest.ts` exists** |
| `event-media.check.ts` | `resolveEventFlyer` / `resolveEventVideo` defaults and custom-URL precedence |
| `story-deck.check.ts` | `components/StoryDeckHero.tsx` contract (poster + teaser, `playsInline`) |

All 8 passed on 2026-10-02. `public-state.check.ts --live` re-runs the same decisions read-only against the real database. **Add a case before changing routing, pricing, phone matching, session auth, or PWA scope.**

`tests/` is deliberately *outside* `scripts/`: `.gitignore` excludes `scripts/` because the ad-hoc DB scripts there hardcode the production Neon password, so a verification tool the codebase depends on must not live there. The one-off data repair (`scripts/repair-event-status.js`, writes to prod, dry-run by default) stays untracked in `scripts/` alongside its peers — recreate it from this file's description if you ever need it again.

## Environment gotchas

- `.env.local` contains **only**: `DATABASE_URL`, `APP_URL`, legacy `DARAJA_CONSUMER_KEY`/`DARAJA_CONSUMER_SECRET`, `WHATSAPP_GATEWAY_URL`/`WHATSAPP_API_KEY`/`WHATSAPP_SESSION_ID`, `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`. Production values live only in the Vercel dashboard, never in a file.
- **Absent locally, and each one fails or degrades differently — do not assume a local env is "just missing keys":**
  - `PAYHERO_*` → checkout returns "PayHero not configured".
  - `ADMIN_PASSWORD` → `POST /api/admin/login` returns **500 "Server misconfiguration"** (fail-closed, not a bypass). `/login` is therefore untestable locally without adding it.
  - `SIMULATOR_PASSWORD`, `GATE_SCANNER_PIN` → those toggles/PINs simply never match.
  - `SCANNER_SESSION_SECRET` / `VENDOR_SESSION_SECRET` → **fall through to a hardcoded literal salt** (`"goodlife_scanner_secret_salt"` / `"goodlife_vendor_secret_salt"` in `middleware.ts`, `app/api/scanner/auth`, `app/api/scanner/session`, `app/api/vendor/auth`). With those unset, vendor/scanner session cookies are **forgeable by anyone who reads this repo**. Never let them be unset in production.
  - `TAB_SELF_PAY_SECRET` falls back to `PAYHERO_CALLBACK_TOKEN`, then `DATABASE_URL` (`lib/self-pay-token.ts`) — links keep working, but set it explicitly.
- `.env.example` documents only `GEMINI_API_KEY`, `APP_URL`, `DATABASE_URL`, `PAYHERO_*`, `TAB_SELF_PAY_SECRET`, `PAYSTACK_*`, `NEXT_PUBLIC_ENABLE_PAYSTACK`, `WHATSAPP_GATEWAY_*`, `VERCEL_TOKEN`. It does **not** mention `ADMIN_PASSWORD`, `SIMULATOR_PASSWORD`, `GATE_SCANNER_PIN`, `SCANNER_SESSION_SECRET`, `VENDOR_SESSION_SECRET`, `WAHA_*`, or `OPERATOR_WHATSAPP_NUMBERS` — add them there if you touch auth.
- `/api/mpesa/*` is dead Daraja code (superseded by PayHero, and `README.md`/`CLAUDE.md` still describe it). Don't wire new work to it — note `lib/supabase-db.ts`'s *client* branch of `createPendingPayment` still posts to `/api/mpesa/stkpush`; the live PayHero routes call the server branch instead. `app/api/vendor/mpesa/stk` is a *misnomer*: it drives PayHero.
- ~110 files in `scripts/` hardcode the production Neon URL **including the password**. `scripts/`, `backups/`, `scan-qr.html`, `SECURITY-AUDIT.md`, `/research/`, root `*.png`, and root debug files (`check.js`, `fix.js`, `test-checkout-cli.js`, `audit-shots/`) are untracked and excluded in `.gitignore` so credentials, DB dumps and audit findings don't leak. Assume the credential is already burned; don't add more, and treat DB-touching scripts as dangerous.
- `scripts/test-e2e-suite.js` is not a unit test: it connects to the live DB, INSERTs/UPDATEs tickets + waitlist rows for hardcoded event `2`, then deletes them. Don't run it casually.

## Data model (the thing most likely to be got wrong)

Two overlapping "event" models — mixing them breaks checkout, tiers, and gate scans:

| Source | Scope |
|---|---|
| `events` (many rows, `event_id` everywhere) | Real events: checkout, ticket tiers, tickets, vendors, gallery, radio, waitlist, gate scans |
| `event_details` (singleton `id = 1`) | Site-wide settings only: WhatsApp templates, `gate_pin`, `simulators_enabled`, `operator_notifications_enabled`, footer, `payment_contact`. Also the source for `app/layout.tsx` `generateMetadata` (page title/OG image) |

- `lib/supabase-db.ts` (~150 KB) *is* the data layer. Every function branches on `typeof window === "undefined"`: server → Neon SQL, client → `fetch` to its own `/api/*` route. Adding a field means editing `lib/supabase-db-types.ts`, the function's server branch, and its client fallback.
- `lib/supabase-db.ts` module-loads a single `pg.Pool`. `lib/payhero-fulfill.ts` and several API routes build a **new `Pool` per call** and `pool.end()` it — that's the existing pattern. `lib/neon-client.ts` (`getDbPool`) is the cached singleton but is imported by only 2 files.
- **Supabase is vestigial.** `utils/` is empty and nothing in `app/`, `lib/`, or `components/` imports `@supabase/*`, despite `README.md`/`CLAUDE.md` describing a Supabase+Neon split and the deps still being installed. It's Neon-only. (`.agents/skills/supabase-*` are just vendored skill docs.)
- **No migration runner.** `schema.sql` / `schema-neon.sql` (76 lines) define 4 tables — `events`, `tickets`, `event_details`, `pending_payments` — and are stale even on those (the `events` DDL predates `flyer_url` edits, and has no `video_url`, `sales_open_date`, recurrence or POS/hub columns). The live DB has ~23 tables including `pos_sales`, `pos_sale_items`, `pos_split_payments`, `customer_tabs`, `tab_transactions`, `vendor_event_assignments`, `vendor_items`, `vendor_operators`, `vendors`, `event_gallery`, `event_waitlist`, `radio_sets`. Schema changes are one-off `scripts/*.js` that hand-parse `DATABASE_URL` from `.env.local` (there is no `dotenv` dependency). Grep `lib/supabase-db.ts` for the column before assuming it exists; add a new script rather than editing the old ones.

## Payments

1. **PayHero STK push (live, primary)** — `POST /api/payhero/initialize` → customer enters PIN → checkout polls `GET /api/payhero/verify` → ticket issued. The webhook `POST /api/payhero/callback` performs the same fulfillment, so both paths must stay idempotent through `lib/payhero-fulfill.ts`, keyed on `pending_payments.checkout_request_id` (our `GL-XXXX` external reference, not PayHero's own reference).
   - **Fee float (critical):** PayHero deducts collection fees from its *service wallet*, not from the incoming payment (the till settles separately). At zero balance, collections fail. `initialize` hard-blocks at 0 (503) and WhatsApp-alerts operators below `PAYHERO_MIN_BALANCE` (default 50). Monitoring failures must never block sales — that fail-open branch is deliberate.
2. **Manual till** — `POST /api/payments/till-submit` writes a `till_pending` row; an admin approves it in the dashboard (`/api/admin/pending-payments/approve`) before any ticket exists. The endpoint currently has **no UI caller**.
3. **Vendor tab self-pay** — public `/pay/tab/[id]?t=<hmac>`; the token is HMAC-SHA256 verified with `timingSafeEqual`. Never add an unauthenticated tab route (tab IDs are enumerable). Vendor-initiated tab STK is `/api/vendor/mpesa/stk` (PayHero under the hood).
4. **Paystack** — code fully kept, hidden behind `NEXT_PUBLIC_ENABLE_PAYSTACK=true`. `NEXT_PUBLIC_*` is baked at build time, so toggling requires a redeploy.
5. `/api/mpesa/*` (Daraja) is legacy and unused by the UI.

## Event lifecycle (read this before touching routing or status)

There is **one** function that decides which public page an event gets: `publicState()` in `lib/event-availability.ts`, returning `recap | coming_soon | checkout | unavailable`. `app/page.tsx` calls it and nothing else. The rule order is:

1. `status === 'closed'` → `recap`
2. `status === 'archived'` or `archived_at` set → `unavailable` (404)
3. `getEventAvailability().reason === 'not_live'` → `coming_soon`
4. `reason === 'not_open_yet'` → `coming_soon`
5. `category === 'mini'` → `checkout`
6. `reason === 'event_finished'` → `recap`
7. otherwise → `checkout`

- **`status` is a hand-set label; the recurrence engine is the truth for minis.** A mini festival parked on `scheduled` is sellable today, so gating its page on `status` would show a countdown while the payment API took its money. Never re-derive page choice from `status` anywhere else.
- **Anything that advertises "on sale" must use `isEventSellable(e)`** (`lib/event-availability.ts`, wraps `getEventAvailability().sellable`), not a `status` comparison. `app/page.tsx` uses it for `liveMiniEvents`; the payment routes use the same predicate. A banner that disagrees with checkout is a dead end.
- **`recurrence_pattern` supports only `daily | weekly | biweekly | none`.** Anything else (e.g. `monthly`) logs `[event-availability] recurrence_pattern="monthly" is not supported yet` and is treated as **non-recurring**, so availability silently falls back to the one-shot `event_date`. If you're adding a cadence, add it to `cadenceFor()` *and* a `public-state.check.ts` case.
- **The `active` → `live` legacy value.** The old event-editor `<select>` and the old "re-open event" button both wrote `status = 'active'`, which `getEventAvailability` rejects — so those events rendered a working checkout page and refused **every** payment. `canonicalStatus()` now folds `active` to `live`, and every status read goes through it. If you add a status comparison anywhere, use `canonicalStatus`, not `e.status`. Once `scripts/repair-event-status.js` has been run against prod, the fold is no longer load-bearing.
- **Never invent prices.** There is *no* fallback tier ladder anywhere, and that is deliberate: `CheckoutClientPage` used to fall back to eight hardcoded flagship tiers for any event with zero DB tiers, and `fetchTicketTiers` used to INSERT them from an unauthenticated `GET /api/ticket-tiers`. Both are gone. Zero tiers means zero tiers — `app/page.tsx` downgrades a tierless checkout to `coming_soon` (with `tiersPending` for distinct copy), and `CheckoutClientPage` refuses submit before anything else and shows an empty-state panel. Do not reintroduce a default ladder, and do not make a read function write.
- **`sales_open_date` / `sales_close_date` are editable** ("Tickets Open" / "Tickets Close", `datetime-local`, entered as Kenya time — the column is a naive EAT string). They gate both the page and payment. Do not add a second hand-rolled auto-open rule.
- **Closing ≠ archiving.** `POST /api/events/[id]/archive` takes an explicit `mode`: `activate` | `close` | `archive`. `closeEvent()` sets `status='closed'` and keeps the recap page; `archiveEvent()` stamps `archived_at` and 404s it. The old boolean `activate` flag made the dashboard's END/CLOSE button *archive* as well as close. For backward compat `activate: true` still works; absent a `mode`, it archives.
- `isHiddenFromSite()` shares `publicState`'s rule for "may this be linked" (the editions switcher, the mini promo). Use it rather than re-checking `archived_at`.

## Media: posters, teaser video, and the hero

- `lib/event-flyer.ts` is the only place media URLs are decided: `resolveEventFlyer(event)` → `/flyer.png`, or `/flyer-park-chill.png` when `category === 'mini'` or the title/subtitle mentions chill/park & chill/sunday (a custom `flyer_url` other than `/flyer.png` always wins). `resolveEventVideo(event)` → `/videos/goodlife-hype.mp4` or `/videos/park-chill-speakers.mp4` by the same rule, with `events.video_url` winning. Both are wired in `app/page.tsx`'s `eventDetails` object, so adding an event column means adding it there too.
- **`components/admin/PosterUploader.tsx` uploads straight from the browser to ImgBB with a hardcoded API key** (`api.imgbb.com/1/upload?key=…`). There is no server route and no auth in front of it. That is also why `i.ibb.co` is one of only two whitelisted `images.remotePatterns` hosts in `next.config.ts`. Don't assume posters land in the repo — they land in a third-party bucket.
- `components/StoryDeckHero.tsx` is the Instagram-story-style hero on **both** checkout and coming-soon pages: 3.5s poster countdown → teaser autoplay, with poster/video expand lightboxes. `tests/story-deck.check.ts` guards the `playsInline` / Next `<Image>` contract.
- `public/` holds real production assets (`BebasNeue.ttf`, `flyer*.png`, `promo.mp4`, `videos/*.mp4` ~5.5–7.5 MB each). They are not build artifacts — don't gitignore or "clean" them.

## Progressive Web Apps (scoped, deliberately)

- There are **three** manifests — `public/manifests/{vendor,scanner,admin}.json` — referenced from `metadata.manifest` in `app/{vendor,scanner,admin}/layout.tsx`, each with its own `scope` and `start_url`. **There must be no root `app/manifest.ts`**; it would bleed the Vendor POS install prompt onto every public visitor's phone. `tests/manifests.check.ts` fails if one appears.
- `public/sw.js` is hand-written (no `serwist`/`next-pwa`): precaches only icons, serves network-first, and **skips every `/api/` request** — so it can never serve stale money or ticket state. It also returns a plain-text 503 "Terminal Offline - Reconnecting..." instead of failing the fetch.
- `components/ui/PwaInstallButton.tsx` registers `/sw.js` in a `useEffect` and is the only registration site — the checkout page itself is not installable. It renders `null` unless Chrome fired `beforeinstallprompt` or the UA is iOS (which gets a manual Add-to-Home-Screen guide).
- Icons are per-surface (`public/icons/{vendor,scanner,admin}-*.png` plus maskable variants). Adding a surface means a new manifest, a layout `metadata` entry, and its icons.

## Auth & middleware

- Admin: `admin@goodlife.com` / `<set in env: ADMIN_PASSWORD>` → cookie `goodlife_admin_session=true` (1 day, httpOnly). No Supabase Auth. The same password is re-typed to confirm permanent deletes in the dashboard trash, and doubles as the gate-scanner superuser bypass. `requireAdmin()` (`lib/admin-auth.ts`) is just a cookie check.
- Simulator/dev-panel toggle has its own password, `<set in env: SIMULATOR_PASSWORD>` (`/api/admin/verify-simulator-password`), stored per event as `simulators_enabled`.
- **Scanner and vendor sessions are HMAC-SHA256 signed**, cookie value `base64url(payload).base64url(sig)`, verified with Web Crypto in `middleware.ts` (Edge runtime) and `createHmac` in the issuing routes. Secrets: `SCANNER_SESSION_SECRET` / `VENDOR_SESSION_SECRET` → `TAB_SELF_PAY_SECRET` → `PAYHERO_CALLBACK_TOKEN` → **hardcoded salt** (see Environment gotchas). Scanner payload requires `role === "scanner"`; vendor payload requires a `vendorId`. Gate PIN is `event_details.gate_pin` → `GATE_SCANNER_PIN` → admin password (each a plain `===` compare, not `timingSafeEqual`, unlike the admin password).
- **`middleware.ts` verifies the signature, but route handlers decode the payload without it** (e.g. `app/api/vendor/mpesa/stk`, `lib/vendor-tab-auth.ts`). So a `vendorId` from a request *body* is always untrusted — that guard is the edge middleware, not the handler. Keep it that way: don't add a `/api/vendor/*` route outside `config.matcher`.
- `lib/vendor-tab-auth.ts` accepts the admin cookie as a **superuser** on customer tabs (`getTabActor` / `tabOwnershipGuard`), so the admin customer-audit drawer can record payments and settle balances. Vendor operators only pass for their own tabs; tabs with a NULL `vendor_id` are legacy and stay open to all vendors.
- `/admin/vendors/[id]/login-as` lets an admin impersonate a vendor, **creating an operator row with a random PIN** if the vendor has none. Changes `vendor_operators` in production.
- `/scanner` + `/scanner/login` are their own route pair with `goodlife_scanner_session`; middleware redirects `/admin/scanner` → `/scanner` when a scanner session exists. Don't assume "protected by middleware" means "admin cookie".
- **`config.matcher` is an explicit allowlist**: `/admin/:path*`, `/scanner*`, `/login`, `/vendor/*`, `/api/admin/*`, `/api/scanner/*`, `/api/vendor/*`, `/api/event-details`, `/api/ticket-tiers/*`, `/api/events/*`. A brand-new `/api/*` route is **public** until you add it there. Public carve-outs: `GET /api/events/active`, `GET /api/ticket-tiers`, `GET /api/admin/me`, `/api/admin/{login,logout}`, `/api/scanner/{auth,logout,session}`, `/api/vendor/{auth,logout,mpesa/status}`, admin cookie on `/api/vendor/tabs/*`.
- `/api/hub/*` is **not** in the matcher, so those handlers must self-guard: `hub/gallery` POST and `hub/radio` POST call `requireAdmin()`; `hub/waitlist` POST is intentionally public (it is the public waitlist signup). There are 81 API routes total — check yours.
- `lib/rate-limit.ts` is per-instance in-memory: it resets on cold start and is useless across replicas. It is already wired onto admin login, scanner auth, vendor login, tab self-pay, rsvp-free, till-submit, vendor STK, Paystack init and PayHero init — follow that pattern for new sensitive routes.

## Phone numbers (the customer-audit join)

`lib/phone.ts` exists because the same human was recorded four ways — `tickets.phone_number` `"0712345678"`, `pos_split_payments.payer_phone` `"+254 712 345 678"`, `customer_tabs.customer_phone` `"254712345678"`, `tickets.whatsapp_number` `"0712 345 678"` — so a customer's tab balance didn't join to their ticket spend and "BALANCE DUE" read KES 0 for someone with an open tab.

- **Never compare raw phone strings across tables.** Use `phoneMatchKey` / `phonesMatch` / `normalizePhone`, which collapse everything to national `07XXXXXXXX`, and `toWhatsAppNumber` for `wa.me` links.
- `normalizePhone` returns `""` for anything it can't confidently read (letters, wrong length, landlines) and `phonesMatch` is **false** whenever either side is empty — two blanks must never match, or every anonymous walk-in collapses into one phantom customer.

## WhatsApp gateway console (WAHA)

- **Admin:** `/admin/whatsapp` — pairing QR + test-message console for the WAHA engine. Polling is **event-driven, not timer-based**: fetch on mount, then `setInterval` at 5s for `SCAN_QR_CODE`/`STARTING`, 10s for `OFFLINE`, and **stop entirely at `CONNECTED`** (the interval is rebuilt from `status`, so teardown is automatic). Polling is also skipped while `document.hidden`.
- **`lib/waha.ts` is the only egress point to WAHA and is server-only** (it throws if imported in the browser). Everything WAHA returns is parsed, then discarded — the base URL, `X-Api-Key`, engine version payloads and WAHA's own prose errors (e.g. *"The headless Chromium session is booting up"*) never reach a client. Callers get only `WahaStatus` (`STARTING | SCAN_QR_CODE | CONNECTED | OFFLINE`), a normalized `me`, and short allow-listed messages.
- `app/api/admin/whatsapp/{qr,status,test}/route.ts` all call `requireAdmin()` and **always answer HTTP 200** for a reachable gateway (401 when unauthenticated), so the client never has to interpret an error body. `/qr` returns `{ status, me, qrRaw, qrDataUrl, sessionId, checkedAt }` — `qrRaw` is the pairing payload the page renders with the `qrcode` package, `qrDataUrl` is an inlined PNG fallback for WAHA builds that ignore `?format=raw`.
- **Never add a route that forwards a WAHA body, or the gateway URL/credentials, to the client.** An earlier version of this page printed the WAHA dashboard URL *and* its admin password in the UI; that card is now a sanitized "Gateway health" readout.
- Env: `WAHA_BASE_URL` / `WAHA_API_KEY` / `WAHA_SESSION_ID`, falling back to `WHATSAPP_GATEWAY_URL` / `WHATSAPP_API_KEY` / `WHATSAPP_SESSION_ID`, then hardcoded defaults (`https://waha.darajadigital.com`, session `default`). The `WAHA_*` names take priority so the console can be pointed at a different engine without disturbing the ticket dispatcher in `lib/whatsapp.ts`, which keeps using `WHATSAPP_GATEWAY_*` (plus a `WHATSAPP_GATEWAY_TYPE` switch).
- `app/api/whatsapp/webhook` logs only a redacted shape summary — it must never write raw inbound bodies/phone numbers to a file (`webhook-logs.txt` is gitignored for that reason).

## Tickets & gate scanning

- Ticket id **is** the merchant reference: `GL-XXXX`, and for multi-ticket orders `GL-XXXX-1`, `-2`, … (see `lib/payhero-fulfill.ts`). The PDF QR encodes `${APP_URL}/admin/scanner?ticket=<id>`; the scanner also accepts a raw id and `/admin/scan/<id>`.
- Scans are **partial admission**: `tickets.guest_count` vs `admitted_count`, with `is_scanned` flipping only once everyone is in. `processTicketScan` rejects a scan when the scanner passes an `event_id` that doesn't match the ticket's (cross-event gate defense). Multi-ticket amounts are `amountPaid / quantity` per ticket.
- PDF generation reads `public/BebasNeue.ttf` from `process.cwd()` at runtime — the file must exist or every WhatsApp ticket send fails.

## Route map (non-obvious parts only)

- Public: `/` (checkout), `/events`, `/events/[id]`, `/gallery`, `/radio`, `/pay/tab/[id]`, `/login`.
  - `publicState` picks the component: `checkout` → `CheckoutClientPage`, `coming_soon` → `ScheduledEventClientPage`, `recap` → `ClosedEventClientPage`, `unavailable` → `notFound()`. The three client pages all render `LiveMiniEventBanner` so sellable mini festivals are advertised even when the flagship isn't selling.
- Event switching is **client-side**: `EventSelector` / `LiveMiniEventBanner` call `handleSwitchEvent`, which refetches tiers, rewrites the whole `eventDetails` object in state (re-running `resolveEventFlyer`/`resolveEventVideo`), and then `window.history.pushState('…', '?event=<id>')` so the URL stays shareable **without a server round-trip**. `app/page.tsx` only reads `?event=` for the initial server render and for `generateMetadata`. The root page always anchors to the flagship when the param is absent.
- Gate scanner: `/scanner`, `/scanner/login` — its own session, reached from the ticket QR via `/admin/scanner`.
- Admin: `/admin/dashboard` (a ~262 KB monolith: tickets, tiers, trash, events, vendors, settlements), `/admin/scanner`, `/admin/vendors`, `/admin/gallery`, `/admin/settlements`, `/admin/whatsapp` (WAHA pairing console).
- Vendor POS: `/vendor/login`, `/vendor/menu`, `/vendor/sell` (~135 KB), `/vendor/sales`, `/vendor/tabs` (~75 KB) — per-event vendor assignments with commission, split payments, and customer tabs. `components/admin/VendorDetailDrawer.tsx` (~186 KB) is the admin-side customer audit for the same data.

## Half-removed payment code (do not resurrect blindly)

- `app/api/tickets/rsvp-free/route.ts` still exists and issues a ticket for **no payment**, but the checkout's free-RSVP pipeline was deleted — and the UI still contains `totalPrice === 0` branches ("KES 0 (FREE)", "INSTANT PASS ISSUED DIRECTLY TO WHATSAPP"). `CheckoutClientPage` guards the empty-ladder case *before anything else* (line ~643), because a zero-ladder page computes `totalPrice === 0` and would otherwise hand out a pass that doesn't exist. KES 0 is meant to be a *discount*, never a giveaway.

## Conventions

- Tailwind v4, **no `tailwind.config.js`** — tokens live in `@theme` in `app/globals.css`. Type: `text-caption` / `text-footnote` / `text-body` (never `text-[Npx]`). Shadows: `shadow-(--shadow-brut-*)` (never inline `shadow-[...]`). Haptics via `HapticFeedback.trigger()` in `components/ui/haptic-feedback.ts`. No daisyUI or shadcn.
- `tsconfig` alias is `@/*` → **project root**, not `src/` (`@/lib/…`, `@/components/…`).
- `motion` is in `transpilePackages`; `next.config.ts` also sets global security headers and allows only `picsum.photos` / `i.ibb.co` as remote image hosts. It sets `outputFileTracingRoot: process.cwd()` and **no** `output: "standalone"` — `CLAUDE.md`'s "output: standalone" claim is wrong.
- `.eslintrc.json` is dead — ESLint 9 uses the flat `eslint.config.mjs`.
- `.netlify/`, `deno.lock`, `metadata.json`, `docs/root.bolt`, and `schema*.sql` are Google AI Studio / Netlify CLI leftovers, not source of truth. `hooks/` holds three plain React hooks (`use-eat-today`, `use-mobile`, `useCountdown`).
- Deploy: Vercel project `goodlife-event-tickets` (`.vercel/project.json`) via `vercel --prod --token=$env:VERCEL_TOKEN`. `.netlify/netlify.toml` is an AI Studio export with a hardcoded absolute Windows `publish` path — not a real deploy config.