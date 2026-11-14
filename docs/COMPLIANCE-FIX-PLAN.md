# GOODLIFE Radio — Fix Plan (keeps the station playing)

**Date:** 13 November 2026
**Companion to:** `docs/COMPLIANCE-AUDIT.md`
**Status:** build specification. **No application code was changed.** The SQL below is printed for review; nothing was run against any database.

---

## 0. The one thing to be straight about

You said: *"I still need to be able to add music and people to listen."* Both survive. Here is the design rule that makes that true:

> **Separate "stored" from "aired".** A track can always be uploaded, ingested, edited and kept in the library. It only reaches a listener once someone has recorded where it came from and ticked a clearance box. Nothing is deleted, no upload button disappears, and no listener sees a difference.

Concretely:
- **Adding music:** the upload form gains a few fields (source, who owns it, permission reference, expiry, explicit flag). A track with written artist permission can be added in under a minute. The only thing that stops is adding a track with *no record at all*.
- **Listening:** signed playback URLs are issued by the server and handed to the existing `<audio>` element. The listener still presses play. No login, no new app, no extra click.

**The honest limit.** A gate is a record-keeping tool, not a way to make unlicensed music legal. If a track came from YouTube and nobody has permission to broadcast it, the code cannot fix that — it can only stop it going on air. That is the point of the gate. If KECOBO later says the annual minimum applies even at zero revenue, the only lawful zero-cash catalogue is music you own, music whose owners gave written permission, public-domain works, or freely licensed works whose licence explicitly allows broadcasting. That is a business/legal answer, not an engineering one (see Q13 in the audit).

---

## 1. Before any code (free, today)

1. **Send the two draft emails** in `docs/COMPLIANCE-AUDIT.md` §9 (CA and KECOBO). They are written, include Q1–Q13, and cost nothing. Add `[STATION NAME]`, `[SERVICE URL]`, `[DATE]`, contact details and expected audience.
2. **Switch off the risk amplifiers with config, not code:** disable tips/sponsors/contests (the tariff is reported as a percentage of net revenue), and take the public vault / download link out of the radio page. This is zero-cost and reversible, and it removes the three highest-ranked risks in the audit.
3. **Stop the automated ingest** (`scripts/radio-bridge-server.py`, `home-server/daemon/services/audio_fetcher.py`) from feeding the live rotation. Keep it installed; just disable the auto-slot step (§3.3).

**The three questions you pasted cannot be answered by me or by the code.** They need written answers from CA, KECOBO and BCLB. Important: they are **not blockers for building**. You can build Waves A–C below while waiting. Only two decisions wait on them:
- which `rights_basis` values are acceptable (Q2/Q8 — CMO licence vs direct artist permission);
- whether `random_draw` contests may ever be enabled (Q3/BCLB).

Until the BCLB answer arrives: **don't run prize giveaways at all.** Polls with no prize are fine; so is a pure skill/trivia question with published rules and no free-ticket prize. This is the safe interim position, not a legal conclusion.

---

## 2. Wave A — rights fields + clearance gate (3–4 days, no listener-visible change)

### 2.1 Additive SQL (print with `--dry-run`, review, then apply to a **branch** database only)

Save as `migrations/radio/20261115_05_rights_and_governance.sql` **only when ready to review**. `scripts/migrate.js` picks up every `.sql` in `migrations/radio/` and applies it to whatever `DATABASE_URL` points at — which may be production. Per `docs/BUILD-SPEC.md`: **never run a migration against production**. Keep the SQL in this document until you have printed it with `node scripts/migrate.js --dry-run` and reviewed it.

```sql
-- All additive. No drops, no rewrites, no NOT NULL without a default.
ALTER TABLE radio_sets
  ADD COLUMN IF NOT EXISTS rights_status        text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS rights_basis         text,          -- own_work | artist_written_permission | cmo_licence | public_domain | creative_commons | other
  ADD COLUMN IF NOT EXISTS rights_holder        text,
  ADD COLUMN IF NOT EXISTS rights_reference     text,          -- contract / email / licence number
  ADD COLUMN IF NOT EXISTS rights_document_key  text,          -- private R2 key of the permission document
  ADD COLUMN IF NOT EXISTS rights_territory     text DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS rights_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rights_attested_by   text,
  ADD COLUMN IF NOT EXISTS rights_attested_at   timestamptz,
  ADD COLUMN IF NOT EXISTS isrc                 text,
  ADD COLUMN IF NOT EXISTS source_url           text,
  ADD COLUMN IF NOT EXISTS is_explicit          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ai_generated      boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_radio_sets_rights
  ON radio_sets (rights_status, rights_expires_at);
```

`rights_status` values: `unverified` (default, never airs) → `cleared` (airs) → `expired` / `revoked` (stops airing). Existing rows stay `unverified` and, during the grace window, keep playing (§2.4).

### 2.2 One shared predicate — do not copy-paste SQL into five files

New file `lib/radio/rights.ts`:

```ts
export type RightsStatus = 'unverified' | 'cleared' | 'expired' | 'revoked';

export const RIGHTS_BASIS = [
  'own_work', 'artist_written_permission', 'cmo_licence',
  'public_domain', 'creative_commons', 'other',
] as const;

// Single source of truth for every playout / playlist query.
export const CLEARED_PREDICATE =
  "s.rights_status = 'cleared' AND (s.rights_expires_at IS NULL OR s.rights_expires_at > NOW())";

export function isClearedForBroadcast(row: {
  rights_status?: string | null;
  rights_expires_at?: string | Date | null;
}): boolean {
  if (row.rights_status !== 'cleared') return false;
  if (!row.rights_expires_at) return true;
  return new Date(row.rights_expires_at).getTime() > Date.now();
}

export function canAttest(input: {
  rights_basis?: string | null;
  rights_holder?: string | null;
  rights_reference?: string | null;
}): boolean {
  // Never allow a tick-box clearance with no paper trail.
  return Boolean(input.rights_basis && input.rights_holder && input.rights_reference);
}
```

Add `RADIO_ENFORCE_RIGHTS_GATE` (`'true'`/`'false'`, default `'false'`) so the gate can be switched on at a chosen cutover. No hardcoded fallback in production; fail closed if the variable is missing once the cutover has passed.

### 2.3 Where the gate goes (exact files, exact change)

| File | Change |
|---|---|
| `lib/radio/broadcast-state.ts` → `getCachedPlayoutDb()` | Both queries (the active-playlist join at line ~59 and the catalog fallback at line ~84) add `AND ${CLEARED_PREDICATE}` when the flag is on. This is the **real** air gate — it feeds the authoritative now-playing state. |
| `app/api/radio/state/route.ts` | Any `SELECT ... FROM radio_sets` that builds `sets[]` for the browser gets the same predicate. |
| `app/api/radio/live/route.ts` | Same for `now_playing` / `up_next` / `fallback_set`. |
| `app/api/radio/playlists/route.ts`, `app/api/radio/playlists/[id]/route.ts` | Public playlist tracks filtered by the predicate. |
| `app/api/admin/radio/playlists/[id]/tracks/route.ts` | Reject adding an `unverified` track with a clear 400 message: *"Record the source/permission for this track before adding it to rotation."* |
| `app/api/admin/radio/playlists/[id]/activate/route.ts` | The count query at line ~26 counts only cleared tracks; refuse activation if the playlist contains unverified tracks (or show a warning listing them). |
| `lib/radio/playlist-slotter.ts` → `slotTrackAsPlaylistUpNext()` | Skip unverified tracks. **This is the single most important line** — see §2.5. |
| `lib/radio/sequencer.ts` | If it selects candidate tracks, apply `isClearedForBroadcast`. |
| `app/api/admin/radio/drops/*`, `app/api/radio/drops/dynamic/route.ts` | Drops targeting a track should not fire for an uncleared track. |

### 2.4 Every insert path must record the source

| File | Change |
|---|---|
| `app/api/admin/radio/register-upload/route.ts` | The INSERT at line ~55 gains `rights_status, rights_basis, rights_holder, rights_reference, isrc, source_url, is_explicit`. Accept these from the upload form. Default `unverified`; if the form supplies a valid attestation, set `cleared` + `rights_attested_by/at`. **Keep `is_active = true`** — the track is stored and editable, just not aired until cleared. |
| `app/api/webhooks/radio-ingest/route.ts` | The INSERT at line ~77 records `source_url` (the source page), `external_id`, and `rights_status='unverified'`. The `ON CONFLICT ... DO UPDATE` must **not** reset an existing `cleared` status back to `unverified`. |
| `app/api/admin/radio/batch-ingest/route.ts` | Same fields; stop storing a raw YouTube page URL as `audio_url`. |
| `app/api/admin/radio/queue-next/route.ts` | Same fields on the `'processing'` row. |
| `app/api/hub/radio/route.ts` | Minimal INSERT — add the defaults so the column is never silently omitted. |

### 2.5 Stop the automatic on-air insertion

`app/api/webhooks/radio-ingest/route.ts` lines ~130–137 call `slotTrackAsPlaylistUpNext(trackId)` — a freshly downloaded track is **automatically slotted as UP NEXT**. That is the exact behaviour the gate must remove. Replace with:

```ts
if (isClearedForBroadcast(newTrack)) {
  await slotTrackAsPlaylistUpNext(trackId);
} else {
  // Stored in the library, visible in admin, awaiting rights attestation.
  console.info('[radio-ingest] Track held for rights attestation', trackId);
}
```

This is the difference between "you can still add music" and "music you add goes straight to air with no paperwork".

### 2.6 Admin UI so adding music stays easy

- `components/admin/radio/TrackEditDrawer.tsx`: add a **"Rights & source"** section — basis dropdown, rights holder, reference, document upload (to a **private** R2 key), ISRC, source URL, expiry, explicit flag, and a `Clear for broadcast` button disabled unless `canAttest()` passes.
- `components/admin/radio/LibraryIngestDock.tsx`: show the same fields in the ingest form so the person adding music does it once, at the point of entry.
- `app/api/admin/radio/library/route.ts` GET: return `rights_status` and a count of unverified tracks; add a `GET /api/admin/radio/library?rights=unverified` filter and an admin banner: *"N tracks will stop airing at cutover."*
- **Bulk attestation:** a CSV upload endpoint that maps `track_id → rights_basis, rights_holder, rights_reference` for backfilling. Log `rights_attested_by/at`. Do **not** provide a "mark all as cleared" button — that would defeat the control.

### 2.7 Cutover that does not silence the station

1. Deploy Wave A with `RADIO_ENFORCE_RIGHTS_GATE=false`. Nothing changes for listeners. Admin starts filling in rights for new and existing tracks.
2. Check the admin banner until the active playlist is fully cleared (or swap in a cleared playlist).
3. Flip the flag to `true` on an announced date. `broadcast-state.ts` now returns only cleared tracks; `totalDurationSec` shrinks, and the timeline math in `getAuthoritativePlayoutState()` still works because it is computed from whatever set list it receives.
4. Keep a one-click rollback (set the flag back to `false`).

**If most of the catalogue came from YouTube, most rows will be `unverified`.** That is real work, not a bug. Free ways to build a cleared catalogue while Q13 is with KECOBO: your own recordings and jingles; spoken word and interviews; local unsigned artists who sign a one-page permission (keep the signed copy); public-domain works; Creative Commons / free-library tracks **only if the licence explicitly allows broadcasting and on-demand replay** (many "free" tracks forbid commercial use or broadcast). "Royalty-free" does not mean "no rights". For artists registered with a CMO, direct permission may not be enough — that is Q8.

### 2.8 Tests

New `tests/radio-rights.check.ts` in the existing `tsx` convention: unverified never appears in the playout query, expired/revoked stop airing, `canAttest` rejects an empty reference, ingest never auto-slots an unverified track, `ON CONFLICT` does not downgrade a cleared row. Then `npx tsc --noEmit` and `npm run build` (the build is the typechecker per `AGENTS.md`). `npm run lint` has a pre-existing red baseline (37 problems) — compare against it, don't blame Wave A.

---

## 3. Wave B — private bucket + signed playback (4–6 days)

**A dedicated, self-contained implementation brief for this wave is `docs/SIGNED-PLAYBACK-PLAN.md` (v2).** Hand that file to the coder — it contains the repository context, exact verified line numbers, the route-guard allowlist requirement, code templates, tests and rollback. **Where it differs from this section, the brief wins:** it recommends a stable `/api/radio/audio/[kind]/[id]` redirect route (D2) instead of embedding signed URLs in cached API payloads, because that removes the URL-churn and CDN-expiry problems. It also corrects the poll interval (10 s), the exact `s-maxage` values, and the fact that the existing R2 bucket is shared with ticketing images, so it must NOT be made private. **Wrangler 4.86.0 is installed globally and already logged in**, so bucket creation and public-access control are terminal commands, not dashboard work — see brief §1.8. Read it before building Wave B.

### 3.1 Two options; pick the cheap one

| Option | How | Cost | Trade-off |
|---|---|---|---|
| **A. Signed GET URLs (recommended)** | `GetObjectCommand` + `getSignedUrl`, URL handed to the browser | Audio bytes still served by R2 (cheap) | Client must not restart playback when the URL refreshes — see §3.3 |
| **B. Server proxy** `/api/radio/audio/[id]` | Server streams the object, key never leaves the server | All audio through your Next host — **bandwidth can get expensive**, bad when cash is tight | Stable URL forever, simplest client change, easiest to enforce `is_public` |

Use A for the 24/7 player and vault; use B only for private presenter review playback and admin previews.

### 3.2 Code changes

`lib/radio/r2-signer.ts` — add a read-side helper (the file currently imports only `PutObjectCommand`, `DeleteObjectCommand` and multipart commands; there is **no** `GetObjectCommand`):

```ts
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function signRadioPlaybackUrl(
  r2KeyOrUrl: string,
  opts: { ttlSeconds?: number; asAttachment?: boolean } = {}
): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  const key = extractR2Key(r2KeyOrUrl) || r2KeyOrUrl;
  if (!key) return null;
  const cmd = new GetObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    ...(opts.asAttachment
      ? { ResponseContentDisposition: "attachment" }
      : { ResponseContentDisposition: "inline" }),
  });
  return getSignedUrl(r2.s3, cmd, { expiresIn: opts.ttlSeconds ?? 3600 });
}
```

Never return `r2_key`, `r2_high_key` or the raw `publicDomain` URL in a public response again.

| File | Change |
|---|---|
| `app/api/radio/recordings/route.ts` | Remove `r.r2_key` from the SELECT (line ~18) and `r2_key` from the JSON (line ~66). Return `playback_url: await signRadioPlaybackUrl(row.r2_key)`. Keep `is_public = true` in the WHERE. |
| `app/api/radio/state/route.ts`, `app/api/radio/live/route.ts`, `app/api/radio/playlists/[id]/route.ts`, `app/api/radio/playout-state/route.ts` | Replace `audio_url` / `audio_high_url` in public payloads with `playback_url`. Keep the DB columns for internal use. |
| `components/radio/FestivalSetVault.tsx` | **Delete the `download` anchor** (lines ~227–236) and the "Download Master MP3" / "320kbps Master" copy. Replace with `playSet()`. |
| `app/radio/shows/[slug]/page.tsx` | Native `<audio controls src={rec.audio_url}>` → `playSet()` or a signed URL with `controlsList="nodownload"`. |
| `components/radio/CatchUpVault.tsx`, `context/RadioContext.tsx` | `playSet()` / `playCurrentTrackAudio()` consume `playback_url`. **Only reassign `audio.src` when the string actually changed.** |
| `app/radio/embed/page.tsx`, `lib/radio/bitrate.ts` | Live HLS/Icecast URLs are unaffected (they are streams, not R2 files). Only the virtual/vault path changes. |
| `home-server/daemon/services/archiver.py` | Stop building `public_url` from `r2_public_domain`; store only the `r2_key` in `radio_recordings`. Keep `is_public = false` default. |
| `next.config.ts` | Keep `**.r2.dev` in `images.remotePatterns` only if cover art still uses it; audio no longer needs a public pattern. |

### 3.3 The trap that would break listening

The player polls `/api/radio/state` every few seconds. If each poll signs a fresh URL, the URL string changes, `<audio>.src` is reassigned, and **playback restarts constantly**. Fixes, all required:

1. **Stable expiry:** round to a window — `expiresAt = Math.ceil(Date.now()/300000)*300000 + 600000` — so all polls inside a 5-minute window produce the identical URL. Cache the signed URL in the API layer for that window.
2. **TTL must outlive the track:** `ttlSeconds = Math.max(3600, duration_sec + 600)`; a 90-minute set needs ~2h. Add a `GET /api/radio/playback-url?track_id=…` refresh endpoint the client calls ~2 minutes before expiry or on an `<audio>` error.
3. **Guard the assignment:** in `RadioContext.tsx`, `if (audio.src !== nextUrl) audio.src = nextUrl;`.

### 3.4 Cutover without dead air

1. Deploy the signed path while the bucket is **still public**. Old raw URLs and new signed URLs both work.
2. Verify on mobile, the embed player, the vault, and the backup-mix path. Add `tests/radio-playback.check.ts` asserting no public response contains `r2_key` / `audio_high_url` and that `playback_url` is present.
3. **Then** turn off public access to the bucket in the Cloudflare dashboard (this step cannot be done in code). Keep a 7-day rollback.
4. Re-issue signatures for any long-lived cached pages; purge CDN caches.

`is_public = false` still only hides a row — after Wave B the file is unreachable without a signature, so the approval flag finally means something at the storage layer.

---

## 4. Wave C — content, contests, consent, governance (7–10 days)

### 4.1 AI drops — disclosure, review, one validator, voice consent

- Additive SQL on `radio_drops`: `is_ai boolean default false`, `review_status text default 'pending'`, `reviewed_by text`, `reviewed_at timestamptz`, `disclosure_text text`, `voice_consent_id integer`. New `radio_voice_releases(person_name, voice_id, reference_key, consent_text, signed_at, expires_at)`.
- **One validator, not four.** New `lib/radio/content-validator.ts` with `validateBroadcastText(script, facts)` — hate/libel/profanity patterns, claim checks against `facts_hash`, forbidden invented artists/prices, trademark terms, length. Call it from **all** generators: `lib/radio/drop-engine.ts::validateDropScript()`, `app/api/admin/radio/drops/write-script/route.ts::isValidScript()`, `app/api/admin/radio/drops/generate/route.ts`, `scripts/phrase_validator.py` (or have the Python side call the same rule set exported as JSON in `config/`).
- **Mandatory review:** nothing enters the playout query until `review_status='approved'`. Add `AND review_status = 'approved'` to the drop SELECT in `lib/radio/broadcast-state.ts` (line ~244). Turn off the auto-confirm in `scripts/radio_playout_follower.py` and the cron auto-air in `lib/radio/cron-engine.ts`.
- **Disclosure:** show "AI-generated voice" in `components/radio/GlobalRadioBar.tsx` and in Media Session metadata; prepend a short spoken/watermark disclosure on generated drops. Admin-only "AI DROP STUDIO" labels are not listener disclosure.
- **Voice:** link every `config/radio-personas.json` `voice_id` (including the `_cloned` ones) to a `radio_voice_releases` row; block synthesis for a voice with no release. **`lib/radio/audio-mastering.ts::synthesizeFishAudioTts()`** is where the reference files in `public/voice-samples/` are used.
- **Restrict `app/api/radio/drops/live-inject/route.ts`:** accept an approved `drop_id` instead of an arbitrary `audio_url` + `script`; `requireAdmin`, validate, and write an audit row.

### 4.2 Contests — rules, cost, prize, winner method + the race

Additive on `radio_contests`: `rules_text`, `entry_cost_kes numeric default 0`, `prize_description`, `prize_value_kes`, `winner_method`, `terms_url`, `closes_at`. Render all of them in `components/radio/LiveContestWidget.tsx` (it currently declares `ends_at` / `event_title` but never shows them), and send `description` from `components/presenter/PresenterInteractionTools.tsx` (it currently hardcodes `contest_type: "passphrase"` and omits description).

Fix `app/api/radio/contests/enter/route.ts`:
```sql
BEGIN;
SELECT ... FROM radio_contests WHERE id = $1 FOR UPDATE;   -- lock the row
-- validate answer inside the transaction
UPDATE radio_contests
   SET winners_awarded = winners_awarded + 1
 WHERE id = $1 AND winners_awarded < max_winners
   RETURNING winners_awarded;                              -- 0 rows = someone else won
COMMIT;
```
Only mint the ticket **after** the guarded UPDATE returns a row. Fix `radio_contest_entries.awarded_ticket_id` to `TEXT` (it is currently `INTEGER REFERENCES tickets(id)` while `tickets.id` is `TEXT`). Reject `contest_type = 'random_draw'` and `'trivia'` in `app/api/radio/contests/route.ts` POST with a 400 until BCLB answers Q3; the `else` branch in `enter/route.ts` currently just records `is_winner = FALSE` and tells people a winner will be picked live on air. Add `tests/radio-contests.check.ts`.

### 4.3 Consent, opt-out, deletion

- Additive on `radio_shoutouts`, `radio_reminders`, `radio_tips`, `radio_contest_entries`: `consent_text_version`, `consent_at`, `consent_source`. Add a checkbox + "your name and message may be read out on air" notice to `components/radio/ShoutoutWall.tsx`, `ShowReminderButton.tsx`, `LiveContestWidget.tsx`, `TipModal.tsx`, and `app/radio/apply/page.tsx`.
- Put `unsubscribe_token` in every reminder footer; implement `START` in `app/api/whatsapp/webhook/route.ts`; fix the STOP acknowledgement's mis-tagged `messageType`.
- `app/api/presenter/shoutouts/route.ts` PATCH: clear `is_featured` on `rejected` (a featured-then-rejected item currently stays public).
- **One salt:** `lib/radio/shoutout-filter.ts::hashIdentifier` has a hardcoded fallback salt; `app/api/radio/tips/initialize/route.ts` uses an unsalted hash. Move both to a required `PHONE_HASH_SALT`, fail closed, and document it in `.env.example`.
- New `app/api/cron/radio-retention/route.ts` (`CRON_SECRET`) deletes/anonymises shoutouts, reminders, tips, contest entries, votes and messaging-log rows past an agreed retention period, plus `app/api/radio/privacy/route.ts` for access/deletion by token. Update `app/privacy/page.tsx` to describe radio data, `ip-api.com` lookup and coarse location.

### 4.4 Published pages and presenter acknowledgement

- New `app/radio/complaints/page.tsx` + `app/api/radio/complaints/route.ts` + `radio_complaints` table (`received_at`, `complainant`, `substance`, `response_at`, `final_response_at`, `status`) with 30/45-day tracking and one-year retention, matching 14.4/14.5.
- New `app/radio/editorial-policy/page.tsx` (2.4.6) and a station identity/contact/licence block. Link all of them from `app/radio/layout.tsx` and the radio footer — today only checkout pages link to `/terms`, `/privacy`, `/refunds`.
- Additive on `presenters`: `code_version`, `code_accepted_at`, `code_accepted_by`. Add a "Content rules & Programming Code" tab to `app/presenter/dashboard/page.tsx` with the Code PDF/link and a required acknowledgement at first login; record it. Add the same at `app/radio/apply/page.tsx`.
- Extend `radio_audit_logs` beyond the two stream-key actions, with a real actor instead of the hardcoded one in `lib/radio/ops-service.ts::recordRadioAuditLog()`.

### 4.5 Then, immediately after

Watershed/explicit filter (use `is_explicit` from Wave A; block flagged tracks 5am–10pm Nairobi in `broadcast-state.ts`), local-content tagging, ad flag + 10-min/30-min counter, and the authoritative `radio_airplay_log` + CSV export described in audit §6. Each needs its own `tests/*.check.ts`.

---

## 5. What stays working at every step

| Capability | Wave A | Wave B | Wave C |
|---|---|---|---|
| Admin can upload / ingest a track | Yes — with new fields, stored as `unverified` | Yes | Yes |
| Listener presses play and hears audio | Yes — unchanged | Yes — signed URL, no visible change | Yes |
| Live DJ / HLS / Icecast stream | Unaffected | Unaffected | Unaffected |
| Embed player `/radio/embed` | Yes | Yes (test explicitly) | Yes |
| Festival Vault / catch-up | Yes | Yes — no download link | Yes |
| Playlists, harmoniser, sequencer | Yes — filters uncleared tracks | Yes | Yes |
| Tips / sponsors / contests | Yes (but consider switching off, §1) | Yes | Yes — with rules/consent |
| Adding a track to rotation | **Only if cleared** | Only if cleared | Only if cleared |

The single behaviour that changes: a track with no rights record can no longer go on air. Everything else is the same station.

---

## 6. Build order and verification

| Wave | Days | Gate | Verification |
|---|---|---|---|
| 0 | 0 | Send emails; disable revenue + downloads + auto-ingest | Manual check of `/radio` |
| A | 3–4 | Rights fields, shared predicate, attestation UI, `RADIO_ENFORCE_RIGHTS_GATE=false` | `tests/radio-rights.check.ts`, `npx tsc --noEmit`, `npm run build` |
| A-cutover | 0.5 | Flip flag once the active playlist is cleared | Admin banner reads 0 blocked; listen for 10 min |
| B | 4–6 | Signed playback, remove download link, private bucket last | `tests/radio-playback.check.ts`; mobile + embed + vault + backup-mix |
| C1 | 3–4 | AI drops + voice releases + live-inject restriction | `tests/drop-engine.check.ts` extended |
| C2 | 2–3 | Contest rules + atomic cap + `random_draw` disabled | `tests/radio-contests.check.ts` |
| C3 | 3–4 | Consent / retention / complaints / editorial policy / presenter Code | `tests/radio-shoutouts.check.ts` extended |
| C4 | 4–6 | Watershed, ad log, airplay log + exports | New checks + `npm run build` |

**Rules carried over from `AGENTS.md` and `docs/BUILD-SPEC.md`:** migrations are additive and idempotent only; **never run a migration against a production database** — print the SQL with `--dry-run` for review and apply to a branch database; new `/api/radio/*` routes are public by default and must guard themselves; state the auth rule for each new route; missing secrets fail closed; no hardcoded fallback salts; work on a branch, commit in small steps; `npm run build` is the typechecker and `npm run lint` has a known 37-problem baseline.

---

## 7. The three regulator questions — what to do about them

You asked for answers. I can't give them: whether a licence is needed, which tariff applies, and whether a giveaway needs BCLB authorisation are legal/regulatory determinations, not engineering facts. Repeating them as unanswered is the correct outcome, and the audit deliberately marks them **Needs legal confirmation**.

What you *can* do:
1. Send the CA and KECOBO drafts (§9 of the audit). They contain Q1, Q2, Q3, Q8 and Q13 verbatim. Add the BCLB question (Q5) as a separate short email to the Betting Control and Licensing Board, or ask CA to route it.
2. Build Waves A–C anyway. The rights gate, signed playback, disclosure, consent, complaints and audit records are useful whatever the answers are.
3. Hold only two switches: `random_draw` contests (until BCLB/CA answer Q5) and the `rights_basis` values you accept (until KECOBO answers Q2/Q8).
4. Keep the replies in writing and store them as `rights_reference` / contract documents — that is exactly the "written proof" the Programming Code's 5.5.1.4 asks for.

---

*This is an engineering plan, not legal advice. Nothing here has been implemented; no code or database was changed to produce it.*
