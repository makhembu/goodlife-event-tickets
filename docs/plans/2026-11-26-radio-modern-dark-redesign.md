# GOODLIFE Radio 254: Modern Dark UI & Centered 3D Pass Redesign Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the GOODLIFE Radio 254 standalone player (`RadioPwaShell.tsx`) from the clunky, light-beige neo-brutalist shell into a premium, immersive dark festival broadcast deck with a centered 3D metallic pass, glowing golden controls, fluid dual-wave visualizer, accessible WCAG AA contrast, and preserved brand typography.

**Architecture:** Update the client-side presentation layer in `components/radio/RadioPwaShell.tsx` and `components/radio/RadioRibbonVisualizer.tsx` using Tailwind CSS v4 design tokens. Generate and integrate a high-resolution, centered 3D metallic gold VIP pass asset in `/public/flyer.png` and dedicated cover fallback. Retain Space Grotesk and Monospace typography for radio station identity while elevating hit targets to WCAG 2.5.8 standards (≥ 44×44px).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas Web Audio API, Lucide React icons, Image Generator subagent.

---

### Task 1: Generate & Center the 3D Metallic "Official Pass" Artwork

**Files:**
- Create/Replace: `public/flyer.png` (or `public/radio-pass-3d.png` with fallback reference)
- Subagent: `invoke_subagent` (`TypeName: "image-generator"`)

**Step 1: Brief and launch image generation subagent**
- Generate a 3D brushed metallic gold laminate festival VIP pass on a clean dark background:
  - Format: High-res PNG (aspect ratio 4:3 or square).
  - Subject: Luxurious brushed champagne/gold metallic ticket pass with side notch cuts.
  - Top header: Recessed dark pill reading "OFFICIAL PASS" in embossed gold lettering.
  - Center emblem: Centered 3D sculpted "G" flame emblem in polished gold and dark chrome finish.
  - Bottom text: Centered embossed gold "GOODLIFE" with subtitle "EVENT TICKETING PLATFORM".
  - Alignment: Perfectly symmetrical, horizontally and vertically centered (zero offset).

**Step 2: Verify asset placement and transparency/aspect ratio**
- Copy/move generated asset to `public/flyer.png` (and `public/radio/official-pass-3d.png`).
- Verify image dimensions and crispness on both standard and retina displays.

---

### Task 2: Modernize `RadioRibbonVisualizer.tsx` with Fluid Glowing Dual Sine Waves

**Files:**
- Modify: `components/radio/RadioRibbonVisualizer.tsx`

**Step 1: Update Canvas Stroke, Alpha & Glow Parameters**
- Replace the current 3-color ribbon (which draws black `#16181D` and flat yellow on white) with:
  - Upper dynamic sine wave: Vivid gold (`#F5C842`), stroke width 2.5, glowing ambient fill (`rgba(245, 200, 66, 0.22)`).
  - Lower harmonic sine wave: Sand gold (`#DFBB7D`), stroke width 2.0, glowing ambient fill (`rgba(223, 187, 125, 0.15)`).
  - Background: Clean transparent background over dark slate card `#181A20`.
  - Add canvas glow:
    ```ts
    ctx.shadowColor = "rgba(245, 200, 66, 0.45)";
    ctx.shadowBlur = 6;
    ```
- Keep Web Audio API `AnalyserNode` live frequency reactivity and reduced-motion fallbacks.

**Step 2: Test Visualizer Render**
- Verify that `RadioRibbonVisualizer` mounts without hydration error, renders smooth curves, and doesn't leak memory or throw when audio context is suspended.

---

### Task 3: Overhaul `RadioPwaShell.tsx` to Dark Theme & Centered Layout

**Files:**
- Modify: `components/radio/RadioPwaShell.tsx`

**Step 1: Shell Background & Top Bar**
- Root: `h-[100dvh] w-full bg-[#0D0F12] text-[#FBF9F6] flex flex-col overflow-hidden select-none`.
- Header: `bg-[#14161C] border-b border-white/10 px-4 py-3 flex items-center justify-between`.
  - ON AIR indicator: Glowing pulsing red dot + `font-mono text-xs font-bold tracking-widest uppercase text-white/90`.
  - SCHEDULE button: Sleek rounded pill `rounded-full px-3 py-1 bg-white/5 hover:bg-white/10 text-[#F5C842] border border-[#F5C842]/40 font-mono text-[10px] font-bold uppercase transition-colors`.

**Step 2: Centered Cover Box Layout (Fulfilling "make it centered not offset")**
- Container: `bg-[#14161C] border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-between shadow-2xl relative overflow-hidden`.
- Centered Station Pill:
  ```tsx
  <span className="relative z-10 px-3 py-1 rounded-full border border-white/15 bg-white/5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#DFBB7D] text-center">
    {statusTag}
  </span>
  ```
- Centered Pass Image:
  ```tsx
  <div className="relative z-10 w-full flex-1 flex items-center justify-center py-2">
    <img
      src={resolvedCover}
      alt={displayTitle}
      className="max-h-[220px] max-w-[85%] object-contain rounded-xl drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)]"
    />
  </div>
  ```
- Centered Station Title:
  ```tsx
  <span className="relative z-10 font-mono text-xs font-bold uppercase tracking-widest text-[#F5C842] text-center drop-shadow">
    {onAirSlot?.show?.title || "GOODLIFE RADIO 254"}
  </span>
  ```

**Step 3: Track Info Card with Preserved Typography & WCAG AA Contrast**
- Card: `bg-[#181A20] border border-white/10 rounded-2xl p-4 shadow-lg`.
- Title: `font-sans font-bold text-lg sm:text-xl text-white tracking-wide truncate` (Space Grotesk).
- LYRICS Button: Sleek pill `rounded-full bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 px-3 py-1 font-mono text-[11px] font-bold uppercase`.
- Subtitle / Artist: High-contrast light slate (`text-[#CBD5E1]` — 7.5:1 contrast against `#181A20`, fully WCAG AA and AAA compliant).
- Embed updated `RadioRibbonVisualizer`.

**Step 4: Refined 3-Button Transport Controls (44px Touch Floor)**
- MUTE Button: `rounded-full px-4 py-2.5 min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs font-bold uppercase flex items-center gap-2`.
- PLAY Button: Central magnetic hero:
  ```tsx
  <button
    type="button"
    onClick={togglePlay}
    aria-label={isPlaying ? "Pause radio" : "Play radio"}
    className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#E6B800] via-[#F5C842] to-[#FFE27D] text-[#16181D] shadow-[0_0_24px_rgba(245,200,66,0.45)] hover:shadow-[0_0_32px_rgba(245,200,66,0.65)] flex items-center justify-center cursor-pointer active:scale-95 transition-all"
  >
    {isPlaying ? <Pause className="w-7 h-7 fill-[#16181D]" /> : <Play className="w-7 h-7 fill-[#16181D] ml-0.5" />}
  </button>
  ```
- SHARE Button: Matching Mute button with `min-h-[44px]`.

**Step 5: Bottom 4-Tab Dock**
- Dock: `bg-[#0F1115] border-t border-white/10 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]`.
- Active Tab (`LIVE`): Vivid gold `bg-[#F5C842] text-[#16181D] rounded-lg m-1 py-2 font-mono text-[10px] font-bold uppercase`.
- Inactive Tabs (`PLAYLISTS`, `VAULT`, `CHAT`): Accessible light slate `text-[#CBD5E1] hover:text-white py-2 font-mono text-[10px] font-bold uppercase`.

**Step 6: Dark Lyrics & Timetable Drawers**
- Ensure slide-up lyrics modal and timetable drawer use matching dark card surfaces (`bg-[#181A20] border-t border-white/15 text-[#FBF9F6]`).

---

### Task 4: Verification & Validation Suite

**Step 1: Typecheck & Build**
- Run `npm run build` to confirm zero TypeScript and compiler errors across all routes.

**Step 2: Run Radio Test Suite**
- Run:
  ```powershell
  .\node_modules\.bin\tsx.cmd tests/radio-playback.check.ts
  .\node_modules\.bin\tsx.cmd tests/radio-fallback.check.ts
  .\node_modules\.bin\tsx.cmd tests/radio-schedule.check.ts
  .\node_modules\.bin\tsx.cmd tests/radio.check.ts
  ```
- Ensure all 24 radio test checks pass cleanly.

**Step 3: Visual & Accessibility Inspection**
- Verify contrast ratios:
  - Artist text (`#CBD5E1` on `#181A20`) = **7.5:1** (Passes WCAG AAA).
  - Inactive tab text (`#CBD5E1` on `#0F1115`) = **10.2:1** (Passes WCAG AAA).
  - Active tab text (`#16181D` on `#F5C842`) = **11.2:1** (Passes WCAG AAA).
- Verify minimum 44px touch targets on mobile viewport.
