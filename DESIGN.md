---
name: GOODLIFE Event Tickets + GOODLIFE Radio 254
description: Verified design system for the public ticketing flow, the radio player/console, and the operational gate/POS surfaces
colors:
  brand-ink: "#16181D"
  brand-ink-soft: "#2A2C33"
  brand-cream: "#FBF9F6"
  brand-sand: "#F3ECE1"
  brand-gold: "#DFBB7D"
  brand-gold-ink: "#7A5A1F"
  brand-vivid: "#F5C842"
  brand-danger: "#E84855"
  brand-danger-bg: "#FADBD8"
  brand-success: "#15803D"
  brand-success-bg: "#DCFCE7"
  brand-warning: "#92400E"
  brand-warning-bg: "#FEF3C7"
typography:
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.08em"
  heading:
    fontFamily: "Bebas Neue, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 6vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "0.04em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand-vivid}"
    textColor: "{colors.brand-ink}"
    border: "4px solid {colors.brand-ink}"
    rounded: "{rounded.none}"
    padding: "16px 24px"
    shadow: "4px 4px 0px 0px rgba(22, 24, 29, 0.24)"
  button-inverse:
    backgroundColor: "{colors.brand-ink}"
    textColor: "{colors.brand-gold}"
    border: "4px solid {colors.brand-ink}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  card-default:
    backgroundColor: "{colors.brand-cream}"
    border: "4px solid {colors.brand-ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  input-text:
    backgroundColor: "{colors.brand-cream}"
    textColor: "{colors.brand-ink}"
    border: "4px solid {colors.brand-ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
---

# Design System: GOODLIFE

**Verified:** 2026-11-16 against `app/globals.css`, `app/CheckoutClientPage.tsx`, `components/StoryDeckHero.tsx`, `app/radio/page.tsx`, `components/radio/*`, and the admin/vendor/scanner surfaces.
**Canonical source:** `app/globals.css` `@theme`. This document explains it; it does not override it.
**Supersedes:** the previous spec's navy `#0F4C81`, `system-ui` type stack, 8px label floor, and rounded cards. None of those match the working tree.

> The app is two products on one design language: **ticketing** (public checkout, gate scanning, vendor POS, admin) and **GOODLIFE Radio 254** (player, schedule, presenter console). Ticketing is the stricter "printed poster / gate terminal" surface. Radio is a softer "broadcast deck" variant inside the same cream-and-ink frame.

---

## 1. Creative direction

**North star: "The Festival Gate + The Broadcast Deck."**

Physical, printed, high-contrast. Cream paper, charcoal ink, sand-gold accents, hard offset shadows, thick rules, uppercase display type, mono metadata. It should feel like a screen-printed festival pass and a broadcast control surface — not a generic SaaS dashboard, not a nightclub, not a glassmorphism template.

**What is intentionally absent:** soft gradient hero blobs, rounded-everything cards, pastel SaaS charts, thin grey type, floating white cards on a white page, glass panels as a default surface.

**What is intentionally present:** poster-led storytelling, big display headlines, numbered checkout steps, a visible total, a single decisive CTA, dense operational tables, and a large circular play control on radio.

---

## 2. Color

### Core tokens (`app/globals.css`)

| Token | Hex | Role |
|---|---|---|
| `--color-brand-black` / `--color-brand-navy` | `#16181D` | Ink: text, borders, dark panels, primary inverse surfaces |
| `--color-brand-navy-light` | `#2A2C33` | Secondary ink, hover, dark-panel inner edges |
| `--color-brand-off-white` | `#FBF9F6` | Cream: cards, inputs, text on dark |
| `--color-brand-bg` | `#F3ECE1` | Sand: page canvas |
| `--color-brand-accent` | `#DFBB7D` | Sand-gold: surfaces, borders, decoration |
| `--color-brand-accent-vivid` | `#F5C842` | Vivid gold: **primary CTA surface only** |
| `--color-brand-danger` | `#E84855` | Reject / destructive |
| `--color-brand-danger-bg` | `#FADBD8` | Danger panel background (2.95:1 with danger — darken copy) |
| `--color-brand-success` | `#15803D` | Admit / success |
| `--color-brand-success-bg` | `#DCFCE7` | Success panel background |
| `--color-brand-warning` | `#92400E` | Caution |
| `--color-brand-warning-bg` | `#FEF3C7` | Warning panel background |
| `brand-gold-ink` *(proposed)* | `#7A5A1F` | Accessible gold text on cream/sand; not yet in `globals.css` |

**Contrast rules (measured, not estimated):**

- Ink `#16181D` on cream `#FBF9F6` = **16.9:1**. Ink on sand `#F3ECE1` = **15.1:1**. This is the default text pairing.
- Gold `#DFBB7D` on ink `#16181D` = **9.8:1**. Gold text is a **dark-surface** color.
- Gold `#DFBB7D` on cream = **1.73:1**; on sand = **1.55:1**. **Never use `text-brand-accent` on a light surface.** Use ink, or add the proposed `brand-gold-ink` (`#7A5A1F` = 6.0:1 on cream, 5.4:1 on sand) if a gold text accent is required.
- Vivid `#F5C842` on ink = **11.2:1**; on cream = **1.51:1**. Vivid is a **button background with ink text**, never text on light.
- The danger token pair `#E84855` on `#FADBD8` is **2.95:1**. Use `text-red-700`/`text-red-800` for danger copy, or darken the pair.
- `text-brand-navy/60` on sand = **4.40:1** (just below AA 4.5). At 9px it is both too small and too light. Use `/70` or darker for any caption.

**No new hex values.** The legacy `#142B4C`, `#C8A54A`, `#0F2038`, `#F3ECE1`, `#FF6B35`, and `#0F4C81` still appear in older radio/PWA files. They are debt, not tokens: migrate to the utility (`bg-brand-navy`, `text-brand-accent`, `bg-brand-bg`, `text-brand-danger`).

---

## 3. Typography

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Display / headings | **Bebas Neue** (`font-display`) | `clamp(2rem, 6vw, 4.5rem)` | 400 (single weight) | Uppercase, tight leading, wide tracking. Event titles, section titles, CTAs. |
| Body | **Space Grotesk** (`font-sans`) | **14px** (`text-body`) | 400–500 | Descriptions, paragraphs, form values. |
| Label / metadata | **Monospace** (`font-mono`) | **11px** (`text-caption`) | 700–900 | Uppercase, `tracking-widest`; IDs, phone numbers, step labels, status chips. |
| Footnote | Space Grotesk / mono | 12px (`text-footnote`) | 500–700 | Secondary explanations. |
| Micro-label floor | — | **11px** | — | No 8px, 9px, or 10px text. The old 8px "corner badge" allowance is revoked. |

**Rules:**

- `text-[Npx]` is legacy. Use `text-caption`, `text-footnote`, `text-body`, or the display scale. `11px` is the floor for all visible text, including admin/vendor tables and scanner chips.
- Bebas is a display face; do not set paragraphs in it. Space Grotesk is the body face; do not set every label in it — labels are mono.
- Uppercase is for display, labels, badges, and CTAs. Body sentences stay sentence case.
- Numeric data (prices, totals, tab balances, timestamps) uses `font-mono` and tabular alignment where available.

**Current debt:** 1,512 literal font sizes in `app/` + `components/` (17 at 8px, 213 at 9px, 721 at 10px, 561 at 11px) versus only 22 uses of `text-caption`/`text-footnote`/`text-body`. The token floor exists; adoption does not. New work must use the tokens, and operational files should be migrated first (see §8).

---

## 4. Shape, elevation, spacing

- **Radius:** default **0** on ticketing, gate, POS, and admin. `rounded-full` is allowed for status dots, avatars, and the radio play button. `rounded-lg` / `rounded-xl` / `rounded-2xl` are a **radio/modal legacy variant**, not the default; do not add them to a new brutalist card. The radio product currently uses 45 rounded utilities on its main page — treat that as a documented sub-brand decision or normalize it, but do not mix rounded cards with hard-shadow ticket cards in the same view.
- **Borders:** `border-4 border-brand-navy` for primary surfaces (checkout cards, gate panels, primary CTAs). `border-2` for dense admin/vendor rows and inner cards. `border`/`border-b` for dividers. No 1px slate borders on primary ticketing surfaces.
- **Shadows:** use `shadow-(--shadow-brut-*)` from `app/globals.css`. Offsets: 1px (2xs), 2px (xs), 4px (sm/md), 6px (lg), 8px (xl). Hard offset, zero blur. `shadow-2xl`, `shadow-lg`, and soft blurred shadows are not part of the system; they appear in older radio/PWA files.
- **Glass:** `backdrop-blur` is for overlays over media only (lightbox, modal scrim). It is not a card treatment. There are 100 uses; most are overlays, but audit any that sit on a normal page surface.
- **Spacing:** 4px baseline; 8/16/24/32 for component rhythm. Page gutters: 16px mobile, 24–40px desktop.
- **Focus:** global `:focus-visible` is a 3px `brand-navy-light` outline with 3px offset. Do not remove it; if a component sets `outline-hidden`, it must add an equally visible ring.
- **Touch:** global min-height is **32px**. That is a floor, not a target. Primary mobile controls (play, tabs, mute/share, tip presets, quantity steppers, footer legal links) should be **44×44px**; compact secondary controls may be 32–40px. Footer/legal links currently render at 12–15px high and fail WCAG 2.5.8's 24px minimum.

---

## 5. Components

### Primary CTA
```tsx
className="border-4 border-brand-navy bg-brand-accent-vivid text-brand-navy
  font-display text-lg uppercase tracking-widest
  shadow-(--shadow-brut-sm) active:translate-x-[4px] active:translate-y-[4px]
  active:shadow-none"
```
Full width on mobile; content width on desktop. One primary CTA per view. The inverse CTA is `bg-brand-navy text-brand-accent` with the same border/shadow. Hover may invert, but the resting state must be decisive.

### Secondary / outline
`border-2 border-brand-navy bg-brand-off-white text-brand-navy` with a 2–4px hard shadow. Hover fills with `bg-brand-accent` or inverts to ink. No ghost buttons with no border.

### Inputs
- Checkout/gate: `border-4 border-brand-navy bg-brand-off-white` (or `bg-brand-bg`), square, `font-mono`, **visible label above the field**.
- Dense admin/vendor: `border-2 border-brand-navy`, 11–14px mono, 32–36px height.
- Placeholder is secondary; it must never be the only label. Global placeholder opacity is `0.55` (≈3.8–3.9:1 on cream/sand) — below AA. If a field relies on placeholder text, raise it to `0.70` (≈6.1–6.6:1) or add a persistent label.
- Error: inline message under the field, `text-red-700`, `role="alert"`; not `alert()`.
- Focus: keep the global 3px outline; do not replace it with a subtle background change alone.

### Cards
`border-4 border-brand-navy` + cream/white surface + `shadow-(--shadow-brut-md)` + square corners. Inner cards use `border-2` and a 2px shadow. A card with a colored left stripe (`border-l-4`) is not part of the ticketing system; it reads as a dashboard template.

### Tags / status
Mono, uppercase, **11px minimum**, `tracking-wider`. Live/admit = success pair; reject/error = danger pair; scheduled/caution = warning pair; neutral = ink on cream or cream on ink. Do not use raw `bg-purple-700`, `bg-yellow-300`, `text-green-700`, or `from-indigo-*` for status; map them to tokens. The radio page's live/scheduled/on-demand chips currently use raw red/amber/purple and need a token pass.

### Story deck / media hero
One media switcher (POSTER / TEASER), 5s poster countdown, tap the visible media to expand, no invisible tap zones. Controls must be ≥44px where they are primary; the current 26×32px story arrows pass WCAG 2.5.8 (24px) but are below the 44px target. Lightboxes need `role="dialog"`, `aria-modal`, a labelled close button, Escape, and focus return.

### Radio deck
The player panel is a dark `brand-navy` deck on the cream page: station name, live status, a large circular `bg-brand-accent` play button (80–96px), a waveform/progress strip, and a compact secondary row (mute, share, tip). Radio is allowed to feel softer, but the palette must be the same tokens, the status chips must be tokenized, and the update path must never reload the page while audio is playing.

### Operational surfaces (gate, POS, admin, budget)
Dense is correct; small is not. 11px is the floor. Tables need a sticky header, tabular numbers, a visible selected row, and 44px row actions on touch. The gate PIN and primary scan actions get the largest targets. Customer-facing receipts and printed QR sheets use the same ink/cream/gold tokens, not the old navy/orange.

---

## 6. Surface rules

**Public ticketing (`/`, `/?event=`, `/events`, `/gallery`, `/tickets/*`)**
- Cream canvas, poster-led hero, thick rules, numbered checkout steps.
- The total is always visible before the CTA. Empty ladder means **no CTA** — never "KES 0 (FREE)" or "RSVP FREE ENTRY PASS" unless a real zero-price tier exists.
- Dates come from one formatter (`resolveNextOccurrence` / `formatOccurrence` for recurring events, `Africa/Nairobi`), never from raw `event_date` + browser-local `getHours()`.
- One `h1` per page; the story hero's promo heading is not an `h3` before the `h1`.

**Radio (`/radio`, `/radio/*`)**
- Cream frame, dark broadcast deck, gold circular play, mono metadata.
- Sections: Live station, Playlists, Vault, Timetable, Shoutouts, Catch-up.
- The service worker must not force a reload while audio is playing. Offer "Update" and defer until the listener pauses or leaves.
- Forms (shoutout, tip, apply) use associated `<label for>`; placeholders are examples, not labels.

**Auth/ops (`/login`, `/scanner`, `/vendor/*`, `/admin/*`, `/presenter/*`)**
- High contrast, large primary controls, no placeholder-only fields.
- Every page has a `<main>` landmark and one `h1`; auth pages are no exception.
- The admin login is still a page, not a modal; the scanner login is a gate setup screen, so the PIN field and "Start scanning" are the largest elements.

---

## 7. Do / Don't

**Do**
- Use `app/globals.css` tokens and the `text-caption` / `text-footnote` / `text-body` scale.
- Use 4px ink borders and hard offset shadows on ticketing and gate panels.
- Put gold text on ink, never on cream/sand.
- Keep primary touch targets ≥44px; keep footer/legal links ≥24px high.
- Give every page `<main>`, one `h1`, associated labels, and a visible focus ring.
- Show the real next session and the real price before the CTA.

**Don't**
- Don't introduce `#142B4C`, `#C8A54A`, `#0F2038`, `#FF6B35`, or `#0F4C81`.
- Don't use `text-[8px]`, `text-[9px]`, or `text-[10px]` for operational text.
- Don't put `rounded-xl` + `shadow-2xl` on a brutalist ticket card.
- Don't use `backdrop-blur` as a default card surface.
- Don't use `border-l-4` accent stripes, `animate-bounce`, purple/indigo status chips, or soft blurred shadows as decoration.
- Don't auto-reload a page carrying live audio; don't let a PWA update interrupt a payment or a broadcast.
- Don't use `alert()` for form validation; don't rely on placeholders as labels.

---

## 8. Known debt and migration order

| Debt | Evidence | Target |
|---|---|---|
| Legacy navy/gold/orange | `#142B4C` ×98, `#C8A54A` ×37, `#FF6B35` ×8, `#0F2038` in radio/PWA/print | Replace with `brand-navy`, `brand-accent`, `brand-danger`, `brand-navy-light` |
| Literal type | 17×8px, 213×9px, 721×10px | `text-caption` (11px) and `text-footnote` (12px); migrate `VendorDetailDrawer`, `vendor/sell`, `scanner`, `budget`, `CheckoutClientPage` first |
| 32px floor treated as target | Radio tabs/mute/share 32px, scanner presets 32px, footer links 12–15px | 44px primary, ≥24px legal links |
| Rounded/soft variant | 105 `rounded-lg`, 120 `rounded-xl`, 100 `backdrop-blur`, `shadow-2xl` | Decide radio sub-brand; remove from ticketing/ops; document the variant if kept |
| Raw Tailwind status colors | `bg-purple` ×24, `text-purple` ×31, `bg-yellow-300` ×67, `text-green-700` ×41, `from-indigo` ×1 | Tokenized status pairs |
| Duplicate token namespaces | `--brand-*` aliases + `--color-brand-*` | Keep `--color-brand-*` canonical; `--brand-*` only for legacy arbitrary values, then remove |
| Placeholder contrast | `::placeholder { opacity: .55 }` | Persistent labels; raise to `.70` if placeholders remain |
| Stale design doc | Previous `DESIGN.md` claimed `#0F4C81`, `system-ui`, 8px labels, rounded cards | This document; re-run the detector after changes |

---

## 9. Change policy

1. `app/globals.css` is the source of truth. A new color, font size, radius, or shadow goes there first.
2. No new literal hex or `text-[Npx]` in a component. If a one-off is unavoidable, add a token or a comment explaining why.
3. Every new public page: `<main>`, one `h1`, associated labels, 44px primary target, visible focus, real next date/price.
4. Every new radio control: token palette, 44px play/primary, no auto-reload while playing.
5. Run `npm run build` (typecheck), the relevant `tests/*.check.ts`, and the route axe audit before merging. Re-run `npx impeccable --fast app components` after changing tokens; track the baseline (1,099 after the 2026-11-16 rewrite) and treat a rise as a real regression.
