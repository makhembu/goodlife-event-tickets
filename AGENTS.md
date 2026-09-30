# GOODLIFE Event Tickets

Next.js 15 App Router + TypeScript + Tailwind v4. Single **Neon Postgres** database. Live M-Pesa payments via **PayHero STK push**. `CLAUDE.md`, `DESIGN.md`, and `PRODUCT.md` also exist — they drift; this file is the verified one.

## Commands

```sh
npm run dev     # next dev
npm run build   # next build  (this is the ONLY typecheck)
npm run start   # next start
npm run lint    # eslint .
npm run clean   # removes .next/ and tsconfig.tsbuildinfo
```

- `next.config.ts` sets `typescript.ignoreBuildErrors: false` + `eslint.ignoreDuringBuilds: true` — so **`npm run build` is the typechecker** (a red build = a TS error, not a lint error) and `npm run lint` must be run by hand.
- **A stale `.next/` crashes the build** with `TypeError: Cannot read properties of undefined (reading 'length')` and no stack trace, partway through "Creating an optimized production build". It is not a code error — bisect with `git stash` before debugging. `npm run clean` then `npm run build` fixes it.
- `tsconfig.json` sets `incremental: true`, and `tsconfig.tsbuildinfo` was **tracked in git while also being gitignored** (gitignore does not apply to tracked files). It is now untracked — don't re-add it, a stale committed copy reintroduces the crash above.
- There is no `typecheck` script; use `npx tsc --noEmit` for a fast check that skips the Next build.
- HMR is only disabled when `DISABLE_HMR=true` is present in the environment (checked in `next.config.ts` `webpack()`). It is **not** in `.env.local`; export it yourself (`$env:DISABLE_HMR="true"; npm run dev`).
- No test framework, no CI. Verification is manual plus ad-hoc `scripts/*.js` that hit the **live** database.
- `npm run lint` is currently **red on `main`-adjacent WIP**: ~12 pre-existing `react-hooks/set-state-in-effect` and `react/no-unescaped-entities` errors in `CheckoutClientPage`, `ClosedEventClientPage`, `admin/scanner`, `vendor/login`, `pay/tab/[id]`. Not caused by the current change; fix before trusting lint as a signal. `eslint.config.mjs` ignores `.netlify/**`, `replace.js` and `check.js` (all non-source), and the ignores **must** live in their own config object to act globally in flat config.

## Environment gotchas

- **`.env.local` has no `PAYHERO_*` keys** — local "Pay with M-Pesa" fails with "PayHero not configured" until you add them. Production values live only in the Vercel dashboard, never in a file.
- `.env.local` still carries legacy `DARAJA_*`; `/api/mpesa/*` is dead Daraja code (superseded by PayHero, and `README.md`/`CLAUDE.md` still describe it). Don't wire new work to it.
- `TAB_SELF_PAY_SECRET` silently falls back to `PAYHERO_CALLBACK_TOKEN`, then `DATABASE_URL` (`lib/self-pay-token.ts`) — links keep working, but set it explicitly.
- ~12 files in `scripts/` hardcode the production Neon URL **including the password**, and `.gitignore` doesn't exclude `scripts/`. Assume the prod DB credential is already leaked; don't add more, and treat DB-touching scripts as dangerous.
- `scripts/test-e2e-suite.js` is not a unit test: it connects to the live DB, INSERTs/UPDATEs tickets + waitlist rows for hardcoded event `2`, then deletes them. Don't run it casually.

## Data model (the thing most likely to be got wrong)

Two overlapping "event" models — mixing them breaks checkout, tiers, and gate scans:

| Source | Scope |
|---|---|
| `events` (many rows, `event_id` everywhere) | Real events: checkout, ticket tiers, tickets, vendors, gallery, radio, waitlist, gate scans |
| `event_details` (singleton `id = 1`) | Site-wide settings only: WhatsApp templates, `simulators_enabled`, `operator_notifications_enabled`, footer, `payment_contact`. Also the source for `app/layout.tsx` `generateMetadata` (page title/OG image) |

- `lib/supabase-db.ts` (~2700 lines) *is* the data layer. Every function branches on `typeof window === "undefined"`: server → Neon SQL, client → `fetch` to its own `/api/*` route. Adding a field means editing `lib/supabase-db-types.ts`, the function's server branch, and its client fallback.
- `lib/supabase-db.ts` module-loads a single `pg.Pool`. `lib/payhero-fulfill.ts` and several API routes build a **new `Pool` per call** and `pool.end()` it — that's the existing pattern. `lib/neon-client.ts` (`getDbPool`) is the cached singleton but is imported by only 2 files.
- **Supabase is vestigial.** `utils/` is empty and nothing in `app/`, `lib/`, or `components/` imports `@supabase/*`, despite `README.md`/`CLAUDE.md` describing a Supabase+Neon split and the deps still being installed. It's Neon-only.
- **No migration runner.** `schema-neon.sql` / `schema.sql` cover only 4 tables and are stale (no `events`, POS, or hub tables). Schema changes are one-off `scripts/*.js` that hand-parse `DATABASE_URL` from `.env.local` (there is no `dotenv` dependency). Check `scripts/` before assuming a column exists; add a new script rather than editing the old ones.

## Payments

1. **PayHero STK push (live, primary)** — `POST /api/payhero/initialize` → customer enters PIN → checkout polls `GET /api/payhero/verify` → ticket issued. The webhook `POST /api/payhero/callback` performs the same fulfillment, so both paths must stay idempotent through `lib/payhero-fulfill.ts`, keyed on `pending_payments.checkout_request_id` (our `GL-XXXX` external reference, not PayHero's own reference).
   - **Fee float (critical):** PayHero deducts collection fees from its *service wallet*, not from the incoming payment (the till settles separately). At zero balance, collections fail. `initialize` hard-blocks at 0 (503) and WhatsApp-alerts operators below `PAYHERO_MIN_BALANCE` (default 50). Monitoring failures must never block sales — that fail-open branch is deliberate.
2. **Manual till** — `POST /api/payments/till-submit` writes a `till_pending` row; an admin approves it in the dashboard (`/api/admin/pending-payments/approve`) before any ticket exists. The endpoint currently has **no UI caller**.
3. **Vendor tab self-pay** — public `/pay/tab/[id]?t=<hmac>`; the token is HMAC-SHA256 verified with `timingSafeEqual`. Never add an unauthenticated tab route (tab IDs are enumerable).
4. **Paystack** — code fully kept, hidden behind `NEXT_PUBLIC_ENABLE_PAYSTACK=true`. `NEXT_PUBLIC_*` is baked at build time, so toggling requires a redeploy.
5. `/api/mpesa/*` (Daraja) is legacy and unused by the UI.

## Auth & middleware

- Admin: hardcoded `admin@goodlife.com` / `GoodlifeAdmin2026!` → cookie `goodlife_admin_session=true` (1 day, httpOnly). No Supabase Auth. The same password is re-typed client-side to confirm permanent deletes in the dashboard trash.
- Simulator/dev-panel toggle has its own password, `GoodlifeSim2026!` (`/api/admin/verify-simulator-password`), stored per event as `simulators_enabled`.
- Vendor operator: 4-digit PIN → `goodlife_vendor_session` = base64 JSON (`vendorId`, `operatorId`, `role`, …), 12h. Decoded, not signed — treat every `vendorId` in a request body as untrusted.
- `middleware.ts` protects `/admin/*`, `/login`, `/vendor/*`, `/api/admin/*`, non-GET `/api/ticket-tiers`, `/api/event-details` PUT, and `/api/events/*` except public `GET /api/events/active`. **The `config.matcher` is an explicit allowlist**: a brand-new `/api/*` route is public until you add it there, and handlers should still call `requireAdmin()` (`lib/admin-auth.ts`) or re-check the cookie. `/api/hub/*` (gallery/radio writes) is currently unauthenticated.
- `lib/rate-limit.ts` is per-instance in-memory: it resets on cold start and is useless across replicas. It is already wired onto the login, vendor-auth, and payment-init POSTs — follow that pattern for new sensitive routes.

## WhatsApp gateway console (WAHA)

- **Admin:** `/admin/whatsapp` — pairing QR + test-message console for the WAHA engine. Polling is **event-driven, not timer-based**: fetch on mount, then `setInterval` at 5s for `SCAN_QR_CODE`/`STARTING`, 10s for `OFFLINE`, and **stop entirely at `CONNECTED`** (the interval is rebuilt from `status`, so teardown is automatic). Polling is also skipped while `document.hidden`.
- **`lib/waha.ts` is the only egress point to WAHA and is server-only** (it throws if imported in the browser). Everything WAHA returns is parsed, then discarded — the base URL, `X-Api-Key`, engine version payloads and WAHA's own prose errors (e.g. *"The headless Chromium session is booting up"*) never reach a client. Callers get only `WahaStatus` (`STARTING | SCAN_QR_CODE | CONNECTED | OFFLINE`), a normalized `me`, and short allow-listed messages.
- `app/api/admin/whatsapp/{qr,status,test}/route.ts` all call `requireAdmin()` and **always answer HTTP 200** for a reachable gateway (401 when unauthenticated), so the client never has to interpret an error body. `/qr` returns `{ status, me, qrRaw, qrDataUrl, sessionId, checkedAt }` — `qrRaw` is the pairing payload the page renders with the `qrcode` package, `qrDataUrl` is an inlined PNG fallback for WAHA builds that ignore `?format=raw`.
- **Never add a route that forwards a WAHA body, or the gateway URL/credentials, to the client.** An earlier version of this page printed the WAHA dashboard URL *and* its admin password in the UI; that card is now a sanitized "Gateway health" readout.
- Env: `WAHA_BASE_URL` / `WAHA_API_KEY` / `WAHA_SESSION_ID`, falling back to `WHATSAPP_GATEWAY_URL` / `WHATSAPP_API_KEY` / `WHATSAPP_SESSION_ID`, then hardcoded defaults (`https://waha.darajadigital.com`, session `default`). The `WAHA_*` names take priority so the console can be pointed at a different engine without disturbing the ticket dispatcher in `lib/whatsapp.ts`, which keeps using `WHATSAPP_GATEWAY_*`.

## Tickets & gate scanning

- Ticket id **is** the merchant reference: `GL-XXXX`, and for multi-ticket orders `GL-XXXX-1`, `-2`, … (see `lib/payhero-fulfill.ts`). The PDF QR encodes `${APP_URL}/admin/scanner?ticket=<id>`; the scanner also accepts a raw id and `/admin/scan/<id>`.
- Scans are **partial admission**: `tickets.guest_count` vs `admitted_count`, with `is_scanned` flipping only once everyone is in. `processTicketScan` rejects a scan when the scanner passes an `event_id` that doesn't match the ticket's (cross-event gate defense). Multi-ticket amounts are `amountPaid / quantity` per ticket.
- PDF generation reads `public/BebasNeue.ttf` from `process.cwd()` at runtime — the file must exist or every WhatsApp ticket send fails.

## Route map (non-obvious parts only)

- Public: `/` (checkout; `closed` **and** `scheduled` events render `ClosedEventClientPage`), `/events`, `/events/[id]`, `/gallery`, `/radio`, `/pay/tab/[id]`, `/login`, `/vendor/*`.
- Admin: `/admin/dashboard` (a ~180 KB monolith: tickets, tiers, trash, events, vendors, settlements), `/admin/scanner`, `/admin/vendors`, `/admin/gallery`, `/admin/settlements`, `/admin/whatsapp` (WAHA pairing console).
- Vendor POS: `/vendor/login`, `/vendor/menu`, `/vendor/sell`, `/vendor/tabs` — per-event vendor assignments with commission, split payments, and customer tabs.
- `components/EventSelector.tsx` is how users switch events (`/?event=<id>`); the root page always anchors to the flagship event without that param.

## Conventions

- Tailwind v4, **no `tailwind.config.js`** — tokens live in `@theme` in `app/globals.css`. Type: `text-caption` / `text-footnote` / `text-body` (never `text-[Npx]`). Shadows: `shadow-(--shadow-brut-*)` (never inline `shadow-[...]`). Haptics via `HapticFeedback.trigger()` in `components/ui/haptic-feedback.ts`. No daisyUI or shadcn.
- `tsconfig` alias is `@/*` → **project root**, not `src/` (`@/lib/…`, `@/components/…`).
- `motion` is in `transpilePackages`; `next.config.ts` also sets global security headers and allows only `picsum.photos` / `i.ibb.co` as remote image hosts.
- `.eslintrc.json` is dead — ESLint 9 uses the flat `eslint.config.mjs`.
- `.netlify/`, `deno.lock`, `metadata.json`, and `schema*.sql` are Google AI Studio / Netlify CLI leftovers, not source of truth.
- Deploy: Vercel project `goodlife-event-tickets` (`.vercel/project.json`) via `vercel --prod --token=$env:VERCEL_TOKEN`. `.netlify/netlify.toml` is an AI Studio export with a hardcoded absolute Windows `publish` path — not a real deploy config.
