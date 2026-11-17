# Config, Bucket & Environment Mismatch Audit

**Date:** 2026-11-16
**Scope:** `goodlife-event-tickets` working tree — R2 bucket routing, radio playback, env files, service-to-service env names, public domains.
**Method:** static analysis of `app/`, `lib/`, `components/`, `home-server/`, `scripts/`, plus **read-only** R2 `HeadBucket` / `ListObjectsV2` / anonymous `HEAD` checks using the credentials in `.env.local`. No writes, no deletes, no mutations.
**Companion docs:** `docs/CODEBASE-AUDIT-AND-REFACTOR-PLAN.md`, `docs/SIGNED-PLAYBACK-PLAN.md`, `AGENTS.md`.

> **Caveat:** the live checks read the buckets configured in `.env.local`. Production Vercel environment values were not inspected. Counts are a snapshot and will drift.

---

## 1. Executive summary

The R2 storage layer has **two bucket resolvers that disagree**, and the disagreement is live in the data:

| Severity | Finding |
|---|---|
| **P0** | All 7 `radio/sets/` objects exist in **both** the public `goodlife` bucket and the "private" `goodlife-radio-private` bucket. An anonymous `HEAD` to the public domain for a set returns **200 `audio/mpeg`**. The signed-playback layer guards a copy that is also publicly downloadable. |
| **P0** | `deleteRadioAudioKeys()` deletes only from `goodlife`. Every set key that also exists in the private bucket survives deletion. |
| **P1** | Upload, playback signing, and deletion use three different bucket-resolution paths (`getR2()`, `getRadioR2()`, and `extractR2Key()`). They do not agree on which bucket is authoritative. |
| **P1** | `.env.example` documents `R2_RADIO_BUCKET` and `R2_RADIO_PUBLIC_URL`, neither of which is read anywhere. The code reads `RADIO_R2_BUCKET` and `RADIO_R2_PUBLIC_DOMAIN`; the latter is undocumented. |
| **P1** | Radio set uploads discard the returned `key` and store a public URL; playback then re-derives the key from that URL using a helper that does not know about `RADIO_R2_PUBLIC_DOMAIN`. |
| **P2** | The R2 public domain is split across at least five defaults (`pub-*.r2.dev`, `assets.goodlife.co.ke`, `goodlife.smwhr.space`, `r2.goodlife.space`, `r2.goodlife.smwhr.space`). |
| **P2** | Site identity is split across `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `SITE_BASE_URL`, and hardcoded `goodlife.smwhr.space`. |
| **P2** | Paystack has a one-sided flag: the server accepts `ENABLE_PAYSTACK` or `NEXT_PUBLIC_ENABLE_PAYSTACK`, the client reads only the latter. |
| **P2** | Active WhatsApp modules fall back to a hardcoded API key (`goodlife_waha_secret_2026`) and a hardcoded `darajadigital.com` URL when env is missing. `PHONE_HASH_SALT` has a hardcoded fallback too. |
| **P2** | Node and the Python daemon use different names for the same model/voice credentials (`NVIDIA_API_KEY` vs `NVIDIA_NIM_API_KEY`; `FISH_AUDIO_KEY` vs `FISH_AUDIO_API_KEY`; `FISH_VOICE_ID` vs `FISH_AUDIO_VOICE_ID`). |
| **P3** | `tests/radio-signed-playback.check.ts` cannot detect a wrong bucket: its assertion passes if the signed URL contains `"goodlife"`, which is a substring of `"goodlife-radio-private"`. |

---

## 2. Live evidence (read-only)

Buckets from `.env.local`: `R2_BUCKET_NAME=goodlife`, `RADIO_R2_BUCKET=goodlife-radio-private`.

| Prefix | `goodlife` (public) | `goodlife-radio-private` | Same key in both |
|---|---:|---:|---:|
| `radio/sets/` | 7 | 7 | **7** |
| `radio/drops/` | 233 | 219 | 218 |

- `radio/sets/`: 0 public-only, 0 private-only — every set is in both buckets.
- `radio/drops/`: 15 public-only, 1 private-only, 218 in both.
- Newest set: public `2026-11-06T08:28:08Z`, private `2026-11-14T11:09:05Z`.
- Newest drop: public `2026-11-15T17:24:01Z`, private `2026-11-14T12:36:58Z`.

**Anonymous access check** (`HEAD`, no auth, `R2_PUBLIC_DOMAIN`):

| Object | Result |
|---|---|
| `radio/sets/<first key>` | **200 OK** — `audio/mpeg`, 63,142,870 bytes |
| `radio/drops/<first key>` | 200 OK — `audio/mpeg`, 188,124 bytes |

The set object is readable without a signed URL. That is the concrete failure: the "private" playback path is not private while the same key remains in the public bucket.

> The public bucket also stores posters, videos, gallery images, and drops, so it must stay public. R2 public access is **per bucket**, not per prefix — a `radio/sets/` prefix cannot be made private inside `goodlife` while the bucket itself is public. The only way to protect sets is to keep them out of `goodlife`.

---

## 3. Findings

### F1 — P0: the "private" radio bucket is not private

**Code path**

- `createRadioPresignedUpload()` (`lib/radio/r2-signer.ts:120-149`) calls `getR2()`.
- `getR2()` (`:38-56`) resolves the bucket as `R2_BUCKET_NAME || "goodlife"` (`:42`). It never reads `RADIO_R2_BUCKET`.
- `.env.example:58` sets `R2_BUCKET_NAME="goodlife"`; `:64` sets `RADIO_R2_BUCKET="goodlife-radio-private"`.
- The admin radio uploader uses that presign path (`app/admin/radio/page.tsx:450-466`) and registers the result (`:495-507`).

**Read path**

- `signRadioPlaybackUrl()` (`lib/radio/r2-signer.ts:84-118`) calls `getRadioR2()`.
- `getRadioR2()` (`:58-82`) resolves `RADIO_R2_BUCKET || R2_BUCKET_NAME || "goodlife"` (`:66-68`), then HeadObject-checks the private copy and falls back to the primary bucket on 404/403 (`:96-110`).

**Impact**

- New set uploads through the admin multipart path land in the public bucket, not the private one.
- Existing sets are duplicated. The private copy shadows the public copy in `signRadioPlaybackUrl()`, but the public copy remains anonymously readable.
- The newest private set (Nov 14) is newer than the newest public set (Nov 6), so the private bucket has also received writes from something outside this repo's presign path (manual upload, older code, or an external worker). Neither bucket is authoritative.

### F2 — P0: deletion leaves the private copy behind

`deleteRadioAudioKeys()` (`lib/radio/r2-signer.ts:217-232`) calls `getR2()` (`:218`) and deletes with `Bucket: r2.bucket` (`:227`) — always the public bucket.

Callers:

- `app/api/admin/radio/library/route.ts:184-190` soft-deletes the row (`deleted_at`, `is_active=false`) and then calls `deleteRadioAudioKeys([r2_key, r2_high_key])`.
- `lib/radio/drop-engine.ts:213` deletes generated drop URLs.

Because all 7 set keys exist in both buckets, deleting a set removes the public object but leaves the private one. `signRadioPlaybackUrl()` prefers the private bucket, so a leaked/known key can still be signed after the library entry is gone. Storage is also never reclaimed.

### F3 — P1: one presign endpoint serves private sets and public soundboard pads

`app/api/admin/radio/multipart/route.ts:19-52` exposes one `presigned` action. Two very different clients use it:

| Client | Intended visibility | Evidence |
|---|---|---|
| Radio library / sets | Private (signed playback) | `app/admin/radio/page.tsx:450-466` |
| Performance soundboard / mic drops | Public (played directly by the browser) | `components/admin/radio/PerformanceSoundboard.tsx:486-502`, `:552-568` |

The soundboard pads store `publicUrl` directly (`:529`, `:580`) and expect it to be playable. A blanket switch of `createRadioPresignedUpload()` to `RADIO_R2_BUCKET` would send soundboard clips to the private bucket and break them.

### F4 — P1: upload, sign, and delete resolve buckets differently

| Function | Resolver | Bucket |
|---|---|---|
| `createRadioPresignedUpload` (`:120`) | `getR2()` | `R2_BUCKET_NAME \|\| "goodlife"` |
| `initMultipartUpload` (`:153`) | `getR2()` | same |
| `signMultipartPart` (`:167`) | `getR2()` | same |
| `completeMultipart` (`:182`) | `getR2()` | same |
| `abortMultipart` (`:203`) | `getR2()` | same |
| `deleteRadioAudioKeys` (`:217`) | `getR2()` | same |
| `uploadDropBufferToR2` (`:234`) | `getR2() \|\| getRadioR2()` | public first, private only as fallback |
| `signRadioPlaybackUrl` (`:84`) | `getRadioR2()` | `RADIO_R2_BUCKET` first, primary fallback |

`uploadDropBufferToR2()` has an additional edge case: if `getR2()` returns null (e.g. `R2_PUBLIC_DOMAIN` missing), it writes via `getRadioR2()` to the private bucket, then builds the returned URL from `R2_PUBLIC_DOMAIN` (`:272-276`). That URL points at the wrong bucket and will 403/404.

### F5 — P1: the upload key is discarded, then re-derived from the URL

- `app/admin/radio/page.tsx:466` destructures `{ uploadUrl, publicUrl, key }`.
- The `register-upload` body (`:498-507`) sends `audioUrl: publicUrl` but **does not send `key` / `r2_key`**.
- `app/api/admin/radio/register-upload/route.ts:17` accepts `r2_key`, but it arrives empty.
- The row is inserted with `r2_key = null` (`:63-98`).
- `resolveR2Key()` (`lib/radio/playback.ts:18-29`) then calls `extractR2Key(audio_url)`.
- `extractR2Key()` (`lib/r2-storage.ts:41-61`) recognizes only `R2_PUBLIC_DOMAIN`, `*.r2.cloudflarestorage.com`, and `*.r2.dev` (`:49-52`). It does **not** recognize `RADIO_R2_PUBLIC_DOMAIN`.

Consequences:

- If a custom radio public domain is introduced, playback cannot resolve the key.
- If the object is moved between buckets, the stored URL and the actual key location can diverge.
- `register-upload` trusts a client-supplied `audio_url` without validating that it belongs to the configured bucket.

### F6 — P1: env names documented vs read

| Variable | Documented | Read | Status |
|---|---|---|---|
| `R2_RADIO_BUCKET` | `.env.example:60` | nowhere | **dead** |
| `R2_RADIO_PUBLIC_URL` | `.env.example:61` | nowhere | **dead** |
| `RADIO_R2_BUCKET` | `.env.example:64` | `r2-signer.ts:63,66` | live |
| `RADIO_R2_PUBLIC_DOMAIN` | nowhere | `audio route:151`, `drops/live-inject:57` | **undocumented** |
| `RADIO_PLAYBACK_TTL_SEC` | `.env.example:66` | nowhere | **dead** — `playbackTtlSec()` hardcodes 3600/600/86400 (`lib/radio/playback.ts:35-46`) |
| `RADIO_PLAYBACK_WINDOW_SEC` | `.env.example:67` | nowhere in this repo | **dead** (docs say D1/worker only) |
| `RADIO_STREAM_HIFI_URL` | `.env.example:82` | nowhere | **dead** — hi-fi is derived by string replacement (`lib/radio/bitrate.ts:62-75`) |
| `NEXT_PUBLIC_RADIO_STREAM_HIFI_URL` | `.env.example:84` | nowhere | **dead** |
| `NEXT_PUBLIC_R2_DOMAIN` | nowhere | `lib/event-flyer.ts:2` | **undocumented** |
| `NEXT_PUBLIC_SITE_URL` | nowhere | `lib/radio/drop-context.ts:471` | **undocumented** |
| `SITE_BASE_URL` | nowhere | `lib/radio/events.ts:512` | **undocumented** |
| `PHONE_HASH_SALT` | nowhere | `lib/radio/shoutout-filter.ts:22` | **undocumented + hardcoded fallback** |
| `PAYHERO_ACCOUNT_ID` | nowhere (only in `.env.local`) | `lib/payhero.ts:136` | **undocumented + default `"12263"`** |
| `PAYHERO_INTERNAL_TOKEN` | nowhere | `lib/self-pay-token.ts:28` | **undocumented** |
| `RADIO_BRIDGE_LAN_URL` | nowhere | `lib/radio/bridge-client.ts:227,305` | **undocumented** |
| `RADIO_STREAM_HOST` | nowhere | `admin/radio/stream-key:34`, `admin/radio/presenters:80`, `presenters/[id]/stream-key:74` | **undocumented** |
| `STREAM_HOST` / `ICECAST_HOST` | nowhere | `api/presenter/connection-status:70` | **undocumented** |
| `BACKUP_DATABASE_URL` | `.env.local` + `AGENTS.md` | nowhere | **unused** |

`.env.local` also contains duplicate `RADIO_R2_BUCKET` and `RADIO_USE_SIGNED_PLAYBACK` lines.

### F7 — P2: R2 public-domain split-brain

`lib/event-flyer.ts:1-5` computes:

```ts
const R2_DOMAIN = (
  process.env.NEXT_PUBLIC_R2_DOMAIN ||
  process.env.R2_PUBLIC_DOMAIN ||
  "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev"
).replace(/\/+$/, "");
```

`event-flyer.ts` is imported by client components (`components/StoryDeckHero.tsx`, `components/radio/UpcomingEventCard.tsx`, `components/admin/CreateEventModal.tsx`). Next.js only inlines `NEXT_PUBLIC_*` into client bundles; `R2_PUBLIC_DOMAIN` is server-only. If production sets `R2_PUBLIC_DOMAIN` to a custom domain but not `NEXT_PUBLIC_R2_DOMAIN`, client-rendered posters fall back to `r2.dev` while server-rendered ones use the custom domain.

`components/admin/radio/BrowserMicRecorder.tsx` hardcodes `https://pub-a4616...r2.dev` at lines 306, 348, 509, 532, 563.

Domain defaults across the repo:

| Default | Files |
|---|---|
| `https://pub-a4616...r2.dev` | `lib/event-flyer.ts:4`, `lib/radio/r2-signer.ts:276`, `app/api/radio/audio/[kind]/[id]/route.ts:152`, `app/api/radio/drops/live-inject/route.ts:58`, `BrowserMicRecorder.tsx:306,348,509,532,563`, `scripts/radio_playout_follower.py:53` |
| `https://assets.goodlife.co.ke` | `home-server/daemon/.env.example:44`, `home-server/daemon/services/archiver.py:43` |
| `https://goodlife.smwhr.space` | `lib/seo.ts:22,29,33`, `lib/radio/drop-engine.ts:42`, `lib/radio/drop-context.ts:471`, `scripts/upload_to_r2.py:35` |
| `https://r2.goodlife.space` | `tests/cron-radio-drops.check.ts:178,224` |
| `https://r2.goodlife.smwhr.space` | `tests/radio-ingest-signature.check.ts:26` |

`next.config.ts` whitelists `picsum.photos`, `i.ibb.co`, `**.r2.dev`, `**.cloudflarestorage.com`, `**.hearthis.at` — not `assets.goodlife.co.ke`, `goodlife.smwhr.space`, or `r2.goodlife.space`. Any `next/image` use of those custom domains fails.

### F8 — P2: site identity is split

| Source | Value / precedence | Evidence |
|---|---|---|
| `siteUrl()` | `APP_URL`; rejects localhost/ngrok; falls back to `goodlife.smwhr.space` | `lib/seo.ts:20-35` |
| Drop context | `NEXT_PUBLIC_SITE_URL` | `lib/radio/drop-context.ts:471` |
| Radio events | `SITE_BASE_URL` or `stationConfig.site_base_url` | `lib/radio/events.ts:512` |
| Drop engine | hardcoded `https://goodlife.smwhr.space` | `lib/radio/drop-engine.ts:42` |
| QR / broadcast / presenter routes | `APP_URL \|\| goodlife.smwhr.space` | multiple |

If production uses `goodlife.co.ke`, drop scripts and QR codes can still print `goodlife.smwhr.space`.

### F9 — P2: Paystack flag is one-sided

- Client: `process.env.NEXT_PUBLIC_ENABLE_PAYSTACK === "true"` (`app/CheckoutClientPage.tsx:196`).
- Server: `ENABLE_PAYSTACK || NEXT_PUBLIC_ENABLE_PAYSTACK` (`app/api/paystack/initialize/route.ts:9`, `app/api/paystack/verify/route.ts:9`).
- `.env.example` documents only `NEXT_PUBLIC_ENABLE_PAYSTACK`.

Setting only `ENABLE_PAYSTACK=true` enables the API but hides the Paystack UI. The two flags are not equivalent.

### F10 — P2: WhatsApp env names + hardcoded credentials

`lib/waha.ts:78-87` and `lib/whatsapp.ts:7-16` resolve:

```ts
url    = WAHA_BASE_URL || WHATSAPP_GATEWAY_URL || "https://waha-ember.darajadigital.com"
apiKey = WAHA_API_KEY  || WHATSAPP_API_KEY    || "goodlife_waha_secret_2026"
```

Two active modules share a hardcoded API key fallback. `lib/radio/alerts.ts:34` uses a third name, `WAHA_GATEWAY_URL`, which nothing else reads (and `alerts.ts` is already flagged as orphaned). This contradicts the fail-closed posture used for session secrets and for `lib/supabase-db.ts`.

### F11 — P2: Node vs daemon credential names

| Purpose | Next.js | Python daemon |
|---|---|---|
| NVIDIA NIM | `NVIDIA_API_KEY` (`lib/radio/drop-engine.ts:653`) | `NVIDIA_NIM_API_KEY` (`home-server/daemon/services/ai_copywriter.py:24`) |
| Fish Audio key | `FISH_AUDIO_KEY` or `FISH_AUDIO_API_KEY` (`lib/radio/audio-mastering.ts:139-142`) | `FISH_AUDIO_API_KEY` (`home-server/daemon/services/voice_synthesizer.py:29`) |
| Fish voice | `FISH_VOICE_ID` (`lib/radio/audio-mastering.ts:248`) | `FISH_AUDIO_VOICE_ID` (`home-server/daemon/services/voice_synthesizer.py:30`) |

If production sets only one side's names, that side silently disables (or falls back), and the failure is not visible from the other service.

### F12 — P2: other hardcoded secrets / IDs

- `lib/radio/shoutout-filter.ts:22` — `PHONE_HASH_SALT || "goodlife_interaction_salt_2026"`. The salt is not in `.env.example`.
- `lib/payhero.ts:136` — `PAYHERO_ACCOUNT_ID || "12263"`. A missing env silently uses a hardcoded account.
- `lib/self-pay-token.ts:28` — accepts `PAYHERO_INTERNAL_TOKEN` as a fallback signing secret; undocumented.

### F13 — P2: `BACKUP_DATABASE_URL` is unused

`.env.local` defines it and `AGENTS.md` describes it as the secondary/home-server DB, but a repo-wide search finds no reader. The backup path (`lib/db-backup.ts`) uses only the primary `DATABASE_URL`. Either wire it into a restore/backup test or remove the claim.

### F14 — P2: stream host defaults disagree

| Default | File |
|---|---|
| `live-dj.darajadigital.com` | `app/api/admin/radio/stream-key/route.ts:34` |
| `goodlife.smwhr.space` | `app/api/admin/radio/presenters/route.ts:80`, `app/api/admin/radio/presenters/[id]/stream-key/route.ts:74` |
| `live-dj.goodlife.co.ke` | `app/api/presenter/connection-status/route.ts:70` |

`AGENTS.md` says `radio.darajadigital.com` is a separate project and Goodlife must not route through it; one default still does.

### F15 — P3: the signed-playback test cannot catch a wrong bucket

`tests/radio-signed-playback.check.ts:184`:

```ts
signed.includes(expectedBucket) ||
signed.includes("goodlife-radio-private") ||
signed.includes("goodlife")
```

Because `"goodlife"` is a substring of `"goodlife-radio-private"`, the assertion is effectively always true. It also never tests upload/delete bucket parity.

---

## 4. Remediation plan

### 4.0 Decision required

**Is `radio/sets/` supposed to be private?**

- **Option A (recommended, matches the current config):** sets are private. Keep `RADIO_R2_BUCKET` as the only home for sets; remove the public copies; make signed playback mandatory.
- **Option B:** sets are public. Delete `RADIO_R2_BUCKET`, the private bucket, and the signed-playback complexity; use one bucket.

Do not switch `createRadioPresignedUpload()` to `RADIO_R2_BUCKET` before deciding. A one-line switch breaks `publicUrl` (no `publicDomain` on `getRadioR2()`) and soundboard clips (shared presign action).

### 4.1 P0 — make the private bucket actually private (Option A)

1. **Stop new public writes.** Give the presign/multipart helpers an explicit visibility or bucket parameter:
   - `private` → `getRadioR2()` for sets/tracks.
   - `public` → `getR2()` for soundboard pads, drops, posters, videos.
   Split the `/api/admin/radio/multipart` contract accordingly; do not route both clients through one bucket.
2. **Remove the duplicate public copies.** Delete `radio/sets/*` from `goodlife` (destructive; needs explicit approval). R2 public access is per bucket, so a public prefix cannot be protected in place.
3. **Make signed playback mandatory for sets.** Set `RADIO_USE_SIGNED_PLAYBACK=true`; `withPlayback()` must strip raw `audio_url` and return the stable `/api/radio/audio/...` path. Do not rely on `RADIO_USE_SIGNED_PLAYBACK=false` to disable the audio route — it currently signs unconditionally (`app/api/radio/audio/[kind]/[id]/route.ts:173-174`).
4. **Delete from the authoritative bucket.** `deleteRadioAudioKeys()` should take a bucket/visibility argument, or try both buckets during migration and then only the authoritative one. Add a test that a delete removes the object from both.
5. **Verify with an anonymous request.** After cleanup, `HEAD` to `R2_PUBLIC_DOMAIN/radio/sets/<key>` must return 403/404, not 200.

### 4.2 P1 — make the data flow consistent

1. **Always store `r2_key`.** `app/admin/radio/page.tsx` already receives `key`; send it in the `register-upload` body. Make `register-upload` require it (or validate a derived key) and reject an `audio_url` that does not belong to the configured bucket/domain.
2. **Return the right URL.** For private objects, do not return a public `publicUrl`. Return `{ uploadUrl, key }` plus a stable playback path, or add `publicDomain` to `getRadioR2()` and only return a public URL for public objects.
3. **Teach `extractR2Key()` about `RADIO_R2_PUBLIC_DOMAIN`.** `lib/r2-storage.ts:43-52` only recognizes `R2_PUBLIC_DOMAIN`, `*.r2.dev`, `*.cloudflarestorage.com`.
4. **Fix `uploadDropBufferToR2()`.** It should resolve the bucket and the public domain together; today it can upload via the private resolver and return a public-domain URL (`:272-276`).
5. **Fix the test.** Replace the substring assertion with an exact bucket check, and add upload/sign/delete parity. Also assert that the public domain does not serve `radio/sets/`.

### 4.3 P2 — config cleanup

1. `.env.example`:
   - Remove `R2_RADIO_BUCKET`, `R2_RADIO_PUBLIC_URL`, `RADIO_PLAYBACK_TTL_SEC`, `RADIO_PLAYBACK_WINDOW_SEC`, `RADIO_STREAM_HIFI_URL`, `NEXT_PUBLIC_RADIO_STREAM_HIFI_URL` — or wire them.
   - Add `RADIO_R2_PUBLIC_DOMAIN`, `NEXT_PUBLIC_R2_DOMAIN`, `PHONE_HASH_SALT`, `PAYHERO_ACCOUNT_ID`, `PAYHERO_INTERNAL_TOKEN`, `SITE_BASE_URL` / `NEXT_PUBLIC_SITE_URL` (pick one identity), `RADIO_BRIDGE_LAN_URL`, `RADIO_STREAM_HOST`, `STREAM_HOST`, `ICECAST_HOST`, `SIMULATOR_PASSWORD`, `GATE_SCANNER_PIN`, `WAHA_*`.
2. Remove duplicate keys from `.env.local`.
3. Unify the public site URL on `APP_URL`; remove hardcoded `goodlife.smwhr.space` from drop/QR fallbacks.
4. Paystack: document one flag. Because the client can only read `NEXT_PUBLIC_*`, the supported switch should be `NEXT_PUBLIC_ENABLE_PAYSTACK`; the server can keep accepting both for compatibility.
5. WhatsApp: remove the hardcoded `goodlife_waha_secret_2026` fallback (fail closed or log loudly). Delete `WAHA_GATEWAY_URL` usage with `alerts.ts`.
6. Standardize Node/daemon names: either use `NVIDIA_NIM_API_KEY` / `FISH_AUDIO_API_KEY` / `FISH_AUDIO_VOICE_ID` on both sides, or make both sides read both names.
7. `BACKUP_DATABASE_URL`: wire it into a restore test or remove it from docs and `.env.local`.
8. Stream host: pick one default (`live-dj.goodlife.co.ke`), remove `darajadigital.com` defaults.

### 4.4 Acceptance criteria

- [ ] No key under `radio/sets/` exists in the public `goodlife` bucket.
- [ ] Anonymous `HEAD` to the public domain for a set key returns 403/404.
- [ ] Upload, sign, and delete all report the same bucket for a given `r2_key`.
- [ ] Deleting a set removes the object from the authoritative bucket.
- [ ] `register-upload` stores a non-null `r2_key` and validates `audio_url`.
- [ ] `.env.example` contains no variable that no code reads, and every live variable is documented.
- [ ] `tests/radio-signed-playback.check.ts` fails if the bucket is wrong and passes only when upload/sign/delete agree.
- [ ] `npm run build` remains green; run `tests/radio-signed-playback.check.ts`, `tests/soundboard-database.check.ts`, `tests/radio-playback.check.ts`, `tests/radio-ingest-signature.check.ts`.

---

## 5. Evidence index

| Area | File:line |
|---|---|
| Bucket resolver (public) | `lib/radio/r2-signer.ts:38-56` |
| Bucket resolver (radio) | `lib/radio/r2-signer.ts:58-82` |
| Signed playback + fallback | `lib/radio/r2-signer.ts:84-118` |
| Presigned upload | `lib/radio/r2-signer.ts:120-149` |
| Multipart helpers | `lib/radio/r2-signer.ts:153-215` |
| Delete helper | `lib/radio/r2-signer.ts:217-232` |
| Drop upload + URL | `lib/radio/r2-signer.ts:234-279` |
| Key extraction | `lib/r2-storage.ts:41-61` |
| TTL hardcoding | `lib/radio/playback.ts:35-46` |
| Signed-playback strip rule | `lib/radio/playback.ts:83` |
| Audio redirect + signing | `app/api/radio/audio/[kind]/[id]/route.ts:149-174` |
| Multipart API | `app/api/admin/radio/multipart/route.ts:19-52` |
| Set uploader | `app/admin/radio/page.tsx:450-507` |
| Soundboard uploader | `components/admin/radio/PerformanceSoundboard.tsx:486-502, 552-580` |
| Register upload | `app/api/admin/radio/register-upload/route.ts:17, 33-98` |
| Signed-playback test | `tests/radio-signed-playback.check.ts:160-185` |
| Env template — R2 | `.env.example:54-67` |
| Env template — radio stream | `.env.example:73-84` |
| Event flyer domain | `lib/event-flyer.ts:1-10` |
| Client mic hardcodes | `components/admin/radio/BrowserMicRecorder.tsx:306,348,509,532,563` |
| Site URL | `lib/seo.ts:20-35` |
| Drop site URL | `lib/radio/drop-context.ts:471`, `lib/radio/drop-engine.ts:42` |
| Paystack flags | `app/CheckoutClientPage.tsx:196`, `app/api/paystack/initialize/route.ts:9`, `app/api/paystack/verify/route.ts:9` |
| WhatsApp config | `lib/waha.ts:78-87`, `lib/whatsapp.ts:7-16`, `lib/radio/alerts.ts:34` |
| Phone hash salt | `lib/radio/shoutout-filter.ts:22` |
| PayHero account | `lib/payhero.ts:136` |
| Self-pay token | `lib/self-pay-token.ts:28` |
| Model/voice envs | `lib/radio/drop-engine.ts:653`, `lib/radio/audio-mastering.ts:139-142,248`, `home-server/daemon/services/ai_copywriter.py:24`, `home-server/daemon/services/voice_synthesizer.py:29-30` |
| Stream hosts | `app/api/admin/radio/stream-key/route.ts:34`, `app/api/admin/radio/presenters/route.ts:80`, `app/api/admin/radio/presenters/[id]/stream-key/route.ts:74`, `app/api/presenter/connection-status/route.ts:70` |

---

## 6. Not verified

- Production Vercel env values (the live check used `.env.local`).
- Whether the private bucket has a public custom domain (none is configured locally).
- Whether the 1 private-only drop is referenced by a live `radio_drops` row.
- Whether the public set copies are intentional backups. The code paths in this repo do not create them.
- No writes, deletes, bucket-policy changes, or env changes were performed.
