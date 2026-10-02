# Goodlife — Verified Bug Fix Plan

**Date:** 2026-10-02
**Repo:** `goodlife-event-tickets` (Next.js 15.5.19 App Router, TypeScript, Tailwind v4, Neon Postgres, Vercel)
**Status:** Plan only. **No source files changed. No writes to the live database.**

Everything below was verified from source or by read-only query. Where a claim could not be
verified from code, it is labelled as such.

---

## How this was verified

- Read the actual source for every line reference below.
- Read-only `SELECT` queries against the live Neon DB via a throwaway script in
  `%LOCALAPPDATA%\Temp\opencode\` (never in `scripts/`, never committed).
- `EXPLAIN` used to prove a SQL failure **without executing** it (see B1).
- HTTP status checks against the real image URLs.
- Two subagents were launched for independent audit. **The first one fabricated its
  quotes** — its code samples did not match this repository (it cited
  `handleSwitchEvent(eventId: string)`, `getAllEvents()`, `currentEvent`,
  `showEventSelector`, and `rounded-full border-black/20` styling, none of which exist
  here). Its conclusions happened to agree with reality, but the evidence was worthless
  and everything was therefore re-verified by hand. The second never returned. Treat any
  future subagent output from this project as a claim to check, not as evidence.

---

# Part A — Answers to the two questions asked

## A1. Free API for photos — you already have one

**ImgBB**, already wired into this app.

| Property | Value |
|---|---|
| Cost | Free |
| Storage / bandwidth caps | **None** |
| Max file size | 32 MB per upload |
| Media types | Images only |

Two call sites, and **both leak the key to the browser**:

- `components/admin/PosterUploader.tsx:7` — `const IMGBB_API_KEY = "46a61350ab6bdc4e5ab0ef6e4e47e5be"`
- `app/admin/gallery/page.tsx:7` — same literal, same value

Both call `https://api.imgbb.com/1/upload?key=…` **directly from the client**
(`PosterUploader.tsx:47`, `admin/gallery/page.tsx:127`). There is no server route and no
auth in front of it. Any visitor can read the key from the page bundle and use your ImgBB
quota. `next.config.ts` whitelists `i.ibb.co` as a remote image host precisely because of this.

**The provider is fine. The architecture is the problem** — see Phase 5.

## A2. Free API for videos — yes, four real options

ImgBB **cannot** take video (images only). Verified free tiers as of 2026-09/10:

| Provider | Free storage | Free bandwidth | Video? | Integration effort |
|---|---|---|---|---|
| **Vercel Blob** | 1 GB/month | 10 GB/month | Any MIME | **Lowest** — app already on Vercel |
| **Cloudflare R2** | 10 GB-month | **Unlimited, free** | Any MIME | Medium — S3 SDK + account setup |
| **Cloudinary** | 25 credits/month | 1 GB per credit | Yes, with transcoding | Medium — credit model is awkward |
| **ImageKit** | 3 GB | 20 GB/month | 500 video units/month | Medium |

Notes that matter:

- **Cloudinary's free tier is weak for video.** 25 credits/month, where 1 credit = 1,000
  transformations **or** 1 GB storage **or** 1 GB bandwidth. The 2 GB *video* bandwidth rate
  is a paid-plan-only rate, so video delivery on the free tier is effectively unusable.
  Great for images, wrong tool for video.
- **Vercel Blob** is the path of least resistance: the app is already deployed on Vercel,
  it is a single `@vercel/blob` dependency, it accepts any MIME type, and `del()` is free.
  **Caveat:** Vercel's Hobby plan is documented as *"non-commercial, personal use only."*
  This is a real commercial ticketing business, so you should be on Pro ($20/mo) before
  leaning on Blob. That is a pre-existing account decision, not something introduced here.
- **Cloudflare R2** has the best raw economics — egress is free at any volume, and egress
  is exactly the cost that kills video hosting elsewhere. Costs a Cloudflare account and
  `@aws-sdk/client-s3`. If video volume ever grows, this is the destination.

**Recommendation:** Vercel Blob for video, ImgBB for photos (already working), and move both
behind server routes so the keys stop shipping to the browser.

---

# Part B — Verified bugs

## 🔴 B1. The admin event editor cannot save anything (returns HTTP 500)

`events.video_url` **does not exist** in the live database — `information_schema` reports 27
columns on `events` and `video_url` is not among them.

But three places assume it does:

- `lib/supabase-db.ts` → `MUTABLE_EVENT_FIELDS` includes `'video_url'`
- `app/admin/dashboard/page.tsx:1193` **always** sends it:
  `video_url: (eventFormState as any).video_url || null`
- `app/api/events/[id]/route.ts:29` forwards the entire request body to `updateEvent`

Proven with `EXPLAIN`, which plans a statement without executing it:

```
EXPLAIN UPDATE events SET "title"=$1, "status"=$2, "video_url"=$3 WHERE "id"=$4
  -> ERROR:  column "video_url" of relation "events" does not exist

EXPLAIN UPDATE events SET "title"=$1, "status"=$2 WHERE "id"=$3
  -> PLANNED OK
```

Git history shows the intent that never landed: `b1baeef feat(db): add video_url to events
schema and update mutable fields`. The allowlist entry and the form field shipped; the DDL
was never run. `schema.sql` / `schema-neon.sql` never got it either.

**Impact:** every edit through the event editor fails — title, subtitle, venue, Tickets
Open/Close, flyer. Closing and reopening still works because that goes through
`/api/events/[id]/archive`, a different function. **This blocks B7 and B8 below.**

## 🔴 B2. The checkout page's edition switcher bypasses `publicState()`

`publicState()` in `lib/event-availability.ts` is the single authority on which public page
an event gets. It runs **only** on the server, from `app/page.tsx:188`.

`app/CheckoutClientPage.tsx` contains **no** reference to `publicState`, `isEventSellable`
or `getEventAvailability`. Its only use of `isHiddenFromSite` (imported line 39) is at
line 219, filtering which events appear in the switcher list.

`handleSwitchEvent(targetEvent: Event)` at line 343 overwrites `eventDetails` and the tier
list in React state, then calls `window.history.pushState({}, "", "/?event=" + id)` at
line 387. It never asks which page the target event deserves.

The other two pages get this right — both navigate through the server:

- `app/ScheduledEventClientPage.tsx:239` → `<Link href={`/?event=${evt.id}`}>`
- `app/ClosedEventClientPage.tsx:183` → `<Link href={`/?event=${evt.id}`}>`

So switching from Park & Chill to a **closed** GOODLIFE 4 leaves you sitting on
`CheckoutClientPage` with that event's tiers and a live Pay button. The recap page becomes
unreachable without a full page load. `/api/payhero/initialize` will then refuse, so the
customer fills in the whole form and is rejected at the last step.

**Scope:** `CheckoutClientPage` only — plus `LiveMiniEventBanner` rendered on it
(`app/CheckoutClientPage.tsx:1186`, `onSelectEvent={handleSwitchEvent}`), which routes
through the same bypass.

## 🟠 B3. "ALSO LIVE:" is a hardcoded literal

`app/CheckoutClientPage.tsx:1066` — `<span>ALSO LIVE:</span>`. It prints
`eventsList.find(e => e.id !== eventDetails.id)?.title` with no reference to status.

The filter at line 219 is `!isHiddenFromSite(e)`, which drops only archived events, so
**closed editions deliberately stay in the list** (you must be able to reach a concluded
edition) — and then get labelled live.

The desktop editions dropdown (around lines 951–980) is worse: no status badge at all.
`ClosedEventClientPage.tsx:191-206` badges correctly with `canonicalStatus`
(`LIVE` / `SOON` / `CLOSED`); the checkout page never got that treatment.

## 🟠 B4. No delete anywhere for gallery photos

`app/api/hub/gallery/route.ts` exports **only `GET` and `POST`** — 44 lines, no `DELETE`.
Fifteen other routes in this app do implement `DELETE` (`admin/tickets/[id]`,
`vendor/items/[id]`, `admin/vendors/[id]/items`, `admin/pending-payments`,
`admin/payment-logs`, …), so this is an omission, not a project convention.

`app/admin/gallery/page.tsx:4` imports `Trash2` from `lucide-react` and **never uses it**.
The delete button was designed and never built.

**Impact:** once a photo row exists it is permanent. There is no UI and no endpoint.

## 🟠 B5. The recap page's gallery and radio cards are fabricated

`app/ClosedEventClientPage.tsx:302-327` hardcodes its content. Live data versus page copy:

| Claim on the page | Reality (verified) |
|---|---|
| "LATEST PHOTO DROP" with a gray camera icon | Hardcoded placeholder, lines 303–305. Never wired to anything. |
| "BROWSE ALL 140+ HIGH-RES PHOTOS" (line 309) | 34 rows in `event_gallery`. **30 return HTTP 404.** `/gallery` displays **4**. |
| "DJ SLICK LIVE AT SUNSET" (line 319) | The single `radio_sets` row is **DJ Kaneda**. |
| "PLAY SET (1h 48m)" (line 323) | Actual `duration` is **45:20**. |

HTTP verification of the two Unsplash IDs that the app filters out:

```
photo-1540039155732-… -> 404
photo-1470229722913-… -> 404
photo-1514525253161-… -> 206 image/jpeg   (survives)
photo-1470225620780-… -> 206 image/jpeg   (survives)
```

**All 34 photos belong to `event_id = 1`** — the archived GOODLIFE XP. GOODLIFE 4 and
Park & Chill #12 have **zero** photos. So wiring "latest photo" per-event renders an empty
card on the GOODLIFE 4 recap; wiring it site-wide shows XP photos on a GL4 recap.

Two implementation constraints:

- `images.unsplash.com` is **not** in `next.config.ts` `images.remotePatterns` (only
  `picsum.photos` and `i.ibb.co`), so `next/image` will refuse these URLs.
  `app/gallery/page.tsx:72` uses a raw `<img>` for exactly this reason.
- `ScheduledEventClientPage.tsx:60-62` documents deliberately omitting the gallery card
  ("a 'LATEST PHOTO DROP' card on an event that has not happened is the same lie in a
  different font"). Worth respecting that reasoning.

## 🟠 B6. The recap page shows a different-looking poster

Same file, two presentations:

- Checkout / coming-soon — `components/StoryDeckHero.tsx:161` renders the poster in a
  **portrait** card: `md:aspect-[707/1000]`, `max-md:aspect-[390/551]`, `object-cover`.
  You see the whole flyer.
- Recap — `app/ClosedEventClientPage.tsx:220-224` renders the same URL full-bleed in
  **`aspect-video`** with **`object-cover opacity-60`**. A portrait flyer cropped to a
  horizontal band and dimmed to 60% reads as a different poster.

**Latent landmine:** `lib/event-flyer.ts:16` treats `flyer_url === "/flyer.png"` as *unset*
(`if (custom && custom !== "/flyer.png" && custom !== "")`) and then falls through to a
keyword heuristic over title + subtitle — `chill`, `park & chill`, `park and chill`,
`sunday`. If a flagship's subtitle ever contains "sunday", it silently becomes the Park &
Chill poster even though `flyer_url` was set explicitly. GOODLIFE 4's subtitle is
`MARARA CAMP, THIKA | NOV 7`, so it is safe today and one word away from breaking.

`public/` is clean against git — `flyer.png` last changed in commit `dfd2480`, so this is
presentational, not a file replacement.

## 🟡 B7. `next_event_title` has no input anywhere

`events.next_event_title` is currently `'GOODLIFE 5'` on event 2. Live DB has no
GOODLIFE 5 row (only XP/archived, GOODLIFE 4, Park & Chill #12), so it is free text, not a
lookup. It was hardcoded by `scripts/test-closed-flagship-flow.js`:

```sql
UPDATE events SET status = 'closed', ..., next_event_title = 'GOODLIFE 5' WHERE id = 2;
```

In the admin dashboard it appears in exactly two places — `page.tsx:1797` loads it into form
state, `page.tsx:1200` saves it back. **There is no `<input>` bound to it anywhere in the
codebase.** The dashboard preserves the value and can never change or clear it.

Rendered at `app/ClosedEventClientPage.tsx:248-260`. Blocked by B1 until that is fixed.

## 🟡 B8. The public page is stale after an admin change

> **CORRECTION — this section was wrong on first write.** It originally blamed a "hard
> 30-second floor" in `segment-cache-impl/cache.js`. That code is **gated off in this
> repo** and never executes. Verified:
>
> - `node_modules/next/dist/build/define-env.js:99` sets
>   `process.env.__NEXT_CLIENT_SEGMENT_CACHE = Boolean(config.experimental.clientSegmentCache)`
> - `node_modules/next/dist/server/config-shared.js:149` defaults `clientSegmentCache: false`
> - `next.config.ts` has **no `experimental` key at all**
>
> So `segment-cache.js` exports `notEnabled` throwers and `getStaleTimeMs` is dead code
> here. The 30 s figure must not appear in a comment or a fix.

**What is actually true:**

The server is definitively clean — no cache of any kind:

- `fetchAllEvents` is a plain `SELECT * FROM events` per request (`lib/supabase-db.ts`),
  and `neonQuery` is a bare `(_text, params) => _pool.query(...)` passthrough
- No `unstable_cache`, `unstable_noStore`, `revalidatePath`, `revalidateTag`,
  `export const revalidate`, `next: { tags }`, `useSWR` or `"use cache"` anywhere in
  `app/`, `lib/` or `components/`
- `app/page.tsx`, `app/events/page.tsx`, `app/events/[id]/page.tsx` are all
  `force-dynamic`
- `public/sw.js` gates `cache.put` on `/icons/`, `.png`, `.ttf`, `.svg`,
  `/_next/static/` and skips `/api/*` — it **cannot** serve a stale HTML document
- The four event API routes set no cache headers in either direction

The governing client-side constants are
`staleTimes: { dynamic: 0, static: 300 }` (`config-shared.js:203-204`), read by
`prefetch-cache-utils.js:277-278`. With `dynamic: 0`, an `auto` prefetch returns
`stale` — it paints the cached tree and refetches behind it. Only a **full** prefetch
within **300 s** is served with no refetch.

**The defensible root cause is the raw history mutation, not the cache lifetime.**
`app/CheckoutClientPage.tsx:387` calls `window.history.pushState({}, "", "/?event=N")` and
`app/admin/dashboard/page.tsx:423` calls `window.history.replaceState(null, "", url)`.
Both change the address bar **behind the App Router's back**, so Next is never told the
URL changed and never invalidates its cache. The app therefore believes it is still on the
previous route, and the two disagree. A manual refresh rebuilds the document and resolves
it — exactly the reported symptom.

**Fix (unchanged in spirit, now better justified):** use `router.push` / `router.replace`
from `next/navigation` instead of raw history mutation, or make the admin link a hard
`<a href="/">`. A hard navigation is the only option that guarantees correctness without
relying on router-cache behaviour.

**Honest limitation:** the *observed* stale window was not measured. Reproducing it needs a
production-mode browser test (`npm run build && npm run start`) — dev mode does not engage
the client router cache the same way, so a dev repro will mislead.

**Pre-existing noise worth fixing while in there:** `app/admin/dashboard/page.tsx:1790-1794`
carries a comment asserting that the inputs for these fields "did not exist". That is
false for `sales_open_date` / `sales_close_date`, which do have inputs at lines 3573-3590.
Only `next_event_title` genuinely lacks one. A stale comment here will mislead the next
reader into skipping B7.

## 🟡 B9. Gallery `tag` is silently discarded

`event_gallery` has a `tag` column (default `'CROWD'`), and
`app/admin/gallery/page.tsx:169` sends `tag` in the POST body. But
`app/api/hub/gallery/route.ts:28` destructures only
`{ event_id, image_url, thumbnail_url, caption }` and the INSERT does not include `tag`.

Verified in the live DB: **all 34 rows are `CROWD`**, even though the admin UI offers
POSTER / PHOTO / RECAP / PROMO / FLYER.

## 🟡 B10. Duplicated dead-URL filter and a lying count

The same hardcoded Unsplash exclusion appears twice:
`app/admin/gallery/page.tsx:229` and `app/gallery/page.tsx:39`.

Because the admin page counts *before* filtering, its header (`page.tsx:210`) reports
**"34 images"** while the grid underneath renders **4**.

---

# Part C — `event_gallery` schema today

```
id             integer  NOT NULL  default nextval('event_gallery_id_seq')
event_id       integer
image_url      text     NOT NULL
thumbnail_url  text              default ''
caption        text              default ''
tag            text              default 'CROWD'
created_at     timestamptz       default now()
```

There is **no `video_url` and no `media_type`**, and `image_url` is `NOT NULL` — so a video
row must carry a poster frame in `image_url`.

---

# Part D — The plan

Ordered so each phase unblocks the next. **Phase 1 first: B1 currently makes the admin
event editor unusable, which blocks Phases 2 and 5.**

## Phase 1 — Unblock the admin (B1, B7)

1. **`scripts/add-events-video-url.js`** — dry-run by default, `--apply` to write, matching
   the repo's existing convention (hand-parsed `DATABASE_URL` from `.env.local`, no `dotenv`
   dependency). Runs `ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url text`.
2. Update `schema.sql` and `schema-neon.sql` so the DDL is not a lie again.
3. **Add the "Next Edition Name" input** at `app/admin/dashboard/page.tsx:3597`, next to
   Tickets Open/Close. The load (line 1797) and save (line 1200) plumbing already exists;
   only the `<input>` is missing. Allow empty so the column can be cleared.

**Alternative to step 1** if you would rather not add the column: strip `video_url` from
`MUTABLE_EVENT_FIELDS` and from the dashboard payload. `resolveEventVideo` already handles
absence by falling back. I recommend the ALTER, because `d0a9681` added the field
deliberately.

## Phase 2 — Routing correctness (B2, B8)

4. Replace the body of `handleSwitchEvent` (`app/CheckoutClientPage.tsx:343`) with a hard
   navigation: `window.location.href = '/?event=' + targetEvent.id`. Costs one page load,
   is immediately correct, and removes the `pushState` history desync in the same edit.
   Every other switcher in the app already round-trips through the server this way.
5. If you want to keep the instant switch, use `router.push` + `router.refresh()` **and**
   guard client-side: if the resulting state is not `checkout`, render a concluded /
   coming-soon panel instead of a live Pay button.
6. Change `app/admin/dashboard/page.tsx:1660` from `<Link href="/">` to `<a href="/">`, and
   call `router.refresh()` after any close/reopen mutation.
7. **Add a case to `tests/public-state.check.ts`** asserting the checkout switcher cannot
   leave a `closed` event on a pay-enabled page. That invariant is precisely what broke,
   and nothing was watching it.

## Phase 3 — Honest labels (B3)

8. Replace the hardcoded `ALSO LIVE:` (`CheckoutClientPage.tsx:1066`) with the other event's
   real `canonicalStatus`, reusing the badge logic already written at
   `ClosedEventClientPage.tsx:191-206`.
9. Add the same badge to the desktop editions dropdown.
10. Move the "OTHER EDITIONS" list off `!isHiddenFromSite` alone so the label and the list
    agree, while keeping closed editions reachable.

## Phase 4 — Real gallery and radio on the recap page (B4, B5, B6, B10)

11. **Add `DELETE` to `app/api/hub/gallery/route.ts`** guarded by `requireAdmin()`, matching
    the shape of the existing 15 delete handlers. Delete the DB row, and best-effort delete
    the remote file: ImgBB returns a `delete_url` on upload when a key is used, so persist
    that alongside the row if you want remote cleanup.
12. **Build the delete UI** in `app/admin/gallery/page.tsx` — `Trash2` is already imported at
    line 4. Hover-reveal button + confirm. Never on the public `/gallery` page.
13. **Fix the count** (B10): filter before counting, and extract the duplicated dead-URL
    predicate into one shared helper used by both the admin and public pages.
14. **Wire the recap page to real data**: fetch gallery + radio server-side in
    `app/page.tsx` and pass real props into `ClosedEventClientPage`. Render the latest photo
    with a raw `<img>` (not `next/image` — Unsplash is not whitelisted), reusing the
    dead-URL filter. Render the **true** photo count. Take DJ name and duration from
    `radio_sets`.
15. **Decide the empty-state policy** — see Open Decisions below.
16. **Give the recap hero the same portrait framing** as the checkout
    (`aspect-[707/1000]`) instead of a 60%-opacity 16:9 crop.
17. **Upload real photos** for events 2 and 3 through `/admin/gallery`. Until then the
    recap page has nothing true to show.

## Phase 5 — Gallery tags and video support (B9, A1, A2)

18. **Honour `tag`**: add `tag` to the destructuring and the INSERT in
    `app/api/hub/gallery/route.ts`. Backfill the 34 existing `CROWD` rows by hand.
19. **Stop shipping the ImgBB key to the browser.** Add `app/api/admin/upload/image.ts`
    that reads `IMGBB_API_KEY` from the server environment, calls ImgBB there, and returns
    the hosted URL. Point both `PosterUploader.tsx` and `admin/gallery/page.tsx` at it, and
    delete both hardcoded literals. Add `IMGBB_API_KEY` to `.env.example` — it is not
    documented there today.
20. **Add video support.** Schema migration for `event_gallery`:
    `ALTER TABLE event_gallery ADD COLUMN media_type text NOT NULL DEFAULT 'image',
     ADD COLUMN video_url text, ADD COLUMN poster_url text;`
    with `image_url` continuing to hold the poster frame for video rows (it is `NOT NULL`).
21. **Add `@vercel/blob`** and a server upload route for video. Accept `video/*`, cap size
    (~100 MB), stream to Blob, store the URL in `video_url` and a poster frame in
    `image_url`. `del()` is free, which makes Phase 4 step 11's remote cleanup exact.
22. **Render video in the gallery** — extend `app/gallery/page.tsx` to branch on
    `media_type`, with `<video>` plus a poster attribute for video rows and `<img>` for
    image rows.
23. **If video volume grows**, migrate to Cloudflare R2 (10 GB storage, unlimited free
    egress) behind the same route interface, so the swap is one file.

## Phase 6 — Remove the latent traps

24. Drop `"/flyer.png"` as a magic sentinel in `lib/event-flyer.ts:16`. Treat only
    empty/null as unset, so an explicit flagship poster can no longer be hijacked by a
    subtitle containing "sunday".
25. **Add a case to `tests/event-media.check.ts`** for a flagship whose subtitle contains
    "Sunday", pinning B6's landmine shut.

---

# Part E — Verification

Run after every phase:

```powershell
npm run build      # the ONLY typecheck: ignoreBuildErrors is false
npm run lint       # baseline 37 problems (24 errors, 13 warnings) in 15 files
Get-ChildItem tests -File | ForEach-Object { npx tsx $_.FullName; if ($LASTEXITCODE) { "FAILED: $($_.Name)" } }
```

Current test baselines, all green as of 2026-10-02:

| File | Assertions |
|---|---|
| `public-state.check.ts` | 47 |
| `phone.check.ts` | 35 |
| `scanner-vendor-auth.check.ts` | 14 |
| `never-invent-prices.check.ts` | 11 |
| `customer-audit-unification.check.ts` | — |
| `manifests.check.ts` | — |
| `event-media.check.ts` | — |
| `story-deck.check.ts` | — |

`npx tsx tests/public-state.check.ts --live` re-runs the routing decisions read-only
against the real database.

**After B1 is fixed, manually re-test the event editor end to end** — it has never
successfully run with a `video_url` field present, so treat first success as unproven.

Reminder from `AGENTS.md`: `npm run build` is the typechecker. A stale `.next/` produces a
confusing `TypeError: Cannot read properties of undefined (reading 'length')`; `npm run
clean` then `npm run build` fixes it. Do not re-add `tsconfig.tsbuildinfo` to git.

---

# Part F — Open decisions

1. **Recap photo when the event has none.** All 34 photos belong to archived event 1.
   Options: (a) show site-wide latest — XP photos on a GL4 recap; (b) hide the card when the
   event has no photos, matching `ScheduledEventClientPage`'s documented reasoning;
   (c) show it anyway with a "no photos yet" caption. **I recommend (b).**
2. **Vercel Hobby is non-commercial.** Blob is the easiest fit but the plan's fair-use terms
   restrict Hobby to personal, non-commercial use. Confirm you are on Pro before relying on
   it for a business.
3. **Keep ImgBB for photos, or move everything to Vercel Blob for one provider?** One
   provider is simpler to reason about; ImgBB is already working and has no caps.
4. **Should the 30 dead Unsplash rows be deleted?** After Phase 4 step 11 exists, yes —
   they render as broken images everywhere. They are `event_id = 1` (archived XP).
5. **Is `next_event_title` free text, or should it be a real event reference?** Right now an
   operator types a name that can disagree with reality — it says "GOODLIFE 5" and no such
   event exists.

---

# Part G — The homelab, Cloudflare, and a self-hosted photo library

Answering "can the homelab be the storage, and can it be a Google Photos replacement?"
investigated live over SSH on 2026-10-02. Read-only throughout; nothing on the box was
changed.

## G1. What the box actually is

Reachable at `192.168.100.29`, hostname `khesh`, Tailscale name `klesh-server`
(`100.107.187.47`). Identified by `~/.ssh/known_hosts` — it was connected to before.

| | |
|---|---|
| CPU / RAM | 4 cores / 7.0 GB total, **3.7 GB available** under load 0.70 |
| Disk | 233 GB `ST9250315AS`, `ROTA=1` — a **2015-era spinning laptop HDD**, no SSD |
| Free space | ~57 GB on `/`, ~42 GB on `/home` |
| Network | LAN `192.168.100.29`, public egress `105.163.157.7` → **behind NAT** |
| Uplink | ~8.7 MB/s down measured from the box |
| Stack | Docker + compose, nginx, AdGuard Home (LAN DNS), Tailscale, `cloudflared` |
| Containers | 16 already running, incl. `waha`, `odoo`, `n8n`, `adguard-home`, `invidious`, `ytzero`, `homarr` |

This box is **not idle**. It already hosts the WhatsApp gateway that drives ticket
delivery for this very app. Adding a photo library competes with production services.

## G2. It cannot serve the site as-is — the blocker is reachability, not capacity

The app is on Vercel. Vercel functions run in AWS and can only reach **public internet**
endpoints. Every address on this box fails that test:

| Address | Verdict |
|---|---|
| `192.168.100.29` | RFC1918 private LAN. Unreachable from Vercel. |
| `100.107.187.47` (Tailscale) | `100.64/10` CGNAT, not publicly routable, and Vercel is not on the tailnet. Unreachable. |
| `105.163.157.7` | That is the box's **egress** IP. The box is behind NAT, so nothing listens inbound on it. Unreachable. |

The LAN IP and the egress IP differ, which is the direct evidence of the NAT. Any of these
would need a tunnel, a port forward, or a VPS reverse proxy.

## G3. Cloudflare is already in place — and its ToS is the real blocker

Good news first: **the domain is already on Cloudflare and a tunnel is already running.**

- `darajadigital.com` NS = `edward.ns.cloudflare.com`, `meg.ns.cloudflare.com`
  (confirmed both from this machine and from the box)
- `/usr/local/bin/cloudflared` is installed; tunnel `987741e3-…` with
  `/etc/cloudflared/config.yml` (plus three dated backups)
- `waha.darajadigital.com` resolves to Cloudflare anycast `104.21.20.236` /
  `172.67.194.196` — i.e. **it is already proxying to this box in production**

So `media.darajadigital.com` or `photos.darajadigital.com` is a one-line addition to
`config.yml`. That part is easy.

**But do not proxy the media bytes through it.** Two independent limits:

1. **Upload ceiling.** Free and Pro tunnels cap request bodies at **100 MB** (Business
   200 MB, Enterprise 500 MB, and Enterprise can request more). Only Enterprise can raise
   it. Festival teaser video is already 5.5–7.5 MB per file today and will grow.

2. **Terms of service — this is the serious one.** Cloudflare's Service-Specific Terms for
   the CDN (Free, Pro *and* Business) state that you must use a paid service such as
   **Stream** or **Images** *"in order to serve video and other large files via the CDN"*
   — and that Cloudflare *"reserves the right to disable or limit your access"* if you use
   the CDN without those paid services to serve video or a disproportionate share of
   pictures or large files.

   A gallery of 34 photos scaling to hundreds, served through the proxy, is precisely
   "a disproportionate percentage of pictures". **The risk is not throttling — it is the
   whole zone being disabled**, which would take `waha.darajadigital.com` down with it and
   break ticket WhatsApp delivery in production.

**Conclusion:** use the tunnel for a **control plane** (an HTML/API app behind a
subdomain — this is what Immich's own docs recommend a tunnel for), and never for the
media bytes. Serve the bytes from Cloudflare R2, which is the product Cloudflare actually
wants used for this: 10 GB-month free storage, **unlimited free egress**, 5 GiB
single-part upload, 5 TiB objects, custom domain, no 100 MB tunnel cap.

## G4. Self-hosted Google Photos — Immich is the right answer, this box is the wrong host

**Immich** is the clear open-source equivalent: AGPL-3.0, iOS/Android apps with background
auto-upload, face recognition, semantic search ("beach 2023"), timeline, shared albums,
no 15 GB cap, no recompression of originals. Alternatives considered and rejected:
Nextcloud Photos (heavier, weaker mobile UX), PhotoPrism (not phone-first backup),
LibrePhotos (stagnant), Piwigo (gallery, not a backup target).

**It does not fit this box.** Current documented requirements:

| | Immich asks | This box has |
|---|---|---|
| RAM | **minimum 6 GB, recommended 8 GB** | 7.0 GB total, **3.7 GB available** |
| CPU | min 2 cores, rec 4 | 4 ✅ |
| Storage | EXT4/ZFS etc. | ✅ (but spinning HDD) |

At 3.7 GB of real headroom against a 6 GB minimum, with 16 containers already running —
**including the production WhatsApp gateway** — Immich would not be "smooth", it would be
thrashing, and an OOM would take WAHA down with it. Immich can run ML-disabled at 4 GB,
but that discards face recognition and semantic search, which are the reasons to choose it
over a folder of files.

Other real costs on this box specifically:

- **Spinning HDD.** Immich does heavy random reads while generating thumbnails and
  transcoding video, and grows the library **10–20%** on top of originals. Thumbnails on a
  2.5" 5400/7200rpm drive means a visibly sluggish timeline, which is the first thing
  anyone notices.
- **Video uploads from a phone over a 100 MB-capped tunnel** will fail. Users would have
  to be on the tailnet (VPN) to back up video — a known Immich+Tunnel pain point.
- Immich's own docs carry a standing warning: *"Do not use this as the only way to store
  your photos and videos!"* It is pre-1.0 and ships breaking changes. **It is not a
  backup** — you still need an off-box copy.

**To run it properly you need one of:** a box with 12–16 GB RAM and an SSD (a used NUC or
a small mini-PC with 16 GB + NVMe is the cheapest path), or a small VPS for the Immich
server with the library on the homelab over Tailscale. Adding RAM to a desktop on a
*spinning* disk fixes the memory ceiling and leaves the latency ceiling.

## G5. Recommended split

Three distinct jobs, three distinct homes. Do not merge them.

| Job | Where | Why |
|---|---|---|
| **Public delivery** — what a visitor's browser downloads | **ImgBB** (photos, already wired) + **Cloudflare R2** (video) | CDN-grade, no home bandwidth, survives the box dying |
| **Private master library** — full-resolution originals, the archive | **Homelab** (add a disk; do not put it on the request path) | Free, already has 99 GB, private, no egress cost |
| **Personal photo management** — "my Google Photos, but mine" | **Immich**, on better hardware | Needs 6–8 GB RAM + SSD; cannot share the current box |

Sync direction is **one-way and pull-based**: R2/ImgBB → homelab, on a schedule. The
homelab is never asked to serve a visitor. That way you get a free off-box backup of every
asset, and a reboot of the box takes nothing down.

## G6. What this changes in the plan above

Nothing in Phases 1–4. The fix sequence is unchanged and independent of where bytes live:

- **Phase 5** (gallery video + tags) can proceed with ImgBB + R2 as designed.
- The ImgBB key leak (`PosterUploader.tsx:7`, `admin/gallery/page.tsx:7`) should be fixed
  regardless — moving to R2 would have fixed it by construction, but ImgBB stays cheaper
  for photos.
- If R2 is adopted later, the tunnel is **not** the transport to the box. R2 has its own
  public S3 endpoint; the box would reach it directly over the internet.

**Gate before committing to homelab-served media:** measure the box's **upload**
bandwidth. The 8.7 MB/s figure measured earlier is *download into the box* and is
irrelevant to serving visitors — only outbound upload matters, and it is usually a fraction
of download on consumer lines. If it is under ~2 MB/s, homelab video delivery is off the
table regardless of the ToS argument.