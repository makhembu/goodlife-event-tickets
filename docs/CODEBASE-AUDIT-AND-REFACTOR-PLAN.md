# Codebase Audit & Refactor Plan

**Date:** 2026-11-15
**Scope:** `goodlife-event-tickets` working tree (ticketing + GOODLIFE Radio 254)
**Method:** static analysis — line counts, import-graph/orphan scan, export-usage scan, route-caller scan, duplicate-symbol scan, targeted source reads. No full test run was performed (see Phase 0). Counts are from the current tree and will drift.

---

## 1. Executive summary

The codebase is **functionally rich and reasonably tested**, but it has grown into two large products sharing one data layer, and the seams show:

- **Ticketing** is a well-understood domain wrapped around a **4,536-line, 104-export god module** (`lib/supabase-db.ts`) and a **4,508-line admin page with 66 `useState` hooks**.
- **Radio** has a genuinely modular server library (`lib/radio`, 39 modules, 8.3k lines) but a **front end that is 2.5× larger than that library** (20.6k lines), including a **3,230-line playback context** and panels with **64–79 `useState` hooks**.
- **90 radio API routes** (26 public + 64 admin) is an outsized surface for a station console — more than the entire ticketing admin API (46).
- Real security/correctness debt exists: **forged vendor sessions** (already documented), **hardcoded WAHA credentials** in an orphaned module, a **silent fallback to a `darajadigital.com` bridge URL**, and **runtime `ALTER TABLE`** inside request handlers.
- Cleanup is cheap and high-value: **7 orphaned source files**, **9 dead exports**, **5 admin routes with no in-repo caller**, and **tracked `__pycache__` artifacts**.

**Top 10 actions, in order**

| # | Action | Why | Effort |
|---|---|---|---|
| 1 | Fix `/api/vendor/*` HMAC verification (18 routes + middleware + test) | Anyone can forge a vendor session and read/write POS/tab data | 1–2 d |
| 2 | Fix `eslint.config.mjs` with `FlatCompat` | `npm run lint` is dead; no static quality gate | 0.5 d |
| 3 | Delete 7 orphan files + 9 dead DB exports + tracked `.pyc` | Removes attack surface and confusion | 0.5 d |
| 4 | Delete/fix `lib/radio/alerts.ts` and `lib/radio/bridge-client.ts` fallbacks | Hardcoded WAHA key + third-party `darajadigital.com` fallback | 0.5 d |
| 5 | Move runtime `ALTER TABLE` out of `createEvent`/`updateEvent` | Schema mutation on the request path; race/perf risk | 1 d |
| 6 | Collapse the 3 DB pools into one `lib/db/client.ts` | Inconsistent SSL/pool limits; radio depends on ticketing's god module just to run SQL | 2–3 d |
| 7 | Extract the playout engine from `context/RadioContext.tsx` | 3.2k lines, 68 refs, 33 callbacks — untestable as-is | 4–6 d |
| 8 | Split `ScheduleManager` / `PlaylistManagerPanel` / `PerformanceSoundboard` | 79/64/25 `useState`; hard to reason about, easy to regress | 5–8 d |
| 9 | Split `lib/supabase-db.ts` behind a barrel | 104 exports; every feature edits the same file | 5–8 d |
| 10 | Add CI: typecheck (incl. tests), build, grouped test suite, lint baseline | No gate today; `tests/` is not typechecked | 2–3 d |

**Healthy — do not "clean up" by accident**

- `lib/radio` is decomposed into small, single-purpose modules; 24 radio test files is above average.
- Auth secrets are fail-closed (no hardcoded fallback salts) and admin RBAC is enforced in middleware + handlers.
- PayHero fulfillment is idempotent and shared by initialize/verify/callback (`lib/payhero-fulfill.ts`).
- Event page routing is centralized in `publicState()` with a dedicated guard test.
- `lib/phone.ts` is the right abstraction; the problem is code that bypasses it, not the module itself.

---

## 2. Verified inventory

| Area | Measure |
|---|---|
| API route files | **207** |
| Pages (`page.tsx`) | **37** |
| Components (`components/**`) | **64 files** |
| `lib/**` files | **71** |
| Test files | **76** total = **64 `*.check.ts`** + **2 `*.e2e.ts`** + 10 helpers/fixtures |
| Lines: `app/` | **41,969** |
| Lines: `lib/` | **18,351** |
| Lines: `components/` | **29,666** |
| Lines: `context/` | **3,358** |
| Lines: `tests/` | **9,496** |
| Radio server lib | **8,291 lines / 39 modules** |
| Radio front end (`components/admin/radio` + `components/radio`) | **20,614 lines** |
| Radio API routes | **90** = 26 public (`app/api/radio`) + 64 admin (`app/api/admin/radio`) |
| Radio tests | **24** files |

Route distribution: admin **110** (64 radio + 46 ticketing), radio **26**, vendor **24**, presenter **11**, cron **5**, tickets **4**, events **4**, payhero **4**, scanner **4**, paystack **3**, hub **3**, internal **2**, webhooks **1**, whatsapp **1**. **`app/api/mpesa` does not exist.**

---

## 3. Findings

### 3.1 Security & correctness (P0)

**S1 — `/api/vendor/*` accepts forged vendor sessions.**
Already documented in `AGENTS.md` as Issue 1. 18 route files base64-decode `goodlife_vendor_session` without verifying the HMAC; `/api/vendor/:path*` is not in `config.matcher`. Executable plan already exists in `AGENTS.md`. **Do this first.**

**S2 — Hardcoded WhatsApp credentials in an orphaned module.**
`lib/radio/alerts.ts:34-35` defaults to `https://waha-ember.darajadigital.com` and `goodlife_waha_secret_2026` when env vars are missing, and talks to WAHA directly instead of `lib/waha.ts`. The file has **0 importers**, so deletion is the safe fix. If the alert feature is wanted, re-implement it on top of `lib/waha.ts`.

**S3 — Silent third-party bridge fallback.**
`lib/radio/bridge-client.ts:4-8` falls back to `https://invidious-bridge.darajadigital.com` when `RADIO_BRIDGE_URL` is unset. `AGENTS.md` says never route Goodlife traffic through `*.darajadigital.com`. A missing env var should fail closed (server error / station offline), not silently call another project. `getBridgeSecret()` already fails closed in production; the URL should do the same in every environment.

**S4 — Runtime DDL inside request handlers.**
`lib/supabase-db.ts:258,261` runs `ALTER TABLE events ADD COLUMN IF NOT EXISTS ...` inside `createEvent`/`updateEvent`. Schema changes belong in migrations, not on a user-triggered write path (locks, permission requirements, race conditions, and `ALTER` on every call).

**S5 — Three database clients / pools.**
- `lib/supabase-db.ts:9-38` builds its own `neonQuery` pool (via `require("pg")`).
- `lib/neon-client.ts:16-40` has a second `getDbPool()`/`query()` pool.
- `lib/radio/events.ts:40-55` has a third `getEventsDbPool()`.
- Radio routes import `neonQuery` from `@/lib/supabase-db` (177 references) — i.e. the radio backend depends on the ticketing god module **only to run SQL**.
- Pool limits/SSL/timeouts are duplicated and can drift; `lib/neon-client.ts` also carries Neon-specific hostname rewriting that is irrelevant on Supabase.

**S6 — Guard test only greps tokens.**
`tests/admin-routes-guarded.check.ts` accepts the *presence* of `getSession`/`getVendorSession`, so S1 stays green. It also cannot tell a verify call from a decode call. Harden it to accept only `verifyVendorSession`/`getTabActor`/`verifyAdminSession`/`requireAdmin`/`requirePresenter` and add a behavioral test.

**S7 — Hardcoding test is too narrow.**
`tests/radio-hardcoding-grep.check.ts` bans 7 branding strings (`goodlife.co.ke`, `98.4`, `Marara`, …). It does **not** guard `darajadigital`, hardcoded API keys, or `process.env.X || "literal"` fallbacks — which is why S2/S3 pass. Add patterns for those.

### 3.2 Radio-specific (P1)

**R1 — Front end dwarfs the server library.**
`lib/radio` is 8.3k lines across 39 focused modules. The radio UI is **20.6k lines** in a handful of files:

| File | Lines | `useState` | Notes |
|---|---:|---:|---|
| `components/admin/radio/PlaylistManagerPanel.tsx` | 3,368 | 64 | playlist editing, track table, harmonize, analysis |
| `components/admin/radio/ScheduleManager.tsx` | 3,250 | 79 | slots, shows, overrides, generation |
| `context/RadioContext.tsx` | 3,230 | 26 (`68 useRef`, `33 useCallback`, `14 useEffect`) | actual playout engine (queue, crossfade, drops, recovery) |
| `components/admin/radio/PerformanceSoundboard.tsx` | 1,877 | 25 | pads, banks, recording, audition |
| `app/admin/radio/page.tsx` | 1,561 | — | console shell routing many panels |
| `components/admin/radio/DropStudio.tsx` | 942 | 19 | AI drop authoring |
| `components/admin/radio/LibraryIngestDock.tsx` | 904 | 21 | ingest/search/batch |
| `components/admin/radio/OnAirRundown.tsx` | 811 | 12 | rundown + drawer |

**R2 — `RadioContext` is a playback engine wearing a context costume.**
68 refs and 33 callbacks mean the logic is imperative and lifecycle-bound. It cannot be unit-tested without React, so the most failure-prone part of radio (crossfades, drop timing, fallback recovery) is only covered by end-to-end/manual checks. Extract a framework-agnostic state machine.

**R3 — Duplicated helpers.**
- `KE_TZ` exported by both `lib/radio/events.ts` and `lib/radio/schedule-generator.ts`.
- `maskPhone` exported by both `lib/radio/ops-service.ts` and `lib/radio/shoutout-filter.ts`.
- Kenya timezone / `Africa/Nairobi` / +3h offsets appear in 7 radio modules plus `lib/phone.ts` call sites.
Consolidate into `lib/radio/time.ts` and reuse `lib/phone.ts`.

**R4 — Critical modules have zero direct tests.**
From the import/test map: `broadcast-state` (1 importer, 0 tests — the *authoritative playout state*), `slot-lifecycle`, `playlist-slotter`, `playlist-resolver`, `listener-analytics`, `lyrics-service`, `audio-mastering`, `playout-cache`, `messaging-provider`, `timeline` all have 0 test references. Some are covered indirectly, but the core lifecycle and state modules should have direct unit tests.

**R5 — Dead admin radio routes.**
No in-repo caller for `/api/admin/radio/analytics`, `/api/admin/radio/drops/fire`, `/api/admin/radio/tips`. Verify the Python daemon/bridge doesn't call them, then delete (or document the external contract). `/api/admin/whatsapp/status` is also unused — the console's `/qr` endpoint already returns status.

**R6 — Two playout stacks can drift.**
`home-server/daemon/services/{ai_copywriter,voice_synthesizer,audio_mixer,title_cleaner}.py` conceptually overlaps `lib/radio/{drop-engine,audio-mastering,utils}.ts`. That split is reasonable (heavy media work on the home server, orchestration in the BFF), but there is no written contract for which side owns what. Add a short `docs/RADIO-BRIDGE-CONTRACT.md` (request/response, who retries, who signs, who masters) before changing either side.

**R7 — Orphaned radio front-end components.**
`AzuraCastQueueCard`, `BroadcastConsole`, `CartwallSoundboard`, `RadioHeader` (all under `components/admin/radio/`) have **0 references**. Likely superseded by `OnAirRundown`, `PerformanceSoundboard`, and the console shell. Delete or wire them up — do not leave both.

### 3.3 Orphaned & dead code (P1/P2)

**Orphaned source files (0 inbound references, verified by name grep)**

| File | Likely replacement |
|---|---|
| `components/admin/radio/AzuraCastQueueCard.tsx` | queue UI in `OnAirRundown` / AzuraCast panel |
| `components/admin/radio/BroadcastConsole.tsx` | `app/admin/radio/page.tsx` shell |
| `components/admin/radio/CartwallSoundboard.tsx` | `PerformanceSoundboard.tsx` |
| `components/admin/radio/RadioHeader.tsx` | console shell header |
| `lib/radio/ai-drops.ts` | `lib/radio/drop-engine.ts` (`ai-drops` is a thin adapter) |
| `lib/radio/alerts.ts` | `lib/waha.ts` / `lib/radio/messaging-provider.ts` |
| `hooks/use-mobile.ts` | inline `matchMedia` or unused |

**Dead exports in `lib/supabase-db.ts` (9 defined but never called)**
`fetchVendorsForEvent`, `updateVendorEventAssignment`, `getVendorSettlement`, `exportVendorReport`, `deactivateOperator`, `fetchSalesForVendor`, `fetchVendorDashboardMetrics`, `fetchAllVendorMetrics`, `updateEventLifecycle`.

**Exported but internal-only (5)** — un-export or delete:
`clearTicketTiersCache`, `fetchAllTicketsAll`, `restoreTicket`, `restoreTicketTier`, `fetchPendingPayment`.

**Routes with no in-repo caller** — verify external consumers, then act:

| Route | Verdict |
|---|---|
| `/api/admin/radio/analytics` | likely dead — remove or wire |
| `/api/admin/radio/drops/fire` | likely superseded by `drops/dynamic` + `drops/live-inject` |
| `/api/admin/radio/tips` | likely superseded by `/api/radio/tips/*` |
| `/api/admin/verify-simulator-password` | dead — remove or wire |
| `/api/admin/whatsapp/status` | dead — `/qr` returns status |
| `/api/admin/paystack/{settlements,totals,transactions}` | dormant behind `NEXT_PUBLIC_ENABLE_PAYSTACK` — keep only if the flag will return |
| `/api/cron/radio-*`, `/api/internal/radio-tick`, `/api/paystack/callback`, `/api/radio/tips/callback` | **not dead** — called by daemon/bridge/provider |

**Repository hygiene**
- **9 `.pyc` files are tracked** under `home-server/daemon/**/__pycache__/`. Remove from git and add `__pycache__/` + `*.pyc` to `.gitignore`.
- Empty `utils/` directory — remove or populate.
- Untracked, already-ignored local artifacts: `results/` **373 MB**, `scratch/` **23 MB**, `research/` **7.8 MB**, `.superpowers/` 1.6 MB, `audit-shots/` 0.9 MB, `audit/` 0.4 MB, `test-assets/` 0.3 MB. Disk cleanup only — not a git problem.
- `.freebuff/`, `.workbuddy-ai/`, empty `assets/` — untracked leftovers; safe to delete locally.

**Stale documentation (verified)**
- `AGENTS.md` line 63 and line 104 claim `/api/mpesa/*` exists and that `createPendingPayment` has a client branch posting to `/api/mpesa/stkpush`. **Neither is true**: there is no `app/api/mpesa` directory, and `createPendingPayment` (`lib/supabase-db.ts:1763`) throws on the client and is server-only SQL.
- `CLAUDE.md` / `README.md` / `DESIGN.md` / `PRODUCT.md` still describe Neon + Paystack + Netlify. `AGENTS.md` is canonical; consider deleting or archiving these.

### 3.4 Monoliths (P1/P2)

| File | Lines | State | Target |
|---|---:|---|---|
| `lib/supabase-db.ts` | 4,536 | 104 exports, 71 `fetch`, 34 `any`, own DB pool, runtime DDL | `lib/db/*` domain modules + barrel |
| `app/admin/dashboard/page.tsx` | 4,508 | 66 `useState`, 35 `fetch`, ~60 inline handlers | tab components + data hooks + reducer |
| `components/admin/VendorDetailDrawer.tsx` | 3,800 | 43 `useState`, 57 `any`, inline phone normalization | tab components + typed models + `lib/phone` |
| `app/vendor/sell/page.tsx` | 3,485 | 63 `useState`, 8 `useEffect` | cart/payment hooks + presentational panels |
| `components/admin/radio/PlaylistManagerPanel.tsx` | 3,368 | 64 `useState` | editor hook + panels |
| `components/admin/radio/ScheduleManager.tsx` | 3,250 | 79 `useState` | editor hook + panels |
| `context/RadioContext.tsx` | 3,230 | 68 `useRef`, 33 `useCallback`, 14 `useEffect` | playout state machine + thin provider |
| `app/CheckoutClientPage.tsx` | 2,548 | 42 `useState` | step components + `useCheckout` |
| `app/admin/budget/page.tsx` | 2,220 | 26 `useState` | table/form sections + hook |
| `components/admin/radio/PerformanceSoundboard.tsx` | 1,877 | 25 `useState` | pad/bank/recording hooks + panels |
| `app/admin/radio/page.tsx` | 1,561 | — | console shell + lazy panels |

`any` density is highest at the radio state boundary: `playout-cache` 9.3/100 lines, `timeline` 3.4, `drop-gate` 3.2, `broadcast-state` 2.8, `cron-engine` 2.7, `drop-engine` 2.0. Typing these payloads is the cheapest correctness win in radio.

### 3.5 Quality gates (P1)

- **Lint is dead** (Issue 2). Fix `eslint.config.mjs` via `FlatCompat`; expect ~1.6k pre-existing problems in `app/lib/components/context/hooks`.
- **Tests are not typechecked.** `tsconfig.json` excludes `tests` and `scripts`. Add `tsconfig.tests.json` and run `tsc -p` in CI.
- **No CI.** 76 ad-hoc `tsx` scripts, some hitting the live DB. A workflow matrix can run typecheck, build, and test groups in parallel.
- **70 `console.*` calls in `lib/`.** Most are server-side diagnostics; introducing a tiny `lib/logger.ts` would let prod silence debug logs.
- **No `test` script** in `package.json`; add `test:types`, `test:unit`, `test:radio`, `test:all`.

---

## 4. Refactor recipes

### 4.1 `lib/supabase-db.ts` → `lib/db/*`

**Goal:** one module per domain, one DB client, zero behavior change.

1. Create `lib/db/client.ts`:
   - move the pool construction (and SSL/timeouts) here;
   - export `query()` and a `neonQuery` alias for compatibility;
   - migrate `lib/neon-client.ts` and `lib/radio/events.ts:getEventsDbPool()` to it, then delete the duplicates.
2. Split exports by domain into:
   `lib/db/events.ts`, `tiers.ts`, `tickets.ts`, `payments.ts` (`pending_payments`, PayHero, till), `vendors.ts`, `operators.ts`, `items.ts`, `pos.ts`, `tabs.ts`, `customers.ts`, `expenses.ts`, `budget.ts`, `gallery.ts`, `waitlist.ts`.
3. Keep `lib/supabase-db.ts` as a **barrel** (`export * from "./db/events"; …`) so 200+ import sites keep working. Update imports incrementally, then delete the barrel.
4. Delete the 9 dead exports; un-export the 5 internal-only helpers.
5. Remove the `typeof window === "undefined"` branching from server modules. Client callers already use `/api/*` fetch wrappers; put any remaining browser-side reads in `lib/db-client/*`.
6. Move `ALTER TABLE` out of `createEvent`/`updateEvent` into `migrations/ticketing/*.sql`; extend the existing radio migration runner (or add a ticketing twin) so schema is applied once at deploy.

**Acceptance:** `npm run build` green; `tests/public-state.check.ts`, `tests/manifest*`, ticketing suites green; no route imports `neonQuery` from `supabase-db` after the final step.

### 4.2 `app/admin/dashboard/page.tsx` → tab modules

1. Create `components/admin/dashboard/` with `TicketsTab`, `TiersTab`, `PaymentsTab`, `PendingPaymentsTab`, `WaitlistTab`, `DeletedTab`, `EventsTab`, and a `DashboardModals` group.
2. Extract data access into `hooks/admin/useTickets.ts`, `usePayments.ts`, `useTiers.ts`, `useDashboardMetrics.ts` — each owns its fetch/loading/error state.
3. Replace the 66 `useState` calls with:
   - one `useReducer` for UI state (active tab, modals, selection);
   - per-domain hooks for server data.
4. The page becomes a <300-line shell that composes tabs and passes event context.
5. Do **one tab per PR**, no behavior changes; keep the existing DOM/class names until the last PR.

**Acceptance:** dashboard smoke (ticket list, tier edit, payment export) unchanged; `build` green.

### 4.3 `components/admin/VendorDetailDrawer.tsx` → typed tabs

1. Split into `components/admin/vendor-detail/{OverviewTab,TabsTab,SalesTab,AuditTab,SplitPaymentsTab}.tsx`.
2. Replace the 57 `any` with types from `lib/supabase-db-types.ts`; extend that file rather than casting.
3. Replace the inline `replace(/\D/g,"")` + `startsWith("0")` chain (lines ~1029–1035) with `normalizePhone`/`phonesMatch`/`toWhatsAppNumber` from `lib/phone.ts`.
4. Add a fixture test proving the customer-audit join returns the same result for `0712…`, `+254 712…`, `254712…`, and `0712 345 678`.

**Acceptance:** the four phone formats join to one customer; drawer renders identically.

### 4.4 `app/vendor/sell/page.tsx` → POS hooks

1. `hooks/vendor/useCart.ts` (items, qty, totals, discounts).
2. `hooks/vendor/useSplitPayment.ts` (split legs, validation, submit).
3. `hooks/vendor/useVendorCatalog.ts` (categories/items/stock).
4. Presentational `components/vendor/sell/{ProductGrid,CartPanel,PaymentPanel,ReceiptModal}.tsx`.
5. Keep the existing API contract (`/api/vendor/sales`, `/api/vendor/tabs/*`) untouched.

**Acceptance:** a cash sale and a split sale produce identical rows in `pos_sales` / `pos_sale_items` / `pos_split_payments`.

### 4.5 Radio: playout engine + panels

**Playback engine**
1. Create `lib/radio/client-playout.ts` — a framework-agnostic controller/state machine with explicit states (`idle | loading | playing | crossfading | recovering | error`), an event emitter, and injectable audio/timer adapters.
2. Move queue advance, crossfade timing, drop injection, and fallback recovery out of `context/RadioContext.tsx` into it.
3. Create `hooks/useRadioPlayout.ts` that subscribes React state to the controller.
4. `RadioContext.tsx` becomes a thin provider + selectors (<400 lines).
5. Unit-test transitions without a DOM (fake timers/adapters): start, crossfade, drop fired, network error → fallback, recovery.

**Panels**
1. `ScheduleManager`: split into `ScheduleGrid`, `SlotEditor`, `ShowEditor`, `OverrideList`; move state to `hooks/radio/useScheduleEditor.ts` (reducer + async actions). Target <600 lines/file.
2. `PlaylistManagerPanel`: split into `PlaylistList`, `TrackTable`, `HarmonizePanel`, `AnalysisPanel`; `hooks/radio/usePlaylistEditor.ts`.
3. `PerformanceSoundboard`: split into `PadGrid`, `BankTabs`, `PadEditor`, `AudioAudition`; `hooks/radio/useSoundboard.ts`.
4. Create `lib/radio/client-api.ts` — typed fetch wrappers for every radio endpoint, so panels stop hand-writing URLs and error handling.
5. Consolidate `KE_TZ`/time helpers into `lib/radio/time.ts`; reuse `lib/phone.ts` and delete duplicate `maskPhone`.

**Acceptance:** `radio-playback`, `radio-sequencer`, `radio-schedule`, `radio-playlists`, `radio-automation-v3` green; new tests for `broadcast-state` and `slot-lifecycle`; no panel >800 lines.

### 4.6 `app/CheckoutClientPage.tsx` → checkout steps

1. `components/checkout/{TierPicker,CustomerForm,PaymentStep,SuccessStep}.tsx`.
2. `hooks/useCheckout.ts` owns tier/form/payment state.
3. **Preserve the empty-ladder guard as the first branch** — it is load-bearing (`never-invent-prices`).
4. Keep `handleSwitchEvent`'s client-side event rewrite + `pushState` behavior.

**Acceptance:** `tests/never-invent-prices.check.ts`, `public-state.check.ts` green; one e2e checkout against PayHero sandbox.

### 4.7 `app/admin/budget/page.tsx`

Extract `BudgetTable`, `ExpenseForm`, `SettlementSummary`, `hooks/admin/useBudget.ts`. Keep server aggregation in the existing API.

---

## 5. Phased plan

### Phase 0 — Stop the bleeding (2–3 days)
1. Fix Issue 1 (vendor HMAC) per the existing `AGENTS.md` plan: middleware matcher + branch, replace 18 decoders, harden `admin-routes-guarded`, add `tests/vendor-session-auth.check.ts`.
2. Fix Issue 2 (`FlatCompat` lint config, add `@eslint/eslintrc`).
3. Delete the 7 orphan files; remove the 9 dead exports; un-export the 5 internal-only helpers.
4. Delete `lib/radio/alerts.ts`; make `bridge-client.ts` fail closed (no `darajadigital` fallback).
5. Remove tracked `__pycache__`/`.pyc`; add ignore rules.
6. Correct the `/api/mpesa` claims in `AGENTS.md`.
7. Baseline: run the full verification suite and record pass/fail; run `npm run build`.

**Exit:** build green, suite baseline recorded, lint runs, no forged vendor session.

### Phase 1 — Data & security hardening (4–6 days)
1. Create `lib/db/client.ts`; migrate `neon-client` and `radio/events` pools; keep `neonQuery` as an alias.
2. Move runtime DDL into migrations.
3. Extend the hardening test to reject URL/secret fallbacks (`darajadigital`, `_secret`, `apiKey =`).
4. Verify external callers for the 5 dead admin routes; delete or document.
5. Add `tsconfig.tests.json` + `tsc -p` to the local check.

**Exit:** one DB client; no runtime DDL; guard tests fail on regressions.

### Phase 2 — Radio architecture (8–12 days)
1. Extract `client-playout.ts` + `useRadioPlayout`; shrink `RadioContext`.
2. Split `ScheduleManager`, `PlaylistManagerPanel`, `PerformanceSoundboard`.
3. Add `lib/radio/client-api.ts`, `lib/radio/time.ts`; remove duplicate `KE_TZ`/`maskPhone`.
4. Add direct tests for `broadcast-state`, `slot-lifecycle`, `playlist-slotter`, `playlist-resolver`, `listener-analytics`, `messaging-provider`.
5. Write `docs/RADIO-BRIDGE-CONTRACT.md` (TS ↔ Python daemon ↔ AzuraCast).

**Exit:** no radio file >800 lines; new state-machine + lifecycle tests; documented bridge contract.

### Phase 3 — Monolith decomposition (15–25 days, incremental)
Order (lowest risk first):
1. `lib/supabase-db.ts` → `lib/db/*` + barrel.
2. `app/admin/budget/page.tsx`.
3. `components/admin/VendorDetailDrawer.tsx`.
4. `app/vendor/sell/page.tsx`.
5. `app/admin/dashboard/page.tsx` (one tab per PR).
6. `app/CheckoutClientPage.tsx`.

**Exit:** each target under the size budget; `build` + suites green after each PR.

### Phase 4 — Quality gates (2–3 days)
1. GitHub Actions: `typecheck`, `build`, test groups (ticketing / auth / radio / db), `lint` with `--max-warnings` pinned to baseline.
2. `lib/logger.ts`; replace `console.*` in `lib/`.
3. Burn down `any` in `lib/radio` state boundaries.
4. Reconcile/archive stale docs; keep `AGENTS.md` as the single source of truth.

---

## 6. Targets & definition of done

| Metric | Today | Target |
|---|---|---|
| `lib/supabase-db.ts` | 4,536 lines / 104 exports | <300-line barrel + domain modules |
| Largest component | 4,508 lines | <800 lines |
| `useState` in one component | 79 | <15 (rest in hooks/reducers) |
| Orphan source files | 7 | 0 |
| Dead DB exports | 9 | 0 |
| Routes with no caller | 5 (review) | 0 or documented external contract |
| `/api/vendor/*` forged-cookie | allowed | 401 everywhere |
| `npm run lint` | crashes | runs, exit 0 or pinned baseline |
| Radio tests | 24 files, key modules uncovered | +6 direct tests |
| CI | none | typecheck + build + tests + lint |

**Definition of done for every refactor PR**
- No behavior change (same API contracts, same DB rows).
- `npm run build` green (it is the typechecker).
- Relevant `*.check.ts` green.
- One module/one tab per PR; no mixed refactor + feature.
- If a route or export is removed, grep the whole repo first and note the verification.

---

## 7. Risks & guardrails

- **Big-bang rewrites are the main risk.** Use the barrel pattern for `supabase-db` and tab-by-tab extraction for the dashboard; never freeze the repo for a multi-week branch.
- **Tests hit the live DB.** Before CI, either point `DATABASE_URL` at a disposable database or tag DB-touching tests and run them separately. Do not run `scripts/` (it mutates production event `2`).
- **Radio playout is timing-sensitive.** Extract the engine behind adapters and characterize current behavior with tests *before* changing timing constants.
- **`NEXT_PUBLIC_*` is build-time.** Removing/renaming Paystack flags requires a redeploy; don't assume a runtime toggle.
- **Do not delete the 4 radio components blindly** — confirm they aren't referenced by a dynamic registry; the scan found 0 name references, so deletion is safe.
- **Keep the invariants:** `publicState()` is the only page router; no fallback price ladder; never compare raw phone strings; admin cookie is not a presenter session.

---

## Appendix A — Reproduction commands

```powershell
# Line counts (true, including blanks)
node -e "const fs=require('fs');for(const f of ['lib/supabase-db.ts','app/admin/dashboard/page.tsx'])console.log(fs.readFileSync(f,'utf8').split(/\r?\n/).length,f)"

# Orphan/import scan
node $env:TEMP\opencode\orphan-scan.js   # created during this audit

# Exports used nowhere
node $env:TEMP\opencode\dead-exports.js

# Radio module usage + test refs
node $env:TEMP\opencode\radio-map.js

# Duplicate exports across lib/radio
node $env:TEMP\opencode\dup-exports.js

# Route caller scan
node $env:TEMP\opencode\route-scan.js

# Counts
(Get-ChildItem -Recurse -File app\api -Filter route.ts).Count
(Get-ChildItem tests -Filter *.check.ts).Count
```

The scripts above were written to `%TEMP%\opencode\` during the audit and are not part of the repo. Re-create them from this document or promote the useful ones into `tests/`.

## Appendix B — Cleanup checklist

- [ ] `components/admin/radio/AzuraCastQueueCard.tsx`
- [ ] `components/admin/radio/BroadcastConsole.tsx`
- [ ] `components/admin/radio/CartwallSoundboard.tsx`
- [ ] `components/admin/radio/RadioHeader.tsx`
- [ ] `lib/radio/ai-drops.ts`
- [ ] `lib/radio/alerts.ts`
- [ ] `hooks/use-mobile.ts`
- [ ] 9 dead exports in `lib/supabase-db.ts`
- [ ] 5 internal-only exports un-exported
- [ ] `/api/admin/radio/analytics`, `/drops/fire`, `/tips` (after external check)
- [ ] `/api/admin/verify-simulator-password`
- [ ] `/api/admin/whatsapp/status`
- [ ] `home-server/daemon/**/__pycache__/*.pyc` (untrack + ignore)
- [ ] empty `utils/`
- [ ] stale `/api/mpesa` claims in `AGENTS.md`
- [ ] `AGENTS.md` dashboard line count (~233 KB) → line count for clarity
