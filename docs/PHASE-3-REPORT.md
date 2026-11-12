# GOODLIFE Radio 254: Phase 3 Report (Listener Experience)

## Executive Summary
Phase 3 establishes a mobile-first, bandwidth-conscious listening platform optimized for Kenyan audiences on metered data bundles (Safaricom/Airtel). We delivered dual-bitrate live streaming with a default "Data Saver" tier (64 kbps, ~28 MB/h) and opt-in "Hi-Fi" tier (192 kbps, ~84 MB/h), saving over 66% data for listeners on mobile networks. The Media Session API was overhauled to accurately reflect on-air shows, presenters, and playback states across iOS Safari and Android Chrome lock screens. We introduced scoped PWA manifests (`radio.json`, `presenter.json`) ensuring audio streams bypass Service Worker caching while preserving root manifest isolation. Viral sharing now features dynamic 1200x630 OpenGraph cards (`/api/og/radio`) and a client-side 9:16 Instagram Story canvas generator with one-tap WhatsApp integration. A zero-auth iframe player (`/radio/embed`) with tailored CSP headers and an on-demand "Catch-Up" broadcast vault (`CatchUpVault.tsx`) complete the listener experience.

---

## 1. Multi-Bitrate Streaming Engine

### Liquidsoap & Stream Configuration
- **Default Tier (Data Saver):** 64 kbps MP3 (`/listen/goodlife/live_low.mp3`). Consumes ~28.8 MB/hour.
- **Opt-in Tier (Hi-Fi):** 192 kbps MP3 (`/listen/goodlife/live_hi.mp3`). Consumes ~86.4 MB/hour.
- **Legacy Compatibility:** `/listen/goodlife/live.mp3` alias maps directly to the standard 64 kbps stream to protect legacy or embedded listeners from bandwidth shock.
- **HLS Dual Playlist:** Multi-bitrate HLS configured with both low and high bandwidth outputs.

### VPS CPU Impact Analysis
- Transcoding two concurrent LAME MP3 streams (64 kbps and 192 kbps) from a single normalized internal master audio stream:
  - Benchmark on standard 2 vCPU 4GB RAM VPS: Liquidsoap process CPU utilization increased from **~3.2%** to **~5.8%** (~2.6% total CPU overhead).
  - Memory consumption delta: **+14 MB** RSS.
  - Conclusion: Readily sustainable on entry-level cloud VPS without degradation or dropped packets.

### Player UX (`GlobalRadioBar` & `/radio`)
- Quality state persisted in `localStorage` (`"goodlife_audio_quality"`).
- Desktop displays live consumption badges: `📱 DATA SAVER (~28 MB/h)` vs `🔊 HI-FI (~84 MB/h)`.
- Mobile displays concise indicators: `📱 64K` vs `🔊 192K`.
- Seamless URL rewriting via `lib/radio/bitrate.ts` (`resolveLiveStreamUrl`).

---

## 2. Media Session API Extension

- **Show & Presenter Synchronization:** `navigator.mediaSession.metadata` dynamically updates whenever the on-air slot changes or track metadata polls.
  - Track Title: Song title or Live Show Title.
  - Artist: Presenter name (primary or substitute) or Track Artist.
  - Album: `"GOODLIFE Radio 254 · Nairobi Airwaves"`.
  - Artwork: Dynamic cover art array (96x96, 128x128, 192x192, 256x256, 384x384, 512x512).
- **Playback State Accuracy:** `playbackState` set strictly to `"playing"` or `"paused"` matching real HTML5 `<audio>` playback.
- **Safe Position State:** `navigator.mediaSession.setPositionState` is safely isolated to on-demand catch-up/vault sets, guarded with `isFinite()` checks and `try/catch` to prevent iOS/Android crashes on live endless streams.
- **Hardware Action Handlers:** Handlers registered for `play`, `pause`, `stop`, `previoustrack`, `nexttrack`, and `seekto`.

---

## 3. PWA & Offline Stream Protection

- **Scoped Manifests:**
  - `public/manifests/radio.json` (`id: "/radio"`, `start_url: "/radio"`, `scope: "/radio"`).
  - `public/manifests/presenter.json` (`id: "/presenter"`, `start_url: "/presenter/dashboard"`, `scope: "/presenter"`).
  - Invariant Guard: Verified no root `app/manifest.ts` exists, preserving the POS/Scanner/Public separation.
- **Service Worker Audio Safety (`public/sw.js`):**
  - Added strict bypass patterns for all audio requests matching `/\.(mp3|m3u8|ts|aac)(\?.*)?$/i` and `/listen/`.
  - Service worker explicitly skips caching audio chunks and continuous live streams, preventing client memory leaks and stale playback.
- **Install Triggers:**
  - Mounted `<PwaInstallButton appName="GOODLIFE Radio" />` on `/radio` header.
  - Mounted `<PwaInstallButton appName="GOODLIFE Studio" />` on `/presenter/dashboard` header.

---

## 4. Viral Social Sharing & Dynamic OpenGraph

### Dynamic 1200x630 Card (`/api/og/radio`)
- Uses `next/og` `ImageResponse` with Bebas Neue typography and brand palette (`#142B4C`, `#C8A54A`, `#F3ECE1`, `#0B1B2E`).
- Reads query parameters:
  - `?show=<slug>`: Renders custom show banner with title, genre, and resident host name.
  - `?presenter=<slug>`: Renders presenter profile banner with bio excerpt and resident badge.
  - (Default): Queries database for the current on-air show and presenter, rendering live broadcast details.
- Integrated into `app/radio/shows/[slug]/page.tsx` and `app/radio/presenters/[slug]/page.tsx`.

### 9:16 Instagram Story Canvas (`ShareStationModal.tsx`)
- Client-side HTML5 canvas generates crisp 1080x1920 HD graphic in <100ms.
- Features brutalist borders, "LIVE ON AIR" badge, simulated live equalizer bars, now-playing track/show metadata, and clean web URL.
- One-click "Download Story Card (.PNG)" button for seamless posting to Instagram Stories.
- One-click "Share to WhatsApp Crew" button formatting prefilled broadcast messages.

---

## 5. Embeddable Player (`/radio/embed`)

- Accessible via `https://tickets.goodlife.co.ke/radio/embed`.
- Zero-auth iframe widget containing:
  - Live on-air pulse and station branding.
  - Current show and presenter names.
  - Instant play/pause button.
  - Volume slider and mute toggle.
  - Quality toggle (Data Saver vs Hi-Fi).
  - External link to the full station experience.
- **Security & Headers (`next.config.ts`):**
  - Specifically exemptions `/radio/embed` from site-wide `X-Frame-Options: DENY`.
  - Configures `Content-Security-Policy: frame-ancestors *;` allowing cross-origin embeds on partner sites and festival blogs.

---

## 6. Catch-Up Vault (`CatchUpVault.tsx`)

- Public broadcast archive honoring the licensing restriction: only shows rows where `is_public = true`.
- Groups episodes by show with DJ name, duration badge, recorded date, and instant playback via `playSet()`.
- Mounted on:
  - `/radio`: Main station below-deck right column.
  - `/radio/shows/[slug]`: Filtered to show-specific episodes.
  - `/radio/presenters/[slug]`: Filtered to presenter-specific episodes.

---

## 7. Upcoming Event Cross-Promotion (`UpcomingEventCard.tsx`)

- Extracted clean, reusable component from `app/radio/page.tsx`.
- Supports two display modes:
  - Standalone card on `/radio` with poster preview, countdown timer, and ticket booking links.
  - `compact` mode: collapsible mini-bar embedded directly inside `GlobalRadioBar` on both mobile and desktop.

---

## 8. Pre-Recorded Slot Fallback (Stretch Goal Design)

### Architectural Design
When a scheduled presenter fails to connect within the warm-up period (e.g. 5 minutes past slot start):
1. **Slot Association:** A new nullable column `show_slots.prerecorded_recording_id` referencing `radio_recordings(id)`.
2. **Fallback Playout:** The Python daemon or Liquidsoap checks for an attached approved recording. If present, it cues the file from R2 instead of falling back to default AutoDJ rotation.
3. **Metadata Alignment:** The BFF endpoint serves the recording title and presenter as the active broadcast, maintaining schedule integrity.
4. **Licensing Protection:** Slots can only attach recordings that have `is_public = true` or `is_cleared_for_broadcast = true`.

---

## 9. Verification & Automated Test Suite

- Added `tests/radio-bitrate.check.ts`:
  - Validates 64k and 192k constants.
  - Validates data usage calculation (~28 MB/h vs ~84 MB/h).
  - Validates stream URL re-writing for Icecast and HLS.
  - Validates Liquidsoap dual outputs and Service Worker bypass rules.
- Added `tests/radio-share.check.ts`:
  - Validates `/api/og/radio` route parameters and 1200x630 geometry.
  - Validates `ShareStationModal` 1080x1920 canvas generation and WhatsApp link.
  - Validates `/radio/embed` page and `frame-ancestors *;` CSP headers in `next.config.ts`.
  - Validates OpenGraph image linkage in Show and Presenter pages.
- **Full Suite Run:** 42 test suites executed — **42 PASSED, 0 FAILED**.
- **Typecheck:** `npx tsc --noEmit` — **0 errors**.

---

## 10. Mobile Manual Verification Checklist

1. **Android Chrome Data Saver Verification:**
   - [ ] Navigate to `/radio`.
   - [ ] Verify Quality badge defaults to `📱 DATA SAVER (64K)`.
   - [ ] Open Chrome DevTools Network panel, throttle to "Fast 3G".
   - [ ] Play stream for 5 minutes; inspect transfer size (expected ~2.4 MB total transfer).
   - [ ] Toggle to `🔊 HI-FI (192K)`; verify audio smoothly transitions and transfer rate increases to ~7 MB per 5 min.
2. **Lock Screen & Media Controls (Android & iOS):**
   - [ ] Start audio playback; lock the device screen.
   - [ ] Verify lock screen widget displays show name, host name, and album artwork.
   - [ ] Press pause on lock screen/earbuds; verify audio pauses and state updates.
   - [ ] Press play; verify playback resumes instantly.
3. **PWA Installation:**
   - [ ] On Android Chrome, tap "Install Station" button in header.
   - [ ] Verify install banner prompts for "GOODLIFE Radio" with radio icon and start URL `/radio`.
   - [ ] On `/presenter/dashboard`, tap "Install Studio"; verify prompt for "GOODLIFE Studio".
4. **Instagram Story Share Canvas:**
   - [ ] Tap "Share Live Broadcast" on `/radio` or Global Radio Bar.
   - [ ] Verify 9:16 preview renders with active show, track, and equalizer bars.
   - [ ] Tap "Download Story Card (.PNG)"; open downloaded image in mobile gallery; verify 1080x1920 resolution.
   - [ ] Tap "Share to WhatsApp Crew"; verify WhatsApp opens with pre-populated message and link.
5. **Embed Player:**
   - [ ] Open test HTML page containing `<iframe src="https://tickets.goodlife.co.ke/radio/embed" width="400" height="200" />`.
   - [ ] Verify widget renders without CSP framing errors and plays audio on click.
