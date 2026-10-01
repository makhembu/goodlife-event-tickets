# Dual Media (Poster + Teaser Video) & Story Deck Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable dual-media support (static poster image + autoplaying teaser video) for each event, featuring an interactive Instagram/TikTok-style Story Deck on the public checkout page (3.5s poster countdown → auto-switch to muted looping video with in-card sound toggle and tap navigation), full Admin Create/Edit controls for both media types, and an external media server architecture roadmap.

**Architecture:** 
1. **Data Model**: Extend `events` table with `video_url` (alongside `flyer_url` and `recap_video_url`). Update TypeScript interfaces and allowlisted DB update routines in `lib/supabase-db.ts`.
2. **Client Experience (Story Deck)**: Build an interactive hero media component with dual segment progress bars at the top (`— Poster —` & `— Video —`), 3.5s auto-advance, left/right tap navigation, tap-to-unmute audio toggle, and tap-to-expand cinema lightbox.
3. **Admin Management**: Update `CreateEventModal.tsx` and `app/admin/dashboard/page.tsx` event editor to configure both Poster Image and Teaser Video for each event.
4. **Media Strategy**:
   - **Plan A (Immediate Hybrid)**: Bundle the two user-provided video files (`Bring Your Speaker...mp4` and `SaveClip...mp4`) into `public/videos/` with optimized names for Goodlife and Park & Chill, served instantly via global CDN.
   - **Plan B (Scalable Media Backend)**: Architecture and specification for direct streaming/uploads via Khesh Server (`/home` 113 GB storage) with NGINX reverse proxy and signed upload endpoints.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, Motion (Framer Motion), Neon Postgres, HTML5 Video API.

---

## Plan A: Core Implementation Tasks

### Task 1: Video Asset Staging & Public Route Integration

**Files:**
- Create: `public/videos/goodlife-hype.mp4` (Copied from `"C:\Users\Khesh\Downloads\Video\SaveClip.App_AQMRULPKhR26dvSWktxD0cmmeEJHCfj_UOXMjTJ-pS_CeFShvT_3skinvQ8I5D_aBYaz0Auhmxd7lwMUkkczU1dVYGvpoTyOO2LzR5c.mp4"`)
- Create: `public/videos/park-chill-speakers.mp4` (Copied from `"C:\Users\Khesh\Downloads\Video\Bring Your SpeakerMarara Camp, Landless, Thika9am till late.mp4"`)
- Modify: `lib/event-flyer.ts` (Add `resolveEventVideo` helper)

**Step 1: Write a test for event video resolution**
- File: `tests/event-media.check.ts`
- Assert that flagship events resolve to `/videos/goodlife-hype.mp4` by default when `video_url` is unset.
- Assert that Park & Chill / mini events resolve to `/videos/park-chill-speakers.mp4` by default when `video_url` is unset.
- Assert that custom `video_url` overrides defaults cleanly.

**Step 2: Run test to verify it fails**
- Run: `npx tsx tests/event-media.check.ts`
- Expected: FAIL (`resolveEventVideo` is not defined).

**Step 3: Stage video assets and implement `resolveEventVideo`**
- Copy both files to `public/videos/` with clean web-friendly filenames.
- In `lib/event-flyer.ts`, export `resolveEventVideo(event)` mirroring `resolveEventFlyer`.

**Step 4: Run test to verify it passes**
- Run: `npx tsx tests/event-media.check.ts`
- Expected: PASS.

**Step 5: Commit**
- `git add public/videos/ lib/event-flyer.ts tests/event-media.check.ts`
- `git commit -m "feat(media): stage public teaser videos and add video resolver"`

---

### Task 2: Database Schema & Allowlist Update

**Files:**
- Modify: `lib/supabase-db-types.ts:1-30` (Add `video_url?: string | null;` to `Event` and `EventDetails`)
- Modify: `lib/supabase-db.ts:190-250` (Add `video_url` column check & insert parameter to `createEvent`)
- Modify: `lib/supabase-db.ts:380-410` (Add `'video_url'` to `MUTABLE_EVENT_FIELDS` in `updateEvent`)

**Step 1: Write a test verifying `video_url` mutation and fallback handling**
- Append to `tests/event-media.check.ts`:
  - Verify that `Event` type accepts `video_url`.
  - Verify that `MUTABLE_EVENT_FIELDS` includes `video_url`.
  - Verify fallback behavior when `video_url` is null/empty.

**Step 2: Run test to verify it fails**
- Run: `npx tsx tests/event-media.check.ts`
- Expected: FAIL (property missing or allowlist missing).

**Step 3: Implement database migration helper & update allowlist**
- In `lib/supabase-db.ts`, execute `ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;` inside schema init or ad-hoc query guard.
- Add `video_url` to `MUTABLE_EVENT_FIELDS`.
- Update `createEvent` INSERT query with `video_url`.

**Step 4: Run test and typecheck**
- Run: `npx tsc --noEmit`
- Run: `npx tsx tests/event-media.check.ts`
- Expected: PASS with 0 errors.

**Step 5: Commit**
- `git add lib/supabase-db-types.ts lib/supabase-db.ts tests/event-media.check.ts`
- `git commit -m "feat(db): add video_url to events schema and update mutable fields"`

---

### Task 3: Admin Event Management (Poster + Video Dual Inputs)

**Files:**
- Modify: `components/admin/CreateEventModal.tsx:40-200`
- Modify: `app/admin/dashboard/page.tsx:3640-3720` (Event Editor Tab)

**Step 1: Add Teaser Video input in `CreateEventModal.tsx`**
- Add `videoUrl` state (`useState("")`).
- Add form input under Media & Branding:
  - Label: `TEASER / PROMO VIDEO URL`
  - Input field with placeholder: `e.g. /videos/goodlife-hype.mp4 or https://...`
  - Helper note: `Autoplays as a dynamic hero video in the Story Deck after poster preview.`
- Include `video_url: videoUrl.trim()` in POST payload.

**Step 2: Add Teaser Video input in Event Editor (`app/admin/dashboard/page.tsx`)**
- Locate flyer input section around line 3650.
- Add adjacent dual input for `video_url`.
- Enable live preview thumbnail indicator showing if video URL is valid and playable.

**Step 3: Verify with build & typecheck**
- Run: `npx tsc --noEmit`
- Expected: 0 errors.

**Step 4: Commit**
- `git add components/admin/CreateEventModal.tsx app/admin/dashboard/page.tsx`
- `git commit -m "feat(admin): add dual media poster and teaser video fields to event create/edit"`

---

### Task 4: Interactive Story Deck Component

**Files:**
- Create: `components/StoryDeckHero.tsx`
- Modify: `app/CheckoutClientPage.tsx:1280-1340` (Replace single flyer box with `StoryDeckHero`)
- Modify: `app/CheckoutClientPage.tsx:2190-2230` (Update full-screen expand modal to support dual media)

**Step 1: Write component specification & tests**
- File: `tests/story-deck.check.ts`
- Test that:
  1. Default active index is `0` (Poster).
  2. If video exists, auto-advances to index `1` (Video) after 3.5s timer expires.
  3. Clicking left half navigates to Poster; clicking right half navigates to Video.
  4. Sound toggle controls audio track state (`isMuted: true` by default, toggles to `false`).
  5. Expand button opens full-resolution lightbox with current active media (poster or video with controls).

**Step 2: Run test to verify it fails**
- Run: `npx tsx tests/story-deck.check.ts`
- Expected: FAIL (component not found).

**Step 3: Implement `StoryDeckHero.tsx`**
- Structure:
  ```tsx
  // Segmented Story Bars (Top)
  <div className="absolute top-2 inset-x-2 z-20 flex gap-1.5 h-1">
    <div className="flex-1 bg-white/40 overflow-hidden rounded-full">
      <motion.div ... style={{ width: activeIndex === 0 ? progress : (activeIndex > 0 ? "100%" : "0%") }} />
    </div>
    <div className="flex-1 bg-white/40 overflow-hidden rounded-full">
      <motion.div ... style={{ width: activeIndex === 1 ? progress : "0%" }} />
    </div>
  </div>
  ```
- Media Viewport:
  - If `activeIndex === 0`: High-res static poster (`<Image>`) with priority loading.
  - If `activeIndex === 1`: `<video>` with `autoPlay`, `playsInline`, `loop`, `muted={isMuted}`.
- In-card Floating Controls:
  - Top badge: `[ 🖼️ POSTER ]` / `[ 🎬 TEASER ]` pill indicators.
  - Bottom-right sound button: `[ 🔇 UNMUTE ]` / `[ 🔊 SOUND ON ]` (stops event propagation so click doesn't trigger lightbox).
  - Bottom-left zoom badge: `[ ⛶ FULLSCREEN ]`.
- Left/Right tap zones for instant switching:
  - Left 30% tap: Go to Poster.
  - Right 70% tap: Go to Video (or launch lightbox if already on video).

**Step 4: Integrate into `CheckoutClientPage.tsx`**
- Replace legacy single flyer conditional with `<StoryDeckHero event={eventDetails} onExpand={...} />`.
- Connect lightbox to display selected active media item in full cinema view.

**Step 5: Run tests & verify**
- Run: `npx tsx tests/story-deck.check.ts`
- Run: `npx tsx tests/public-state.check.ts`
- Run: `npx tsc --noEmit`
- Expected: All pass.

**Step 6: Commit**
- `git add components/StoryDeckHero.tsx app/CheckoutClientPage.tsx tests/story-deck.check.ts`
- `git commit -m "feat(hero): implement Story Deck dual-media hero with auto-transition and audio toggle"`

---

### Task 5: Mobile & Performance Guardrails

**Files:**
- Modify: `components/StoryDeckHero.tsx`

**Step 1: Mobile Autoplay & Data-Saver Fallback**
- Implement `IntersectionObserver`: Only autoplay video when hero is in active viewport (pauses when user scrolls down to select ticket tiers, conserving battery and mobile CPU).
- Add error boundary for mobile low-power mode (where browser prevents unprompted video autoplay): smoothly falls back to poster without UI glitches.
- Set `preload="metadata"` on mobile viewports so large video files don't block the initial page paint and critical checkout CSS.

**Step 2: Commit**
- `git add components/StoryDeckHero.tsx`
- `git commit -m "perf(hero): add viewport visibility observer and mobile autoplay fallbacks"`

---

## Plan B: External Media Storage Server Integration Roadmap (Khesh Server /home 113 GB)

This architecture allows festival organizers to upload multi-gigabyte 4K drone footage, after-movies, and promotional clips directly to the self-hosted Khesh server without consuming Vercel serverless function memory or ballooning repository size.

### Architecture Specification

```
                  ┌─────────────────────────────────────────┐
                  │ Goodlife Web App (Vercel)               │
                  │ /admin/dashboard (Event Editor)         │
                  └────────────────────┬────────────────────┘
                                       │ 1. Request Signed Upload
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │ API Route: /api/admin/media/upload-url   │
                  │ Generates HMAC-SHA256 Token & Upload URL │
                  └────────────────────┬────────────────────┘
                                       │ 2. Direct Chunked PUT/POST
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │ Khesh Media Server (/home/storage - 113 GB NVMe)                    │
    │ ├─ NGINX Reverse Proxy (HTTPS, Range Requests, HLS Video Streaming) │
    │ └─ Node/Go Media Receiver Daemon (Port 8443)                        │
    │      └─ Validates Signed Token                                      │
    │      └─ Streams directly to /home/storage/events/[id]/...           │
    │      └─ Generates optimized 1080p web version via ffmpeg            │
    └─────────────────────────────────────────────────────────────────────┘
                                       │ 3. Returns Public Media URL
                                       ▼
            https://media.goodlife.co.ke/events/[id]/teaser.mp4
```

### Plan B Implementation Phases

1. **Phase B1: Server Daemon & Directory Scaffolding**:
   - Directory: `/home/goodlife-media/public/`
   - NGINX configuration with byte-range headers (`Accept-Ranges: bytes`) for smooth video scrubbing on mobile iOS/Android Safari.
   - Cache-Control: `public, max-age=31536000, immutable`.

2. **Phase B2: Direct Upload Endpoint with HMAC Authentication**:
   - Next.js Admin route generates a short-lived signed upload ticket using existing `process.env.ADMIN_PASSWORD` HMAC.
   - Admin browser uploads video directly to Khesh server (`https://media.smwhr.space/upload`) via multipart form with upload progress bar.

3. **Phase B3: Automatic Transcoding (`ffmpeg`)**:
   - Daemon runs lightweight `ffmpeg -i input.mp4 -vf scale=720:-2 -c:v libx264 -crf 23 -preset fast output-web.mp4` to automatically produce 720p/1080p mobile-optimized streams (reducing a 50MB raw phone recording to 4MB).

---

## Verification & Deployment Checkpoints

1. **Automated Unit & Behavioral Tests**:
   - `npx tsx tests/event-media.check.ts` (media resolver & DB typing)
   - `npx tsx tests/story-deck.check.ts` (Story Deck transitions, timer, and controls)
   - `npx tsx tests/public-state.check.ts` (47/47 existing public routing agreement tests)
   - `npx tsx tests/scanner-vendor-auth.check.ts` (14/14 auth tests)
2. **Typecheck & Build**:
   - `npx tsc --noEmit`
   - `npm run build`
3. **Vercel Production Deploy**:
   - `npx vercel --prod --token=$env:VERCEL_TOKEN --yes`
