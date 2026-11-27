# GOODLIFE Radio 254 (Web & PWA) Fix Implementation Plan

> **For Claude / Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate critical visual bugs (invisible drawer text, cream PWA gutter bleed), align PWA manifest & Service Worker precache (removing the decommissioned playlists shortcut per commit `da658c2`), rebalance the asymmetric desktop web grid, and harden mobile touch targets and accessibility on GOODLIFE Radio 254.

**Architecture:** Next.js 15 App Router with scoped route layout styling (`app/radio/layout.tsx`), fail-safe CSS inheritance scoping in `RadioPwaTimetableDrawer`, Service Worker precache updates in `public/sw.js`, manifest shortcut synchronization in `public/manifests/radio.json`, and responsive two-column grid redistribution in `app/radio/page.tsx`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, Lucide Icons, Service Worker API, Web App Manifest.

---

### Task 1: Fix Invisible White-on-White Text in Timetable Drawer (P0)

**Files:**
- Modify: `components/radio/RadioPwaTimetableDrawer.tsx:112-147`

**Problem:**
The modal drawer container uses light cream backgrounds (`bg-[#F3ECE1]` and `bg-[#FBF9F6]`), but inherits `text-[#FBF9F6]` (near-white) from `RadioPwaShell`. Text without explicit colors (`STATION TIMETABLE`, `CLOSE`, `ALL`, and show names) renders invisible white-on-white.

**Step 1: Apply explicit text color to drawer container**
In `components/radio/RadioPwaTimetableDrawer.tsx` line 113:
```tsx
// Change:
<div
  className="w-full md:max-w-2xl bg-[#F3ECE1] border-t-4 md:border-4 border-[#16181D] max-h-[82dvh] flex flex-col md:shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
  onClick={(e) => e.stopPropagation()}
>
// To:
<div
  className="w-full md:max-w-2xl bg-[#F3ECE1] text-[#16181D] border-t-4 md:border-4 border-[#16181D] max-h-[82dvh] flex flex-col md:shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
  onClick={(e) => e.stopPropagation()}
>
```

**Step 2: Ensure header and button text colors are explicitly scoped**
In `components/radio/RadioPwaTimetableDrawer.tsx` line 123:
```tsx
<h3 className="font-display text-2xl leading-none uppercase tracking-wide mt-0.5 text-[#16181D]">
  STATION TIMETABLE
</h3>
```
Verify close and timezone button labels have `text-[#16181D]`.

---

### Task 2: Eliminate Cream Outer Gutter Bleed in PWA Mode & Sync Theme Color (P0)

**Files:**
- Modify: `app/radio/layout.tsx:1-32`
- Modify: `components/radio/RadioPwaShell.tsx:123`

**Problem:**
Root `app/layout.tsx` applies `bg-brand-bg` (`#FAF6EE` cream) to `<body>` and `themeColor: "#142B4C"`. On desktop monitors > 1280px or mobile sub-pixel margins, bright cream gutters flank the dark `#0D0F12` PWA console.

**Step 1: Set route-level viewport and wrapper in `app/radio/layout.tsx`**
Export a route-level `viewport` with `#16181D` and wrap children:
```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#16181D",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  manifest: "/manifests/radio.json",
  title: {
    absolute: "GOODLIFE Radio · 24/7 Live Festival Airwaves & DJ Vault",
  },
  // ... existing metadata ...
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0D0F12] text-[#FBF9F6] min-h-screen w-full">
      {children}
    </div>
  );
}
```

**Step 2: Ensure `RadioPwaShell` outer container fills the viewport cleanly**
In `components/radio/RadioPwaShell.tsx` line 123:
```tsx
<div className="h-[100dvh] w-full max-w-md md:max-w-5xl lg:max-w-7xl mx-auto bg-[#0D0F12] text-[#FBF9F6] flex flex-col overflow-hidden select-none md:border-x md:border-white/[0.08] shadow-[0_0_80px_rgba(0,0,0,0.85)]">
```
Verify parent wrapping prevents background color leaks.

---

### Task 3: Pre-cache Radio Assets & Icons in Service Worker (P1)

**Files:**
- Modify: `public/sw.js:8-22`
- Modify: `tests/manifests.check.ts:4-8`

**Problem:**
`PRECACHE_ASSETS` in `public/sw.js` caches scanner, vendor, and admin icons, but omits radio icons and manifest.

**Step 1: Add radio manifest and icons to `PRECACHE_ASSETS`**
In `public/sw.js`:
```javascript
const PRECACHE_ASSETS = [
  '/offline.html',
  '/site.webmanifest',
  '/manifests/radio.json',
  '/icons/radio-192.png',
  '/icons/radio-512.png',
  '/icons/radio-maskable-192.png',
  '/icons/radio-maskable-512.png',
  '/icons/scanner-192.png',
  '/icons/scanner-512.png',
  '/icons/vendor-192.png',
  '/icons/vendor-512.png',
  '/icons/admin-192.png',
  '/icons/admin-512.png',
  '/icons/icon-512.png',
  '/icon.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/BebasNeue.ttf'
];
```

**Step 2: Update `tests/manifests.check.ts` to validate `public/manifests/radio.json`**
Add the radio manifest object:
```ts
{ file: "public/manifests/radio.json", id: "/radio", scope: "/radio", start_url: "/radio?source=pwa", name: "GOODLIFE Radio" },
```

---

### Task 4: Remove Stale "Playlists" Shortcut from PWA Manifest (P1)

**Files:**
- Modify: `public/manifests/radio.json:38-59`

**Context:**
The Playlists view was intentionally decommissioned from the radio product in commit `da658c2` (`app/radio/page.tsx` now toggles only between `LIVE AIRWAVES` and `RECORDED VAULT`). The manifest shortcut `?source=pwa&tab=playlists` is an obsolete leftover.

**Step 1: Clean up `public/manifests/radio.json` shortcuts**
Remove the dead `Playlists` shortcut entry so `shortcuts` precisely reflects the 3 active PWA tabs:
```json
  "shortcuts": [
    {
      "name": "Listen Live",
      "short_name": "Live",
      "url": "/radio?source=pwa&tab=live"
    },
    {
      "name": "DJ Vault",
      "short_name": "Vault",
      "url": "/radio?source=pwa&tab=vault"
    },
    {
      "name": "Booth Chat",
      "short_name": "Chat",
      "url": "/radio?source=pwa&tab=chat"
    }
  ]
```

---

### Task 5: Rebalance Desktop Web Grid in `/radio` (P1)

**Files:**
- Modify: `app/radio/page.tsx:738-901`

**Problem:**
Left column (`lg:col-span-7`) ends at ~450px while right column (`lg:col-span-5`) stacks 6 widgets down 2,500px, creating ~2,000px of dead space on the left.

**Step 1: Redistribute widgets across columns on desktop**
- **Left Column (`lg:col-span-7`):**
  1. Crate Mode / Up Next
  2. Recently Played
  3. `ShoutoutWall` (moved here so live listener activity sits below recent track spins)
  4. `LiveContestWidget`
- **Right Column (`lg:col-span-5`):**
  1. `UpcomingEventCard`
  2. `LivePollWidget`
  3. `shareCardNode` (Spread the Airwave)
  4. `CatchUpVault` (Recorded Shows)

**Step 2: Verify mobile view switcher behavior**
Ensure `mobileTab === "on_air"` vs `mobileTab === "booth"` displays clean single-column stacks without duplication or broken order.

---

### Task 6: Harden `TipModal.tsx` Accessibility & Contrast (P2)

**Files:**
- Modify: `components/radio/TipModal.tsx:110-195`

**Problem:**
Missing `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` listener, close button overlapping title on 390px, and low-contrast dark placeholders.

**Step 1: Add ARIA modal attributes and Escape key dismissal**
In `components/radio/TipModal.tsx`:
```tsx
useEffect(() => {
  if (!isOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [isOpen, onClose]);
```
Add `role="dialog" aria-modal="true" aria-labelledby="tip-modal-title"` to the dialog card.

**Step 2: Add padding to title and `aria-label` to close button**
Ensure the header has `pr-10` to prevent close button collision on 390px viewports, and add `aria-label="Close dialog"` to the `<button>`.

**Step 3: Fix input placeholder contrast**
Add `placeholder:text-white/45 text-white` to inputs so text is legible against `#0F2038`.

---

### Task 7: Enforce Minimum 44px Touch Targets on Mobile (P2)

**Files:**
- Modify: `app/radio/page.tsx:287-330, 720-733`

**Step 1: Update Return to Festival Gate link**
Add `min-h-[44px] min-w-[44px]` to `ArrowLeft` Link ([line 289](file:///c:/Users/Khesh/Downloads/goodlife-event-tickets/app/radio/page.tsx#L289)).

**Step 2: Update View Switcher buttons**
Add `min-h-[44px] flex items-center justify-center` to `LIVE AIRWAVES` and `RECORDED VAULT` buttons ([lines 309-330](file:///c:/Users/Khesh/Downloads/goodlife-event-tickets/app/radio/page.tsx#L309-L330)).

**Step 3: Update mobile segmented controls**
Add `min-h-[44px]` to `ON AIR` and `BOOTH LINE` mobile toggle buttons ([lines 720-733](file:///c:/Users/Khesh/Downloads/goodlife-event-tickets/app/radio/page.tsx#L720-L733)).

---

### Task 8: Verification & Automated Validation

**Steps:**
1. Run manifest verification:
   `.\node_modules\.bin\tsx.cmd tests/manifests.check.ts`
2. Run radio tests:
   `.\node_modules\.bin\tsx.cmd tests/radio.check.ts`
   `.\node_modules\.bin\tsx.cmd tests/radio-playback.check.ts`
   `.\node_modules\.bin\tsx.cmd tests/radio-share.check.ts`
   `.\node_modules\.bin\tsx.cmd tests/radio-shoutouts.check.ts`
   `.\node_modules\.bin\tsx.cmd tests/radio-tips.check.ts`
3. Run Next.js production build / typecheck:
   `npm run build`
