# Temporary playback links — implementation brief

**Date:** 13 November 2026 (v2 — rewritten as a self-contained handoff brief)
**Implements:** *"Listeners still press play, but instead of a public link the server hands out a temporary one that expires. Same sound, no free downloads."*
**Read with:** `docs/COMPLIANCE-FIX-PLAN.md` (Wave B) and `docs/COMPLIANCE-AUDIT.md` (findings 3.2 / section 4 item 3). Where this brief differs from Wave B, **this brief wins** — see §3.
**Status:** specification only. **No application code, bucket setting or database was changed.**
**How to use this file:** hand it to a coder or paste it into a fresh AI coding session. It is meant to be sufficient on its own. Everything in §2 and §4 was re-read from the working tree on 13 November 2026; line numbers are approximate and must be re-confirmed before editing.

---

## 0. Copy-paste brief for the coder

> You are working in `C:/Users/Khesh/Downloads/goodlife-event-tickets`, a Next.js 15 App Router + TypeScript + Tailwind v4 festival-ticketing app with a large GOODLIFE radio module and a single Neon Postgres database. Music files for the radio currently live in a **public Cloudflare R2 bucket** and public APIs return their raw URLs; `components/radio/FestivalSetVault.tsx` even renders a "Download Master MP3" link.
>
> **Task:** make radio audio playable only through short-lived, server-signed links; remove the download link and stop exposing raw bucket keys in public responses. **Listeners must still be able to press play and hear continuous audio with no restart, no login and no extra click.** Do not break the ticketing site, live HLS/Icecast streaming, cover art, OG images, or the admin upload flow.
>
> **Hard constraints:** no database migration; no new paid service; no changes to production data; additive code only; do not run any migration or script against a production database; do not print or commit secret values; never fall back to a public URL when signing fails — fail closed.
>
> **Tooling already available:** Cloudflare Wrangler 4.86.0 is installed globally and **already logged in** (verified 13 November 2026: `wrangler whoami` and `wrangler r2 bucket list` both succeed). Bucket creation, public-access control and object work can all be done from the terminal — **no dashboard needed**. See §1.8. Wrangler's login is separate from the app's S3 API keys; do not confuse the two.
>
> **Definition of done:** the checklist in §11 passes. Start by reading §1 and §2 of this file, then implement §6 in order. Report back using the template in §13.

---

## 1. Repository context you must have before editing

### 1.1 Stack and layout

| | |
|---|---|
| Framework | Next.js 15 App Router, TypeScript, Tailwind v4. Path alias `@/` → repo root. |
| Database | Single Neon Postgres, accessed through `neonQuery()` in `lib/supabase-db.ts`. No ORM. |
| Storage | Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Two helpers: `lib/radio/r2-signer.ts` (radio) and `lib/r2-storage.ts` (general). |
| Player | `context/RadioContext.tsx` — a single client-side context with three `<audio>` elements, a 24/7 virtual timeline, a live-stream path and a backup-mix path. ~2,700 lines. |
| Radio admin | `app/api/admin/radio/**`, `components/admin/radio/**`. Public listener APIs are `app/api/radio/**`. |
| Second system | `home-server/` (Python daemon + Liquidsoap/AzuraCast) is an **independent playout stack**. It archives 320 kbps live sets to R2. |

### 1.2 Commands and verification (from `AGENTS.md` — read it first)

```sh
npm run dev                 # next dev
npm run build               # next build — THIS IS THE ONLY REAL TYPECHECK
npm run start               # next start
npm run lint                # eslint .
npm run clean               # removes .next/ and tsconfig.tsbuildinfo
npx tsc --noEmit            # fast typecheck that skips the Next build
.\node_modules\.bin\tsx.cmd tests/<name>.check.ts   # run one verification suite
```

- `next.config.ts` sets `typescript.ignoreBuildErrors: false` and `eslint.ignoreDuringBuilds: true`. **A red build = a TypeScript error.**
- **A stale `.next/` crashes the build** with `TypeError: Cannot read properties of undefined (reading 'length')` and no stack trace. It is not your code. Run `npm run clean` then `npm run build`.
- `tsconfig.tsbuildinfo` is gitignored and must stay untracked.
- **There is no `test` npm script and no test framework.** Verification is the standalone `tests/*.check.ts` scripts run with the **local** `tsx.cmd`, not `npx tsx` (npm 11 on this machine fails with `could not determine executable to run` inside a `ForEach-Object` loop).
- `npm run lint` is **already red**: 37 problems (24 errors, 13 warnings) across 15 files, all pre-existing. Compare against that baseline; do not try to fix unrelated lint, and do not blame it on this change.
- `next.config.ts` sets global security headers; `app/radio/embed` is deliberately exempted from `X-Frame-Options: DENY` with `frame-ancestors *`. Do not disturb that.

### 1.3 Non-negotiable project rules (from `docs/BUILD-SPEC.md`)

- Migrations are **additive and idempotent only** (`CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Never drop or rewrite. **This wave needs no migration at all.**
- **Never run a migration against a production database.** `scripts/migrate.js` applies every `.sql` in `migrations/radio/` to whatever `DATABASE_URL` points at. Do not add a file there for this wave.
- **New `/api/radio/*` routes are public by default** — `middleware.ts` `config.matcher` (lines 286–297) covers only `/admin`, `/scanner`, `/vendor`, `/presenter`, `/api/admin`, `/api/scanner`, `/api/presenter` and `/api/event-details`. Your new route must guard itself.
- **Missing secrets must fail closed.** No hardcoded fallback salts or domains in new code.
- Work on a branch; commit in small logical steps; follow the existing brutalist navy/cream UI style; say what was not done rather than guessing.

### 1.4 The route-guard test will fail unless you do one thing

`tests/admin-routes-guarded.check.ts` scans **every** exported HTTP handler under `app/api/**` and requires either in-handler auth or an entry in `NON_ADMIN_PUBLIC_ALLOWLIST` (a `Map<string, string>` at lines 52–109) with a documented reason. A new public `app/api/radio/playback/route.ts:GET` **must be added to that map** with a rationale string, or the suite goes red. Existing radio entries there include `app/api/radio/state/route.ts:GET` and `app/api/radio/recordings/route.ts:GET`.

### 1.5 Environment variable quirks

- `lib/radio/r2-signer.ts::getR2()` calls a local `readEnvLocal()` helper that reads `.env.local` **from disk** if `process.env` is empty. It requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (defaults to a literal bucket name) and **`R2_PUBLIC_DOMAIN`** — it returns `null` if the public domain is missing. `lib/r2-storage.ts::getR2Client()` uses `process.env` only and also requires `R2_PUBLIC_DOMAIN`.
- **`.env.example` drift:** it documents `R2_RADIO_BUCKET` and `R2_RADIO_PUBLIC_URL`, but the code reads `R2_BUCKET_NAME` and `R2_PUBLIC_DOMAIN`. Reuse the **names the code actually reads**, and add any new names to `.env.example` with blank values (names only — never values).
- `lib/r2-storage.ts::extractR2Key()` (lines 31–65) turns a URL into a bare key; it recognises the host via `R2_PUBLIC_DOMAIN`, `.r2.dev` or `.r2.cloudflarestorage.com`. Prefer the stored bare `r2_key` columns over parsing URLs.
- Production values live only in the Vercel dashboard. Never read, print or commit them.

### 1.6 Two playout systems — know which one you are touching

1. **R2 virtual timeline** (`autodj` / `mania` / `curated` modes): the browser downloads a whole MP3 from R2 and seeks to a clock-computed offset. `/api/radio/state`, `/api/radio/live`, `/api/radio/playlists/[id]`, `/api/radio/recordings` supply those URLs. **This wave changes this path.**
2. **Live HLS / Icecast** (`live` mode): `/api/radio/live` proxies `RADIO_UPSTREAM_URL` and passes through `nowPlaying` / `upNext` from an external relay; `RadioContext.tsx` attaches `radio_settings.live_stream_url` directly to `<audio>`. **Those URLs are not our R2 keys — pass them through unchanged.** `lib/radio/bitrate.ts` only rewrites live mount names (64k ↔ 192k); it has nothing to do with R2.

`app/api/radio/state/route.ts` also returns `drops[]` and `upcoming_drop` with `audio_url` (lines ~295–329). Drops are uploaded to `radio/drops/` in R2 by `lib/radio/r2-signer.ts::uploadDropBufferToR2()`, so **drops need signing too** or AI presenter drops will go silent. Some local sample files under `public/radio/samples/` are plain `/...` paths — the signer must pass those through untouched.

**Four distinct sources of audio addresses now exist**, and all four must be handled: (1) `radio_sets.audio_url` / `r2_key`; (2) `radio_recordings.audio_url` / `r2_key`; (3) `radio_drops.audio_url` (R2 `radio/drops/*`); (4) `soundboard_pads.audio_url` (added in commit `b39cae3`, used by `lib/radio/cron-engine.ts::executeCronRadioDrops()` and `components/admin/radio/PerformanceSoundboard.tsx`). Plus the pass-through categories: live HLS/Icecast URLs, upstream relay URLs, `blob:` URLs and local `/public/...` files.

### 1.7 Working-tree state and a very recent commit

Another process was editing this repo while this brief was written. Those changes have now been committed as **`b39cae3` "feat(radio): database-driven soundboard pads & dynamic fallback drops"**, touching `app/api/admin/radio/drops/generate/route.ts`, `components/admin/radio/PerformanceSoundboard.tsx`, `lib/radio/cron-engine.ts` and `scripts/radio_playout_follower.py`. At the time of writing the working tree is clean apart from the three untracked `docs/*.md` files from this audit.

This matters because that commit introduced a **fourth source of audio URLs**: `soundboard_pads.audio_url`. `lib/radio/cron-engine.ts::executeCronRadioDrops()` now falls back to a `SELECT audio_url FROM soundboard_pads …` query when generated audio is missing, and `components/admin/radio/PerformanceSoundboard.tsx` previews and assigns `p.audio_url` in the admin console (lines ~174, ~1586–1595). If those values point into the radio audio bucket, **admin previews and fallback drops will break when the bucket becomes private**. Include them in the §2 inventory sweep and in S8. Do not revert or reformat those four files; re-read them immediately before any edit and keep your diff minimal.

### 1.8 Wrangler is installed and authenticated — use it for bucket work

Verified on 13 November 2026 from this workspace:

| Check | Result |
|---|---|
| `command -v wrangler` → `/c/Users/Khesh/AppData/Roaming/npm/wrangler` | Global install, **Wrangler 4.86.0** |
| `wrangler whoami` | exit 0 — **logged in** |
| `wrangler r2 bucket list` | exit 0 — has R2 access |
| `wrangler.toml` / `wrangler.jsonc` in repo | **none** |
| `wrangler` in `package.json` | **not present** |

**Implications for the coder — do not get these wrong:**

1. **Call the global binary directly** (`wrangler ...`). `npx --no-install wrangler ...` fails here because Wrangler is not a local dependency; `npx wrangler ...` would try to download it. Add Wrangler to the repo only if you deliberately choose to, and note it in the report.
2. **No `wrangler.toml` is needed** for these R2 commands — they work against the logged-in account, with no config file. Do not create one just for this wave.
3. **Wrangler's login is NOT the app's signing credential.** `signRadioPlaybackUrl()` signs with `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` from the environment — an R2 API token pair, separate from Wrangler's OAuth/API-token session. The existing env values are already in place; reuse them. **Never print, copy or commit them.** If they are missing in an environment, signing must fail closed; Wrangler being logged in does not fix that.
4. **Wrangler cannot set Vercel environment variables.** `RADIO_R2_BUCKET` and the flag must still be added to the Vercel dashboard (and `.env.example`, names only). Wrangler only manages Cloudflare-side resources.

**Useful commands for this wave** (names only — no bucket values, account ids or tokens are written here):

```sh
wrangler whoami                                   # confirm login
wrangler r2 bucket list                           # confirm access; find existing bucket name
wrangler r2 bucket create <NEW_PRIVATE_BUCKET>   # create the radio-only bucket
wrangler r2 bucket info <NEW_PRIVATE_BUCKET>     # inspect it
wrangler r2 bucket dev-url get <NEW_PRIVATE_BUCKET>      # check public r2.dev status
wrangler r2 bucket dev-url disable <NEW_PRIVATE_BUCKET>  # ensure it is PRIVATE
wrangler r2 object get <BUCKET>/<KEY> --file <path>      # fetch one object
wrangler r2 object put <BUCKET>/<KEY> --file <path> --content-type audio/mpeg
wrangler r2 object delete <BUCKET>/<KEY>                 # delete one object
wrangler r2 bucket cors ...                       # only if browser CORS is needed
wrangler r2 bucket lifecycle ...                 # optional: scoped cleanup policy
```

**Key point:** a newly created R2 bucket is private by default, but **verify** with `dev-url get` and disable explicitly with `dev-url disable`. Never run `dev-url enable` on the new bucket.

**Bulk copy between buckets:** Wrangler has `object get` / `object put` / `object delete` but **no bucket-to-bucket copy command**. For the one-time copy of `radio/*`, `radio/recordings/*` and `radio/drops/*`, prefer a one-off script using the **already-installed** `@aws-sdk/client-s3` with `ListObjectsV2Command` + `CopyObjectCommand` (server-side copy, no public egress, no download to your machine). `lib/r2-storage.ts` already imports `ListObjectsV2Command`, so the pattern exists in the repo. Run it with the existing R2 credentials from the environment, **dry-run first** (print the key list and counts, no writes), and do not commit the script — `scripts/` is gitignored and historically contains production credentials. Wrangler `object get`/`put` is fine as a fallback for a handful of files, but it moves bytes through your machine.

**Do NOT make the existing bucket private** (§3.1) — it must stay public for ticketing images. At cutover, delete **only the radio audio objects** from the old bucket, scoped to the `radio/` prefixes, after enumerating exact keys. Never issue a broad or wildcard delete, and never run `wrangler r2 bucket delete` on the existing bucket.

### 1.9 What NOT to change

- The existing public R2 bucket's access setting (see §3).
- Any ticketing, vendor, scanner, settlement or payment code.
- `middleware.ts`, `next.config.ts` security headers, or `public/sw.js` audio-bypass rules (the service worker deliberately skips caching `/\.(mp3|m3u8|ts|aac)/` and `/listen/`).
- Live stream URLs and the 64k/192k quality toggle.
- Any database schema, migration file, or production data.

---

## 2. Verified current state (re-read from the working tree)

### 2.1 Where raw audio addresses reach the browser

| File | Lines | What it does today |
|---|---|---|
| `app/api/radio/state/route.ts` | 123–132, 145–152, 156–168, 341–361 | SELECTs `s.audio_url, s.audio_high_url` into `sets[]`, plus `drops[]` / `upcoming_drop` with `audio_url`, and `live.fallback_set`. Response `Cache-Control: public, s-maxage=10, stale-while-revalidate=15`; route also has `revalidate = 5` and a 5-second in-memory `_stateDbCache`. |
| `app/api/radio/live/route.ts` | 46–63, 122, 147, 193, 279–305, 341–362 | `getTimelineFallback()` builds `now_playing.audio_url`, `up_next[].audio_url`, `live_drop`. In live mode (lines ~428–431) it passes through upstream `nowPlaying` / `upNext` unchanged. Responses use `Cache-Control: public, s-maxage=3, max-age=0, must-revalidate`. |
| `app/api/radio/recordings/route.ts` | 13–33, 61–84 | Public GET, `WHERE r.is_public = true`, returns **`audio_url` and the raw `r2_key`** in JSON. `s-maxage=30, stale-while-revalidate=60`. |
| `app/api/radio/playlists/[id]/route.ts` | 28–56 | SELECTs `s.audio_url, s.audio_high_url` into `tracks[]`. `s-maxage=30, stale-while-revalidate=60`. |
| `app/api/radio/playlists/route.ts` | ~9 | Playlist metadata only — no audio URL. No change needed. |
| `app/api/hub/radio/route.ts` | 29–39 | Admin/hub POST INSERT into `radio_sets` (relevant to Wave A, not to playback). |
| `lib/radio/cron-engine.ts` | ~240–265 (post-`b39cae3`) | Fallback drop audio now resolved via `SELECT audio_url FROM soundboard_pads …`; the chosen URL is written into the drop that airs. |
| `components/admin/radio/PerformanceSoundboard.tsx` | 174, 1586–1595 | Admin pad preview / assignment reads `soundboard_pads.audio_url` directly. |
| `app/radio/shows/[slug]/page.tsx` | 94, 209, 317 | SELECTs `audio_url`; line 209 is a **`.ics` calendar download — leave it**; line 317 is a native `<audio controls src={rec.audio_url}>`. |
| `components/radio/FestivalSetVault.tsx` | 227–236 | `<a href={rec.audio_url} download target="_blank" title="Download Master MP3">`. **Delete this.** |
| `components/radio/CatchUpVault.tsx` | 11, 152, 155–165 | `playSet({ … audio_url: rec.audio_url })` and `currentSet?.audio_url === rec.audio_url` — the equality check will break. |
| `context/RadioContext.tsx` | 629, 1130, 1176, 1194, 1936, 2034, 2288, 2483 | `audio.src = ...` assignments. |
| `context/RadioContext.tsx` | 823, 1301, 1725, 1875, 2599 | `s.audio_url === audio.src` track-identity comparisons. |
| `lib/radio/config.ts` | 33 | `metadataPollIntervalMs: 10_000` → **the player polls metadata every 10 seconds**, with error backoff up to 60 s. |
| `lib/radio/r2-signer.ts` | 1–10, 36–54, 56–85, 89–151, 170–193 | Imports `PutObjectCommand`, `DeleteObjectCommand`, multipart commands — **no `GetObjectCommand`**. `getR2()` requires `R2_PUBLIC_DOMAIN`. Upload helpers build `publicUrl = ${publicDomain}/${key}`. |
| `lib/radio/audio-prober.ts` | 33–38, 67–71 | Runs `ffprobe` / `ffmpeg -sseof` against the raw URL. Called by `app/api/admin/radio/register-upload/route.ts` and `app/api/webhooks/radio-ingest/route.ts`. |
| `home-server/daemon/services/archiver.py` | 43, ~193 | Builds `public_url = f"{r2_public_domain}/{r2_key}"` for 320 kbps masters; inserts `is_public=False`. |
| `scripts/radio-bridge-server.py` | — | Builds public URLs from `R2_PUBLIC_DOMAIN` for ingested audio and covers. |
| `lib/radio/soundboard-helpers.ts` | 46 | Recognises `.r2.dev` hosts. |
| `lib/event-flyer.ts` | 3–4 | Falls back to a hardcoded public R2 domain for event flyers — **proof the bucket is shared with ticketing**. |

### 2.2 Other facts

- `radio_sets` has **no create-table migration in the tracked repo**; its columns are defined by `lib/radio/types.ts::RadioSet` plus INSERT statements. Relevant columns that already exist: `id, audio_url, audio_high_url, r2_key, r2_high_key, duration_sec, bitrate, bitrate_high, is_active, deleted_at, processing_status, source_type, external_id`. `radio_recordings` has `r2_key, audio_url, is_public, approved_at, bitrate`. **No schema change is needed.**
- `middleware.ts` matcher (lines 286–297) does **not** include `/api/radio/*`; all those routes are public.
- `tests/radio-playback.check.ts` already exists and asserts BFF cache headers, cover-art resolution, title fallbacks and source hygiene. Extend it rather than creating a competing file.
- `tests/radio-shoutouts.check.ts`, `tests/radio-bitrate.check.ts` etc. follow the same `tsx` + `PASS`/`FAIL` + non-zero-exit convention.

---

## 3. Architecture decision — read this before writing code

### 3.1 Never make the existing bucket private

It holds event flyers, posters, gallery images, videos and OG/social preview images (`lib/event-flyer.ts`, `lib/r2-storage.ts`, `components/admin/PosterUploader.tsx`, `components/admin/VideoUploader.tsx`, `app/admin/gallery/page.tsx`, `app/api/og/radio`). Turning off public access breaks the **ticketing site**. Create a **second bucket** for radio audio only, public access off. Reuse the same R2 account and credentials — no new paid service, no new secret. Copy existing radio objects bucket-to-bucket (no public egress) and keep the originals for the rollback window. **Wrangler is installed and logged in (§1.8), so `wrangler r2 bucket create` and `wrangler r2 bucket dev-url disable` do this from the terminal — no dashboard step.** The existing bucket stays public; at cutover only its `radio/` audio objects are deleted, never the bucket's public access or any image.

### 3.2 Recommended design: a stable redirect endpoint (D2)

The earlier Wave B note described putting a signed URL directly into every API payload. That works, but it creates three hard problems (URL churn, CDN caching, cross-instance determinism — see §4). **Prefer this instead:**

```
listener presses play
  → player uses a STABLE app URL: /api/radio/audio/<track_id>     (never changes)
  → that route validates the row, signs a short-lived R2 GET URL
  → returns 307 redirect to the signed URL
  → browser fetches the audio bytes directly from R2
```

The `audio.src` string is now **permanent**, so there is nothing to churn, nothing to refresh, nothing to expire out of a cached API response. Each play/seek/reconnect re-enters the route and gets a fresh signature. Audio bytes still come from R2 — the app host only issues a redirect, so bandwidth cost stays near zero.

**Trade-off to validate first:** some iOS Safari versions are fussy about redirected media with byte-range requests. Before committing to D2, run the §10 manual checks (seek, lock screen, embed). If redirected playback fails on iOS, fall back to **D1** below.

### 3.3 Fallback design: direct signed URLs (D1)

If D2 fails validation, put `playback_url` into the API payloads instead — **but** you must then:
- use a `signingDate` fixed to a rounded window boundary (or a shared cache), because `getSignedUrl()` embeds the current timestamp in `X-Amz-Date`; **an in-memory cache alone is not enough** — serverless instances do not share memory, so two instances would produce different URLs and the player would restart;
- guard every `audio.src` assignment with a changed-string check;
- keep TTL far above every `s-maxage`;
- add a refresh-before-expiry / on-error path.

If the installed `@aws-sdk/s3-request-presigner` version does not accept `signingDate`, implement determinism with a module-level cache keyed by `key:window` **and** add a test that two calls in one window produce byte-identical URLs; note in the report that cross-instance stability is then unverified.

### 3.4 Rejected: server proxy

Streaming all audio bytes through a Next.js route (`/api/radio/audio/[id]` returning the object body) is the simplest correctness-wise but moves **all audio bandwidth onto the app host**. With no budget, reject it. Keep it only if you later need it for admin previews of private recordings.

### 3.5 Invariants (do not violate)

1. `audio.src` is either a stable app URL (D2) or a deterministic, window-stable signed URL (D1).
2. No public response contains `r2_key`, `r2_high_key`, `audio_high_url` or a raw bucket URL.
3. A missing credential or missing key returns an error / `null` — **never** a public URL.
4. Only our own R2 keys are signed. Live-stream URLs, upstream relay URLs, `/public/...` local files and blob URLs pass through unchanged.
5. `is_public = false` recordings are unreachable by a listener even if they guess the old address.
6. The ticketing site, cover art, OG images, live HLS and admin upload flow still work.
7. Drops (`radio/drops/*`) remain playable.
8. No database migration, no schema change, no production data change.
9. Range/seek support is verified before public access is switched off.
10. A signed link is not DRM: it is shareable while valid, and a listener can still record the stream. Do not claim otherwise.

---

## 4. The five failure modes (and the exact fix)

| # | Failure | Why it happens here | Fix |
|---|---|---|---|
| 1 | **Audio restarts every 10 s** | `lib/radio/config.ts:33` polls metadata every 10,000 ms. A fresh URL in each `/api/radio/state` response changes `audio.src` at `RadioContext.tsx:629` etc. | D2 removes the problem entirely (stable URL). Under D1: deterministic `signingDate`/window + `if (audio.src !== nextUrl)` guard at all eight assignment sites. |
| 2 | **A CDN serves a dead link** | `state` uses `s-maxage=10, stale-while-revalidate=15` (line 359) and a 5 s in-memory cache; `live` uses `s-maxage=3`; `recordings` and `playlists/[id]` use `s-maxage=30, stale-while-revalidate=60`. | D2: no signed URL in those payloads at all; set `Cache-Control: private, no-store` on the audio route. D1: TTL ≥ 1 h, far above every `s-maxage`. |
| 3 | **Long sets outlive the link** | DJ sets can exceed an hour. | TTL `= max(3600, duration_sec + 600)`, capped at 86,400 s (R2 presigned limit). Under D2 the browser re-enters the route on seek/reconnect and gets a fresh signature automatically. |
| 4 | **Track detection breaks** | `RadioContext.tsx` compares `s.audio_url === audio.src` at lines ~823, ~1301, ~1725, ~1875, ~2599, and `CatchUpVault.tsx:152` compares `currentSet?.audio_url === rec.audio_url`. Once `audio.src` is an app URL or signed URL, these never match. | Compare on stable `id` only. Remove the URL fallbacks. Add a static test asserting none remain. |
| 5 | **Ingest probing and cover art break** | `lib/radio/audio-prober.ts` runs `ffprobe`/`ffmpeg` on the raw URL (called from `register-upload` and `radio-ingest`); cover art is in the shared bucket. | Pass a short-TTL signed URL to the prober, or use `HeadObjectCommand`/a small Range read. Keep images in the public bucket. Update `archiver.py` and `radio-bridge-server.py` to store keys, not public URLs. |

Additional consumer checklist before flipping the switch: `scripts/radio-bridge-server.py`, `home-server/daemon/services/archiver.py`, `lib/radio/r2-signer.ts::uploadDropBufferToR2()`, `lib/radio/soundboard-helpers.ts:46`, `app/api/og/radio/route.tsx`, `lib/event-flyer.ts`, and any admin preview component that sets `audio.src` from `audio_url`. Grep for `R2_PUBLIC_DOMAIN`, `r2_public_domain`, `public_url` and `audio_url` across `app/`, `lib/`, `components/`, `scripts/` and `home-server/`.

---

## 5. Environment variables

| Name | Purpose | Required |
|---|---|---|
| `RADIO_R2_BUCKET` | Name of the new private bucket (radio audio only) | **Yes** — fail closed if missing |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Existing R2 account/credentials, reused | Yes (already present) |
| `R2_PUBLIC_DOMAIN`, `R2_BUCKET_NAME` | Existing public bucket for images — **unchanged** | Yes (already present) |
| `RADIO_PLAYBACK_TTL_SEC` | Signed-link lifetime, default `3600` | No |
| `RADIO_USE_SIGNED_PLAYBACK` | Rollout flag, default `false` during dual-run | No |
| `RADIO_PLAYBACK_WINDOW_SEC` | D1 only, default `300` | No |

Add the new names (blank values only) to `.env.example`, and list them by **name only** in the handoff report. Note the `.env.example` drift in §1.5 — do not rename existing variables as part of this wave. **Wrangler does not set Vercel environment variables** (§1.8): add `RADIO_R2_BUCKET` and `RADIO_USE_SIGNED_PLAYBACK` in the Vercel dashboard as a separate step. The signing keys (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) already exist and are unrelated to the Wrangler login.

---

## 6. Implementation steps, in order

Each step has a "done when" so a coder can self-check.

### S1 — Inventory check (0.5 day, no code)
Re-run the greps in §2 to confirm line numbers, and list every place a raw audio address reaches a browser. **Done when:** you have a written list and it matches §2 (or you have noted the drift).

### S2 — Create the private bucket and copy objects (0.5 day, via Wrangler + one-off copy)

All bucket work is terminal work — **Wrangler 4.86.0 is installed globally and already logged in** (§1.8). No Cloudflare dashboard needed.

1. `wrangler whoami` and `wrangler r2 bucket list` — confirm the session and find the name of the existing public bucket.
2. `wrangler r2 bucket create <NEW_PRIVATE_BUCKET>` — create the radio-only bucket.
3. `wrangler r2 bucket dev-url get <NEW_PRIVATE_BUCKET>` then `wrangler r2 bucket dev-url disable <NEW_PRIVATE_BUCKET>` — **verify and enforce private**. Never run `dev-url enable` on it.
4. Enumerate the source keys with a one-off `ListObjectsV2Command` script (pattern already in `lib/r2-storage.ts`), restricted to `radio/*.mp3`, `radio/recordings/*`, `radio/drops/*`. **Dry-run first**: print the key list and counts, no writes.
5. Copy with `CopyObjectCommand` into the new bucket (server-side, zero public egress). Do not download the files to your machine. Do not commit this script (`scripts/` is gitignored and historically holds production credentials).
6. Do **not** delete anything from the old bucket yet — those objects are the rollback copy.
7. Confirm `wrangler r2 bucket info <NEW_PRIVATE_BUCKET>` shows the new bucket and that no public `r2.dev` URL is enabled.
8. Add `RADIO_R2_BUCKET` to Vercel env and `.env.example` (names only).

**Done when:** a sample key in the new bucket is fetchable only with a signed URL, an unsigned request is denied, the ticketing images still load from the old public domain, and the dry-run key count matches the copied count.

### S3 — Signer helper (0.5 day)
In `lib/radio/r2-signer.ts`, add a **separate** `getRadioR2()` that does **not** require `R2_PUBLIC_DOMAIN` (the existing `getR2()` does, and would fail closed for the wrong reason). Add:

```ts
import { GetObjectCommand } from "@aws-sdk/client-s3";

function getRadioR2() {
  const accountId = cleanEnv(readEnvLocal("R2_ACCOUNT_ID"));
  const accessKeyId = cleanEnv(readEnvLocal("R2_ACCESS_KEY_ID"));
  const secretAccessKey = cleanEnv(readEnvLocal("R2_SECRET_ACCESS_KEY"));
  const bucket = cleanEnv(readEnvLocal("RADIO_R2_BUCKET"));
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { s3, bucket };
}

export async function signRadioPlaybackUrl(
  key: string,
  ttlSeconds: number
): Promise<string | null> {
  const r2 = getRadioR2();
  if (!r2) return null;                       // fail closed, never a public URL
  const cmd = new GetObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    ResponseContentDisposition: "inline",
  });
  return getSignedUrl(r2.s3, cmd, { expiresIn: ttlSeconds });
}
```

**Done when:** a unit call with a known key returns a URL containing an expiry and signature; with the bucket variable unset it returns `null`.

### S4 — Key resolver + policy helper (0.5 day)
New `lib/radio/playback.ts`:

```ts
export type PlayableRow = {
  id: number | string;
  r2_key?: string | null;
  audio_url?: string | null;
  duration_sec?: number | null;
};

export function resolveR2Key(row: PlayableRow): string | null {
  if (row.r2_key) return row.r2_key;
  if (!row.audio_url) return null;
  // Pass through anything that is not one of our R2 objects.
  if (row.audio_url.startsWith("/") || row.audio_url.startsWith("blob:")) return null;
  if (row.audio_url.startsWith("http") && !extractR2Key(row.audio_url)) return null;
  return extractR2Key(row.audio_url);
}

export function playbackTtlSec(row: PlayableRow): number {
  return Math.min(86400, Math.max(3600, (row.duration_sec || 0) + 600));
}

export function stablePlaybackPath(row: PlayableRow, kind: "track" | "recording" | "drop"): string | null {
  return resolveR2Key(row) ? `/api/radio/audio/${kind}/${encodeURIComponent(String(row.id))}` : null;
}
```

`resolveR2Key` must return `null` for live stream URLs, upstream relay URLs, local `/public/...` files and `blob:` URLs so those pass through unchanged (invariant 4). **Done when:** tests in §10 cover each passthrough case.

### S5 — The audio route (1 day) — **D2 primary**

New `app/api/radio/audio/[kind]/[id]/route.ts`:

- `export const dynamic = "force-dynamic";`
- Accept `kind` ∈ `track | recording | drop` and a numeric `id` only. **Never accept a `key=` or `url=` query parameter** — that would make it an open signing proxy.
- Look the row up with `neonQuery()`:
  - `track` → `radio_sets`: require `deleted_at IS NULL`, `is_active`, `processing_status = 'ready'`; select `r2_key, audio_url, duration_sec`.
  - `recording` → `radio_recordings`: require `is_public = true`; select `r2_key, audio_url, duration`.
  - `drop` → `radio_drops`: require a non-empty `audio_url`; select `r2_key` if present (falls back to parsing `audio_url`).
  - When Wave A lands, add `rights_status = 'cleared'` to the `track` query — do not add it now (the column does not exist yet).
- If no row or no key → `404`. If `signRadioPlaybackUrl()` returns `null` → `503` with a generic message (no internal detail, no secret).
- `return NextResponse.redirect(signedUrl, 307)` with `Cache-Control: private, no-store, max-age=0`.
- Rate-limit per IP (a simple in-memory token bucket is acceptable; do not add a dependency).
- **Add `app/api/radio/audio/[kind]/[id]/route.ts:GET` to `NON_ADMIN_PUBLIC_ALLOWLIST` in `tests/admin-routes-guarded.check.ts`** with a rationale such as *"Public radio playback redirect; signs only validated track/recording/drop ids, never arbitrary keys"*.
- Add a `HEAD` handler returning the same redirect only if the `<audio>` element needs it; verify in the browser first.

**Done when:** `curl -i /api/radio/audio/track/1` returns `307` with a signed `Location`, `Cache-Control: no-store`, and a `404` for a non-existent id and for `?key=anything`.

### S6 — API payloads (1 day)
Add a small mapper (in `lib/radio/playback.ts`) `withPlayback(row, kind)` that returns `{ ...row, playback_url }` **after deleting** `audio_url`, `audio_high_url`, `r2_key`, `r2_high_key`. Apply it to:

| File | What to map |
|---|---|
| `app/api/radio/state/route.ts` | `sets[]`, `live.fallback_set`, `drops[]`, `upcoming_drop` (lines ~156–168, ~295–329, ~341–355) |
| `app/api/radio/live/route.ts` | `now_playing`, `up_next[]`, `live_drop` in the fallback payload (lines ~279–305). In true live mode, **pass upstream objects through unchanged** (lines ~428–431). |
| `app/api/radio/recordings/route.ts` | Each recording; drop `r2_key` from SELECT and JSON. Keep `WHERE r.is_public = true`. |
| `app/api/radio/playlists/[id]/route.ts` | `tracks[]`; change the SELECT to include `s.r2_key` so the mapper can build a stable path. |
| `app/api/radio/drops/*`, admin preview routes | Where a browser receives a file address. Admin/presenter previews use `requireAdmin` / `requirePresenter`. |

During dual-run, keep `audio_url` **temporarily** and gate with `RADIO_USE_SIGNED_PLAYBACK`; remove it entirely at S9. **Done when:** no public payload contains a raw bucket URL when the flag is on, and every payload still has `playback_url`.

### S7 — Player changes (1 day)
In `context/RadioContext.tsx`:
- Add `playback_url` to the internal track shape; resolve source as `track.playback_url || track.audio_url` during dual-run.
- Replace the five `s.audio_url === audio.src` comparisons (lines ~823, ~1301, ~1725, ~1875, ~2599) with id comparison, e.g. `String(s.id) === cleanId`.
- Wrap all eight `audio.src = ...` assignments with a changed-string guard (`if (audio.src !== nextUrl) audio.src = nextUrl;`). Under D2 this is belt-and-braces but still required.
- On `<audio>` `error` / `stalled`, re-resolve the source from the track id before falling back to `startBackupMix()` — a transient signing failure must not trigger the "stream is down" path.
- Keep `notifyOtherTabsPlay()`, Media Session, crossfade and `safeSeekAudio()` behaviour as-is.

In `components/radio/FestivalSetVault.tsx`: delete the `download` anchor (lines ~227–236) and the "320kbps Master" copy; use `playSet()`.
In `components/radio/CatchUpVault.tsx`: use `playback_url` and change line 152's equality to `currentSet?.id === rec.id`.
In `app/radio/shows/[slug]/page.tsx`: replace the native `<audio controls src={rec.audio_url}>` (line ~317) with `playSet()` or a `controlsList="nodownload"` player fed by `playback_url`. **Leave the `.ics` download at line ~209 alone.**

**Done when:** all eight src assignments are guarded, no URL-equality comparison remains, and there is no `download` attribute on any public audio element.

### S8 — Non-browser consumers (0.5 day)
- `lib/radio/audio-prober.ts`: accept a signed URL from the caller. In `app/api/admin/radio/register-upload/route.ts` (~line 41) and `app/api/webhooks/radio-ingest/route.ts` (~line 66), generate a short-TTL signed URL for the probe, or switch to `HeadObjectCommand`. Note: at ingest time the file has just been uploaded to the **private** bucket, so use its key.
- `home-server/daemon/services/archiver.py`: store `r2_key` only, stop building `public_url` (~line 193), keep `is_public = False`.
- `scripts/radio-bridge-server.py`: upload radio audio to the private bucket; send `r2_key` in the webhook payload. Covers can stay in the public bucket.
- `lib/radio/r2-signer.ts::uploadDropBufferToR2()` and the multipart helpers: radio audio variants should write to the private bucket and still return the key; image/other callers keep using the public helpers.
- `lib/radio/cron-engine.ts` and `components/admin/radio/PerformanceSoundboard.tsx` (both changed in commit `b39cae3`): when a `soundboard_pads.audio_url` points into the radio bucket, resolve it through the same playback helper so fallback drops still air and admin pad previews still play. Do not rewrite the soundboard feature.
- `next.config.ts`: keep `**.r2.dev` in `images.remotePatterns` for cover art.

**Done when:** a fresh upload/ingest round-trip produces a playable track with no public URL stored, a live set archive row has a key but no public URL, a fallback drop still plays, and an admin pad preview still plays.

### S9 — Cutover (0.5 day + monitoring)
Follow §10 rollout. Remove `audio_url` from public payloads, flip the flag, then switch off public access to the radio audio objects in the old bucket **last**. Keep a 7-day rollback copy.

---

## 7. File-by-file change matrix (quick reference)

| File | Add / change | Remove |
|---|---|---|
| `lib/radio/r2-signer.ts` | `getRadioR2()`, `signRadioPlaybackUrl()`, `GetObjectCommand` import | — |
| `lib/radio/playback.ts` | NEW: `resolveR2Key`, `playbackTtlSec`, `stablePlaybackPath`, `withPlayback` | — |
| `app/api/radio/audio/[kind]/[id]/route.ts` | NEW public guarded redirect route | — |
| `tests/admin-routes-guarded.check.ts` | Add the new route to `NON_ADMIN_PUBLIC_ALLOWLIST` with rationale | — |
| `.env.example` | New var names, blank values | — |
| `app/api/radio/state/route.ts` | map `sets`, `fallback_set`, `drops`, `upcoming_drop` | raw `audio_url`/`audio_high_url` in payload |
| `app/api/radio/live/route.ts` | map fallback `now_playing`, `up_next`, `live_drop`; pass through live upstream data | raw URLs in fallback payload |
| `app/api/radio/recordings/route.ts` | map recordings | `r2_key` from SELECT + JSON |
| `app/api/radio/playlists/[id]/route.ts` | SELECT `s.r2_key`, map `tracks[]` | `audio_url`, `audio_high_url` from payload |
| `context/RadioContext.tsx` | `playback_url`, id comparisons, src guards, error re-resolve | URL-equality comparisons |
| `components/radio/FestivalSetVault.tsx` | `playSet()` button | the `download` anchor + "Master" copy |
| `components/radio/CatchUpVault.tsx` | `playback_url`, id comparison | `audio_url` equality at line ~152 |
| `app/radio/shows/[slug]/page.tsx` | `playback_url` / `playSet()` | native `<audio src={rec.audio_url}>` (keep `.ics` download) |
| `lib/radio/audio-prober.ts` + 2 ingest routes | signed URL or `HeadObject` | raw public URL probing |
| `home-server/daemon/services/archiver.py` | store key | `public_url` construction |
| `scripts/radio-bridge-server.py` | private bucket + key in webhook | public URL construction for audio |
| `lib/radio/cron-engine.ts`, `components/admin/radio/PerformanceSoundboard.tsx` | resolve `soundboard_pads.audio_url` through the playback helper (minimal diff — these were just changed in `b39cae3`) | — |
| `tests/radio-playback.check.ts` | new static assertions (§10) | — |
| `tests/radio-signed-playback.check.ts` | NEW behaviour suite | — |

---

## 8. Tests and verification

### 8.1 Automated
- Extend `tests/radio-playback.check.ts` with static source checks:
  - no public response maps `r2_key`, `r2_high_key` or `audio_high_url`;
  - `GetObjectCommand` is imported in `lib/radio/r2-signer.ts`;
  - the audio route sets `no-store` and contains no `searchParams.get("key")`;
  - `FestivalSetVault.tsx` has no `download` attribute;
  - no `=== audio.src` or `currentSet?.audio_url ===` comparison remains in `context/RadioContext.tsx` / `CatchUpVault.tsx`;
  - the new route appears in `NON_ADMIN_PUBLIC_ALLOWLIST`.
- New `tests/radio-signed-playback.check.ts` for behaviour:
  - `resolveR2Key` returns a bare key for a stored key, `null` for `/public/...`, `blob:`, an Icecast URL and an upstream relay URL;
  - `playbackTtlSec` ≥ `duration_sec + 600` and ≤ 86,400;
  - missing `RADIO_R2_BUCKET` → `signRadioPlaybackUrl` returns `null`, never a public URL;
  - `withPlayback` strips all four raw fields and adds `playback_url`;
  - (D1 only) two sign calls in one window produce byte-identical URLs.
- Run **all** `tests/*.check.ts` suites using the local `tsx.cmd` per `AGENTS.md`; a PowerShell loop is in `AGENTS.md`.
- `npx tsc --noEmit`, then `npm run build` (the typechecker). If the build fails with the `.length` TypeError and no stack, run `npm run clean` and rebuild — that is the known stale `.next/` crash, not your code.
- `npm run lint` — compare to the 37-problem baseline.

### 8.2 Manual (mandatory, do not skip)
1. Play a 90-minute set past a window boundary — **no restart, no stutter**.
2. Seek to the middle of a track (verifies R2 honours `Range` on the signed/redirected GET).
3. Android Chrome with the screen locked for 10 minutes; iOS Safari; desktop Chrome.
4. `/radio/embed` inside an iframe on a different origin.
5. Festival Vault, catch-up vault, a curated playlist, the backup-mix failover, and an AI drop.
6. Live DJ / HLS mode still plays (unaffected path).
7. A recording with `is_public = false` cannot be fetched by guessing its old address.
8. Ticketing flyers, posters, gallery and OG/social preview images still load.
9. Admin upload → probe → register → play round trip.
10. `curl -i` the audio route: `307`, `no-store`, `404` on bad id, `503` when credentials are absent.

---

## 9. Rollout (no dead air) and rollback

| Step | Action | Rollback |
|---|---|---|
| 1 | Wrangler: `r2 bucket create`, `dev-url disable`, verify; copy `radio/*` objects server-side with `CopyObjectCommand` (dry-run first). Leave old bucket public. | Delete new bucket |
| 2 | Deploy S3–S6 with `RADIO_USE_SIGNED_PLAYBACK=false`; responses carry **both** `audio_url` (legacy) and `playback_url`. Nothing changes for listeners. | Flag off |
| 3 | Deploy S7–S8; flip flag **on** for internal testing only. Run all §8.2 checks, especially iOS + seek. | Flag off |
| 4 | If D2 fails on iOS/seek, switch to D1 (§3.3) and re-run checks | — |
| 5 | Remove `audio_url` / `audio_high_url` / `r2_key` from public payloads; confirm §8.1 tests pass | Re-add temporarily |
| 6 | **Last:** using the enumerated key list, delete **only the `radio/` audio objects** from the old bucket (`wrangler r2 object delete <BUCKET>/<KEY>` per key, or the SDK equivalent). Do **not** run `dev-url disable` on the old bucket — images must stay public. Purge CDN caches. Keep the new-bucket copy for 7 days as the rollback. | Re-copy the objects from the new bucket |

Never do step 6 first. That is the difference between a migration and an outage.

---

## 10. Risks and honest limits

| Risk | Mitigation |
|---|---|
| Signed link shared while valid | `inline` disposition, no download button, sensible TTL. This limits exposure; it does not prevent sharing. **Not DRM** — a listener can still record the stream. |
| Looks like compliance but is not | Signed URLs do not create a music licence. The rights gate (Wave A) and written permission do that. Never present this to CA/KECOBO as copyright clearance. |
| Open signing proxy | Id-only lookup, row validation, rate limit, no `key=`/`url=` parameter, `no-store`. |
| Dead link from a cache | D2 avoids signed URLs in cached payloads entirely; audio route is `no-store`. |
| Redirected media + Range on iOS | Validate in step 3; D1 fallback ready. |
| Cover art / flyers / OG images break | Only radio audio moves; images stay in the public bucket. |
| Someone else's uncommitted edits | Re-read the four files in §1.7 before touching them; keep diffs minimal. |
| Cost | No new service, no new secret, no audio bandwidth on the app host. Reject the server-proxy design. |

Effort: **4–6 days** plus manual checks. No migration, no paid service, no legal prerequisite — this can start before any regulator replies.

---

## 11. Definition of done (machine-checkable)

- [ ] `RADIO_USE_SIGNED_PLAYBACK=true` and a listener hears uninterrupted audio across a signing-window boundary.
- [ ] Seeking, lock-screen controls, embed, vault, curated playlists, backup-mix and AI drops all work.
- [ ] Live HLS/Icecast mode unaffected.
- [ ] No public API response contains `r2_key`, `r2_high_key`, `audio_high_url` or a raw bucket URL.
- [ ] No `download` link on any public radio page (the `.ics` calendar download is exempt).
- [ ] `is_public = false` recordings unreachable by guessing the old address.
- [ ] Ticketing flyers, posters, gallery and OG images load.
- [ ] New route present in `NON_ADMIN_PUBLIC_ALLOWLIST` with rationale.
- [ ] Missing credentials fail closed; no public URL fallback.
- [ ] All `tests/*.check.ts` suites pass; `npx tsc --noEmit` and `npm run build` green; lint unchanged vs the 37-problem baseline.
- [ ] New bucket created via Wrangler, `dev-url get` reports public access **disabled**; `bucket info` matches.
- [ ] Copy dry-run key count matches copied count; no radio object left behind.
- [ ] Old bucket's `radio/` audio objects deleted **last**; old bucket itself still public and ticketing images load.
- [ ] `RADIO_R2_BUCKET` set in Vercel env (Wrangler does not do this).
- [ ] Public access to radio audio off, 7-day rollback copy retained.
- [ ] `.env.example` updated with new variable **names only**.

---

## 12. Anti-patterns — do not do these

1. Making the existing shared bucket private (breaks ticketing).
2. Returning a signed URL from a response with `s-maxage` longer than the link's remaining life.
3. Reassigning `audio.src` on every metadata poll.
4. Assuming an in-memory cache gives cross-instance URL stability — it does not on serverless.
5. Accepting an arbitrary `key=` parameter on the playback route.
6. Signing live stream URLs, upstream relay URLs, `blob:` URLs or `/public/...` local files.
7. Forgetting drops (`radio/drops/*`) — AI presenter audio will go silent.
8. Forgetting `audio-prober.ts` — ingest will 403 and new uploads will register with wrong durations.
9. Replacing the `.ics` download on show pages while removing the audio download.
10. Adding a `.sql` file to `migrations/radio/` for this wave — `scripts/migrate.js` would apply it to whatever `DATABASE_URL` is set.
11. Running any migration or script against production.
12. Printing or committing secret values.
13. Streaming audio bytes through the Next.js host to "simplify" things.
14. Claiming signed URLs make the music licensed.
15. Using `npx --no-install wrangler` (it is a **global** binary, not a local dependency) or creating a `wrangler.toml` that this wave does not need.
16. Assuming Wrangler's login gives the app its signing keys — `getSignedUrl()` needs `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, which are separate and already in the environment.
17. Running `dev-url disable` (or `bucket delete`) on the **existing** bucket — that would break ticketing images. Delete only enumerated `radio/` audio keys.
18. A wildcard / broad object delete, or committing the one-off copy script into `scripts/`.

---

## 13. Handoff report template

When finished, report:
1. Branch name and commits (small, logical).
2. Files added / changed, with paths.
3. Which design was used (D2 or D1) and why, including the iOS/seek validation result.
4. New env vars by **name only**.
5. New routes and their auth rule (public + self-guard + allowlist rationale).
6. The R2 bucket changes made with Wrangler (commands run, `dev-url` status, key counts — no bucket names, account ids or token values).
7. Test output: which suites ran, pass counts, `tsc`, `build`, lint delta vs baseline.
8. Manual checks run and results, especially the 90-minute continuity and iOS seek.
9. What was not done and why.
10. Rollback steps and the date the old public audio objects can be deleted.
11. Open questions for the owner.

---

*Engineering specification, not legal advice. Every fact in §2 was re-read from the working tree on 13 November 2026; line numbers are indicative. No code, bucket configuration or database was changed while writing this file.*
