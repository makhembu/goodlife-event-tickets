# UI/UX & Design-System Audit

**Date:** 2026-11-16
**Scope:** public ticketing (`/`, `/?event=`, `/events`, `/gallery`, checkout), the radio product (`/radio`, `/radio/apply`, `/radio/schedule`, player components), and the unauthenticated operational entry points (`/login`, `/vendor/login`, `/scanner/login`, `/presenter/login`).
**Method:** static source review, `impeccable` static analysis, Playwright + axe on 13 routes at 390×844, and a stable re-run with `serviceWorkers: 'block'` and media requests aborted. Measurements are computed layout, not estimates.
**Companion docs:** `DESIGN.md` (rewritten to match the code), `PRODUCT.md` (rewritten to include the radio and operational users), `docs/CODEBASE-AUDIT-AND-REFACTOR-PLAN.md`, `docs/CONFIG-MISMATCH-AUDIT.md`.
**Priority:** radio is the first product to fix **within P1**, because its defects interrupt live listening and block screen-reader users. The single P0 is in ticketing because it is the live revenue path.

> **Caveats:** authenticated `/admin/*`, `/vendor/sell`, `/scanner`, and `/vendor/tabs` were not exercised (no `ADMIN_PASSWORD`/PIN in this environment); their findings are static only. The model cannot view screenshots, so visual judgments come from computed DOM/CSS and axe. Production Vercel env values were not inspected. Counts are a snapshot and will drift.

---

## 1. Verdict

**Nielsen score: 22/40 — low end of "Acceptable".**

The brand is strong and recognisable. The public checkout is poster-led, the total is visible, the gate surfaces are decisive, and the radio player has a clear primary action. What drags the score down is not taste; it is **state honesty, accessibility, and drift**:

- The only live event advertises passes, then tells the buyer there are no passes, shows **KES 0 (FREE)**, and offers an **RSVP FREE ENTRY PASS** with an empty ladder.
- Radio playback can be interrupted by a service-worker reload, and the radio forms are visually labelled but not programmatically labelled.
- Operational surfaces still use 8–10px text and a second, older palette.
- `DESIGN.md` described a different product (navy `#0F4C81`, `system-ui`, rounded cards), so there was no reliable spec to enforce.

| # | Heuristic | Score | Why |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Live/closed/step states are clear; but the zero-tier state contradicts the banner, and `/api/events/active` 404 noise appears in console. |
| 2 | Match to the real world | 2 | “EVERY SUNDAY · 14:00” vs “NOV 13 • GATES OPEN 10:14PM”; “Check back on Saturday” for a Sunday series; “EARLY RSVP KES 50 OFF” with no RSVP tier; `/events/3` prints `11/13/2026`. |
| 3 | User control & freedom | 2 | PWA update auto-reloads; gallery lightbox has no Escape/close semantics; radio update prompt is bypassed by `skipWaiting()`. |
| 4 | Consistency & standards | 2 | Three navies, two golds, literal hex in radio/PWA/print, 8–11px type, square vs `rounded-xl`, 12–15px footer links. |
| 5 | Error prevention | 2 | Empty-ladder submit remains visible/enabled; placeholder-only fields; `alert()` validation in `TipModal`; free-RSVP branch keyed on `totalPrice === 0`. |
| 6 | Recognition over recall | 2 | Visible labels are not associated; icon-only back/close/admin links; placeholder-only shoutout and apply fields. |
| 7 | Flexibility & efficiency | 3 | Story switcher, quick presets, dense admin tables; but no skip link/landmarks, and mobile admin hides the “Admin Login” text. |
| 8 | Aesthetic & minimalist design | 3 | Strong ticketing identity; radio rainbow chips, rounded/soft cards, and legacy navy/orange water it down. |
| 9 | Error recovery | 2 | Good inline errors in some forms; generic `alert()`, 404 console noise, and a dead end whose copy points to a “Notify Me” control that is not on the page. |
| 10 | Help & documentation | 1 | No inline help or format hints; placeholders do the labelling; radio apply gives no field guidance. |

**What is working:** the ticket/story hierarchy, the visible total, the gate/PIN primary controls, the radio play button, the “no fallback price ladder” rule, and the hard-shadow ticket language. Keep those.

---

## 2. Severity summary

| Severity | Count | Themes |
|---|---|---|
| **P0** | 1 | Live checkout dead end + contradictory availability copy |
| **P1** | 5 | Radio PWA reload; radio/ops labelling & landmarks; gallery keyboard/dialog; date/copy truth; type/palette drift + stale spec |
| **P2** | 5 | Touch targets; heading structure; radio legacy palette/rounded; placeholder contrast; empty-state/404 noise |
| **P3** | 1 | Detector-only tells and decorative inconsistencies |

---

## 3. P0 — fix before the next sales push

### P0-1. The live mini event is sellable in the banner but unbuyable in checkout

**Symptom (observed across `/` and `/?event=3`, Monday 16 Nov 2026):**

- Home banner (on `/`): **“SUNDAY PARK & CHILL IS BOOKABLE NOW”**, **“PASSES ON SALE • EARLY RSVP KES 50 OFF”**, CTA **“GET PASSES & RSVP →”**.
- Checkout: **“NO PASSES ON SALE RIGHT NOW”**, **“TOTAL DUE KES 0 (FREE)”**, active button **“RSVP FREE ENTRY PASS”**, and a full name/phone/quantity form.
- The event actually has two paid tiers in the DB: `regular-pass-300` (KES 300) and `couples-pass-500` (KES 500), both created 2026-11-10.
- Empty-state copy says **“Check back on Saturday”** (the series is `weekly`; the next session is Sunday) and tells the user to **“tap Notify Me above”** — but there is no Notify Me control in the checkout. “Notify Me” exists only on the recap (`ClosedEventClientPage.tsx:298`) and coming-soon (`ScheduledEventClientPage.tsx:375`) pages, not on `/?event=3`; the only occurrences inside checkout are the two instruction strings at `CheckoutClientPage.tsx:1736-1737`.

**Root cause (three separate rules, all true):**

1. `app/CheckoutClientPage.tsx:502-551` — for a mini event, the weekday rule filters the ladder to tiers with an RSVP tag. Event 3 has **no RSVP tier**, so `displayedTiers` is empty on Monday.
2. `app/page.tsx:238` — the home banner uses `isEventSellable(e)`, which is date-window based, not “has a displayed tier”. It returns sellable, so the banner advertises the event.
3. `CheckoutClientPage.tsx:1974` and `:2094-2098` — the total and CTA branch on `totalPrice === 0`, not on “a tier is selected”. With no tiers, the total reads `KES 0 (FREE)` and the button becomes a free-RSVP CTA. The guard at `:740-760` only rejects on submit, so the dead end looks live.

**Why it matters:** it is the only live event and the destination of the home banner, and it offers a free pass that does not exist. That is a revenue defect and a trust defect.

**Recommended fix (decide the product rule first):**

- **Option A (recommended for event 3):** no RSVP tier means the paid tiers are shown every day. If `rawTiers` contains no RSVP-tagged tier (`tier.tag`/`tier.id`/`tier.name`), skip the weekday branch and show the paid ladder; derive the banner copy from the actual tiers. This matches the DB and the “PASSES ON SALE” claim.
- **Option B:** early RSVP is a real product. Create a real RSVP tier (free or KES 50) and keep the weekday rule. Then the free CTA is legitimate.
- **Option C:** no weekday sales. Make `isEventSellable` false on non-session days, route to `coming_soon`, and remove “BOOKABLE NOW” from the banner.

**Regardless of option:**

- Gate the total and CTA on `hasDisplayedTier`, not `totalPrice === 0`. When the ladder is empty, render only the empty-state panel + a non-submitting “Notify Me”/“View schedule” action; hide steps 02–04 and the submit button. If no Notify Me control is implemented, remove the instruction instead of pointing at nothing.
- Replace hardcoded banner copy (`LiveMiniEventBanner.tsx:108-128`) with tier-derived text; never claim “RSVP” when no RSVP tier exists.
- Use `resolveNextOccurrence` / `formatOccurrence` for the next-session line, and say “Sun 22 Nov, 2:00 PM”, not “Saturday”.
- Add a `tests/checkout-empty-ladder.check.ts` that fails if a zero-displayed-tier state renders `KES 0 (FREE)`, `RSVP FREE ENTRY PASS`, or an enabled pay/RSVP CTA. Add a case to `public-state.check.ts` that the banner’s “bookable” claim and the checkout’s displayed ladder agree.

**Evidence:** `CheckoutClientPage.tsx:502-551, 740-760, 1726-1737, 1970-1976, 2088-2117`; `LiveMiniEventBanner.tsx:63, 108-128`; `app/page.tsx:230-272`.

---

## 4. P1 — fix next (radio first within this tier)

### P1-1. Radio playback is interrupted by a PWA auto-reload

**Evidence:** `components/ui/PwaUpdatePrompt.tsx:22-30` reloads on every `controllerchange`. `public/sw.js:30` calls `skipWaiting()` on install and `:42` calls `clients.claim()` on activate. The prompt at `:76-101` therefore never gets a chance to ask; the page reloads as soon as the new worker claims the client. The headless run observed full-page reloads on `/radio` (two in that run) and can cut a live stream.

**Why it matters:** a listener tuning in on a deployed update gets a hard reload mid-show. The current “Update now” prompt is effectively dead code, and the check only protects payments (`__GOODLIFE_PAYMENT_ACTIVE__`), not audio.

**Fix (radio-first):**

1. Remove `skipWaiting()` from `install` and `clients.claim()` from `activate`; keep the `SKIP_WAITING` message handler (`sw.js:48-49`) so the prompt’s button is the only path.
2. Remove the auto `window.location.reload()` on `controllerchange`. On `controllerchange`, show “Update ready — reload when you’re not listening”, and only reload on explicit user action.
3. If audio is playing (`!audio.paused`), do not reload even on the button; defer until pause/visibility change, or offer “Update after this show”.
4. Add a static test (`tests/pwa-update.check.ts`) asserting no unconditional `location.reload()` in the controllerchange handler and no `skipWaiting()` outside the message handler.

**Acceptance:** load `/radio`, start playback, deploy a new SW → audio continues; the prompt appears; clicking Update reloads once; no reload occurs without a click.

### P1-2. Radio forms and player lack programmatic labels and landmarks; gallery is keyboard-inaccessible

**Radio player (`/radio`):**

- Root is a `<div>` (`app/radio/page.tsx:221`), no `<main>`; axe `landmark-one-main` + `region` ×15.
- Shoutout fields have visible `<label>` elements but **no `htmlFor`/`id`** (`components/radio/ShoutoutWall.tsx:212-265`); axe sees 4 unlabelled inputs.
- Tabs, mute, share, and tip are 32–40px; the back link is 40×40 (`/radio` stable audit).
- Tip modal: close is an icon-only `<X>` with no `aria-label` (`components/radio/TipModal.tsx:114-116`); presets are ~32px (`:152`); validation uses `alert()`; no `role="dialog"`/`aria-modal`/Escape/focus trap.

**Radio apply (`/radio/apply`):**

- 9 visible labels, **zero `htmlFor`/`id`** (`app/radio/apply/page.tsx:145-267`); the accessible name comes only from the placeholder.
- **Contrast failure:** `text-brand-accent` on `bg-brand-off-white` = **1.73:1** (`:99` “JOIN THE AIRWAVES”), axe `color-contrast` serious.
- No `<main>`; axe `region` ×11.

**Gallery (`/gallery`):**

- No `<h1>` at all (header is a `<span>` at `:54`); axe `page-has-heading-one`.
- Cards are `<div onClick>` with no `role`, `tabIndex`, or key handler (`:68-72`) — keyboard users cannot open the lightbox.
- The back link is an icon-only `<Link>` with no `aria-label` (`:49-52`) — axe `link-name`.
- Lightbox (`:122`) has no `role="dialog"`, `aria-modal`, Escape, or focus return; close (`:126`) is icon-only with no label; image alt is generic “Lightbox”.

**Auth surfaces:**

- `/login` has **h2 only** (`app/login/page.tsx:82`), no `<main>`; axe `page-has-heading-one` + `region` ×8.
- `/scanner/login` has 3 input labels but no `htmlFor`/`id` (`:165, 195, 209`; the event label at `:140` is for the button group), no `<main>`, `region` ×8; gate preset chips are 32px.
- `/vendor/login` has a `<main>` and h1, but the “Admin Login” text is `hidden sm:inline` (`:87-93`), so at 390px the icon-only link has no accessible name — axe `link-name` serious.
- `/presenter/login` has no `<main>` (`region` ×8).

**Fix:** add a `<main id="main">` to each page; one `h1` per page; `id`/`htmlFor` for every label (or wrap the input); `aria-label` on icon-only controls; convert gallery cards to `<button>`/`<a>`; make the lightbox a real dialog with Escape, focus trap, and labelled close. This is mostly mechanical and low-risk.

### P1-3. Date and copy contradict the recurrence engine

**Evidence:** `/events/3` prints `DATE: 11/13/2026`; the checkout date card prints `NOV 13 • GATES OPEN 10:14PM` while the page also says `EVERY SUNDAY | 14:00`. `event_date` and `sales_close_date` are both `2026-11-13T19:14:36.670Z`; the event is `weekly`, next session Sunday. The formatter at `CheckoutClientPage.tsx:1585-1601` uses `toLocaleString(..., Africa/Nairobi)` for the month but `getDate()`/`getHours()` in browser-local time, so it can print a different day/time from the occurrence engine.

**Fix:** one date formatter. For recurring events, use `resolveNextOccurrence` (`lib/event-availability.ts:273`) + `formatOccurrence` (`:401-411`) for the checkout strip, the banner, `/events/3`, and the empty-state copy. For one-off events, format the explicit date in `Africa/Nairobi` with `en-KE` and `day: "numeric", month: "short", year: "numeric"`. Never mix `getDate()`/`getHours()` with a Nairobi month.

### P1-4. Operational type and palette drift

**Evidence:** 1,512 literal font sizes in `app/` + `components/` — 17 at 8px, 213 at 9px, 721 at 10px, 561 at 11px — against only 22 uses of `text-caption`/`text-footnote`/`text-body`. Highest concentrations: `app/admin/dashboard/page.tsx` 175, `VendorDetailDrawer.tsx` 161, `app/vendor/sell/page.tsx` 102, `admin/budget/page.tsx` 74, `CheckoutClientPage.tsx` 63. The scanner and checkout still use 8–10px labels (`CheckoutClientPage.tsx:1561-1571`, `app/scanner/login/page.tsx:155, 176`) and legacy hex (`#142B4C` ×98, `#C8A54A` ×37, `#FF6B35` ×8, `#0F2038` in radio/PWA/print).

**Why it matters:** gate staff and vendors use these screens in sunlight, gloves, and a hurry. 9px mono is not readable at arm’s length, and the old navy/orange makes the radio and PWA look like a different product.

**Fix:** 11px floor for all visible text; migrate the five highest-count files first; replace legacy hex with `brand-navy`, `brand-accent`, `brand-danger`, `brand-navy-light`; add a lint/grep gate for `text-[8px]`/`[9px]`/`[10px]` and the five legacy hex values in `app/` + `components/` (allow `tests/` fixtures).

### P1-5. The design spec was stale, so there was no enforceable target

`DESIGN.md` claimed navy `#0F4C81`, `system-ui`, off-white `#F9FBFD`, bg `#F0F4F8`, white cards, 44px targets, 8px smallest size, and a 4/8/12/16 radius scale. The code is charcoal `#16181D`, cream `#FBF9F6`, sand `#F3ECE1`, gold `#DFBB7D`, Space Grotesk/Bebas, square-by-default, 32px floor. The old spec also allowed a 10px label, so some 10px uses were considered on-ramp; the new 11px floor flags more of them.

**Status:** `DESIGN.md` has been rewritten to the verified system (charcoal/cream/sand/gold, Space Grotesk + Bebas, 11px caption floor, 4px borders, hard shadows, square-by-default, 32px floor/44px primary, legacy-token debt list). `PRODUCT.md` now includes radio listeners, presenters, and station managers, plus a WCAG 2.2 AA target. **Important:** the detector is not a doc-freshness meter. Re-running it after the rewrite reports **1,099 findings** (958 `design-system-font-size`, 112 `design-system-color`, 25 warning), *more* than the 919 before, because the new 11px floor forbids the 10px the old spec allowed. That increase is the point: the literal-size debt is real. Use the new count as the baseline to burn down, not as evidence the doc rewrite failed.

---

## 5. P2 — fix after the P1 sweep

### P2-1. Touch targets: 44px recommendation, 24px WCAG floor

Measured at 390px:

- Home: event chips 32px high; footer legal links **15px high** (`Terms of Service` 88×15, `Privacy` 77×15, `Refund` 71×15).
- Event 3: story nav 26×32; gallery/radio 32×32; quantity 40×40; name/phone 40px; “Different WhatsApp number?” 32px; legal links **12px** and footer **15px**.
- Radio: tabs 32px, mute 48×32, share 53×32, tip 78×40, inputs 36px, submit 40px, back 40×40, timetable 366×32.
- Scanner login: gate presets 32px, event chips 32px, text inputs 36px.
- Gallery: only 2 elements in the tab order, because the cards are `<div>`s; the photos themselves are unreachable by keyboard.

The footer/legal links **fail WCAG 2.2 AA 2.5.8** (24×24 minimum) because `:where(button,input,select,textarea){min-height:32px}` does **not** include `<a>` (`app/globals.css`). Most other controls pass 24px but sit below the 44px recommendation.

**Fix:** add `inline-flex items-center min-h-6` (24px) or `py-1.5` to legal links; make primary radio/gate controls 44px (`min-h-11`); keep 32px only for compact secondary chips.

### P2-2. Heading structure and duplicate titles

- Home (`/`): first heading is **h3** (“SUNDAY PARK & CHILL IS BOOKABLE NOW”) before the h1 (`ClosedEventClientPage.tsx:222` banner, `:240` h1).
- Event 3: h1 and h2 both read “SUNDAY PARK & CHILL”.
- `/radio/schedule`: h1 → h3 skip (axe `heading-order`).
- `/gallery`: no h1. `/login`: h2 only.

**Fix:** one h1 per page; make the mini promo an h2 or a styled link, not an h3 above the h1; make the checkout section h2 “GET YOUR PASSES” (not the event title again); use h2 on schedule sections.

### P2-3. Radio uses an older palette and a softer, mixed shape language

Radio components hardcode `#142B4C`, `#C8A54A`, `#F3ECE1`, `#0F2038`: `TipModal` 19 occurrences, `ShoutoutWall` 13, `ScheduleManager` 18, `GlobalRadioBar` 11, `ShareStationModal` 4, `SponsorBanner` 2. The main radio page has 45 rounded utilities (20 `rounded-full`, 11 bare `rounded`, 7 `rounded-xl`, 5 `rounded-lg`, 2 `rounded-2xl`) on top of brutalist 4px borders and hard shadows. It also uses raw `bg-red-600` / `bg-amber-500` / `bg-purple-700` status chips and mixes 2/3/4px borders (`border-3` at `app/radio/page.tsx:362, 707`) instead of the documented 2/4 scale. The PWA prompt uses `bg-[#142B4C] border-[#FF6B35] rounded-xl shadow-2xl` (`PwaUpdatePrompt.tsx:77`).

**Decision needed:** is radio a deliberate softer sub-brand (rounded deck) or should it square up to ticketing? If soft: document the variant, tokenize the palette, and stop mixing old hex. If square: replace `rounded-xl/2xl` on cards with square surfaces, keep `rounded-full` for the play button/status dots, and replace `shadow-2xl` with `shadow-(--shadow-brut-*)`.

### P2-4. Placeholder contrast and label strategy

`app/globals.css` sets `::placeholder { opacity: .55 !important }` → **3.80–3.95:1** on cream/sand/white, below AA 4.5. The radio apply, shoutout, scanner, and tip forms put the only visible label adjacent but unassociated, so screen readers hear the placeholder (or nothing) and sighted users get low-contrast hints.

**Fix:** associate the labels (P1-2), then either remove the placeholder-only pattern or raise opacity to `.70` (≈6.1–6.6:1). Prefer persistent labels; placeholders are examples.

### P2-5. Empty states, 404 noise, and dead-end copy

- `/api/events/active` returns **404** when no event is active; `/radio` requests it twice per load, producing console errors.
- The zero-tier checkout tells users to tap “Notify Me” but that control exists only on the recap/coming-soon pages, not on checkout; the submit area below still looks active (P0).
- `/events/3` uses the US date format; `/events` archive cards are otherwise clear.

**Fix:** make `/api/events/active` return `200 { event: null }` (or handle 404 silently), dedupe the radio fetch, and ensure every empty state has exactly one next action.

---

## 6. P3 — polish and detector noise

- `impeccable --fast app components` before the rewrite: **919 findings** (902 advisory, 17 warning). After the rewrite: **1,099 findings** (1,074 advisory, 25 warning). Breakdown after: 958 `design-system-font-size`, 112 `design-system-color`, 8 `design-system-font`, 8 `side-tab`, 4 `bounce-easing`, 4 `overused-font`, 3 `border-accent-on-rounded`, 2 `ai-color-palette`.
- **Ignore** the 4 `overused-font` findings: Space Grotesk is the brand font, not a generic default.
- **Do not compare the 919 and 1,099 totals.** The new spec sets an 11px floor and no longer blesses 10px labels, so more literal sizes are correctly flagged. The 112 color advisories are literal rgba/hex outside the palette (pattern overlays, old radio hex), not stale-doc noise; tokenize the intentional ones and add tonal ramps only where the palette genuinely expands.
- **Real minor tells:** 14 `border-l-4` accent stripes, 4 `animate-bounce`, 3 accent-border-on-rounded cards, 2 purple/indigo palettes, 100 `backdrop-blur` uses (audit which are card surfaces vs overlays), `shadow-2xl` in radio/PWA.
- The checkout’s 8px arrow (`:1564`) and 9px map/labels (`:1561-1571`) are covered by P1-4, not separate items.

---

## 7. Page-by-page evidence

| Route | Stable audit (390px) | Findings |
|---|---|---|
| `/` (closed recap) | main 0, 12 interactive, 6 small, 3 tiny; axe `landmark-one-main`, `region` ×12; unlabelled `type=tel` waitlist | h3 before h1; footer links 15px; no main; waitlist input placeholder-only |
| `/?event=3` (mini checkout) | main 1, 25 interactive, 19 small, 6 tiny; axe `color-contrast` serious, `region` ×2 | P0 zero-tier dead end; Sunday vs Nov 13; duplicate h2; 9px `text-brand-navy/60` on gold = 3.75:1; story arrows 26×32; legal links 12px |
| `/events` | main 0; axe `landmark-one-main`, `region` ×6 | Good h1/h2; only landmark debt |
| `/gallery` | main 0, no headings, 2 interactive; axe `link-name`, `page-has-heading-one`, `landmark-one-main`, `region` | Clickable divs; icon-only back; lightbox not a dialog; close unlabelled; 10px/rgba styles |
| `/login` | main 0, h2 only; axe `page-has-heading-one`, `landmark-one-main`, `region` ×8 | h2, no main; old `--brand-*` aliases |
| `/vendor/login` | main 1, h1; axe `link-name` serious | “Admin Login” text hidden on mobile → icon-only link |
| `/scanner/login` | main 0, 11 interactive, 8 small; axe `landmark-one-main`, `region` ×8 | 3 labels unassociated; gate chips 32px; event chips 9px; no main |
| `/presenter/login` | main 0, h1; axe `landmark-one-main`, `region` ×8 | No main; otherwise clear |
| `/radio` | main 0, 15 interactive, 13 small; axe `landmark-one-main`, `region` ×15; 4 unlabelled shoutout fields | PWA reload; 32px tabs/mute/share; TipModal unlabelled close; h1→h2→h3→h4→h3 is valid but landmarks are not |
| `/radio/apply` | main 0, 9 small; axe `color-contrast` serious, `region` ×11 | 9 labels unassociated; accent 1.73:1; no main |
| `/radio/schedule` | main 1, h1; axe `heading-order` | h1→h3; 3 small controls; otherwise solid |
| `/admin/*`, `/vendor/sell`, `/vendor/tabs`, `/scanner` | static only | 8–10px type and legacy palette concentrated here; needs authenticated audit |

---

## 8. Fix plan (radio-first within P1)

**Decisions needed before Phase 0:**

1. **Mini/RSVP rule** — A: show the paid tiers every day when no RSVP tier exists (recommended for event 3); B: create a real RSVP tier (free or KES 50) and keep the weekday rule; C: no weekday sales and route to `coming_soon`. The banner and checkout must use the same rule.
2. **Radio shape** — keep the soft rounded deck as a documented sub-brand, or square it to the ticketing system. Either way, replace `#142B4C`/`#C8A54A`/`#0F2038` with tokens.
3. **Notify Me** — add a real waitlist control to checkout, or remove the instruction. Recommended: reuse the existing waitlist API and render the control in the empty-state panel.

**Phase 0 — 1–2 days (release blockers):**
1. P0 checkout: choose the RSVP product rule; gate total/CTA on a real selected tier; hide steps/CTA when empty; derive banner copy; use the occurrence formatter; add the two tests.
2. P1-1 radio PWA: stop auto-reload, remove auto-`skipWaiting`/`claim`, defer while audio plays.
3. P1-2 labels/landmarks: `<main>` on `/`, `/radio`, `/radio/apply`, `/gallery`, `/login`, `/presenter/login`, `/scanner/login`, `/events`; `h1` on gallery/login; `htmlFor`/`id` on radio apply (9), ShoutoutWall (4), scanner (3), TipModal (4).
4. Land the rewritten `DESIGN.md` (done) and re-run the detector to establish the new baseline.

**Phase 1 — 3–5 days (radio + accessibility):**
5. Gallery keyboard/dialog: button/link cards, labelled close, `role="dialog"`, Escape, focus return.
6. Radio targets/palette: 44px tabs/mute/share/tip presets/close; tokenize `#142B4C`/`#C8A54A`/`#0F2038`; decide soft-vs-square radio; replace raw status chips.
7. Contrast: `text-brand-accent` on light → ink or `brand-gold-ink #7A5A1F`; fix `text-brand-navy/60` at 9px on gold; danger copy → `red-700/800`.
8. Footer/legal links: ≥24px, ideally 44px.

**Phase 2 — 1–2 weeks (operational quality):**
9. Type sweep in `VendorDetailDrawer`, `vendor/sell`, `admin/dashboard`, `budget`, `scanner`: 11px floor, token labels.
10. Date/copy unification (`/events/3`, checkout strip, banner, empty state); `/api/events/active` 200-null; dedupe radio fetch.
11. Heading/duplicate-h2 cleanup; h3 promo → h2; schedule h2.

**Phase 3 — ongoing:**
12. Add a CI grep for `text-[8px]`/`[9px]`/`[10px]`, `#142B4C`, `#C8A54A`, `#FF6B35`, `#0F2038`, `#0F4C81` in `app/` + `components/` (allow tests).
13. Add axe to the route smoke suite (public routes first; authenticated later).
14. Run the authenticated admin/vendor audit with real credentials and close the operational gaps.

---

## 9. Acceptance criteria

- `/?event=3` on a Monday either shows the paid tiers or a **single, non-submitting** “next session Sun 22 Nov, 2:00 PM” panel. It never renders `KES 0 (FREE)`, `RSVP FREE ENTRY PASS`, or an enabled pay/RSVP CTA unless a zero-price tier exists.
- The home banner’s “bookable/RSVP” copy is derived from the same tier set as checkout; `public-state.check.ts` covers agreement.
- Radio: no reload while audio is playing; the update prompt is the only reload path; shoutout/apply/tip labels are programmatically associated; `<main>` present; tabs/mute/share/close ≥44px.
- Gallery: every card is keyboard-openable; lightbox has dialog semantics, Escape, focus return, and a labelled close; page has an h1.
- Public routes: **0 serious/critical axe violations**; `landmark-one-main`/`region`/`heading-order`/`page-has-heading-one` are 0 on the audited set.
- No new 8/9/10px text or legacy hex in `app/` + `components/`; `DESIGN.md` matches `app/globals.css`.
- `npx impeccable --fast app components` is re-baselined at **1,099** after the doc rewrite (958 font-size, 112 color, 25 warning); drive the literal-size count down rather than treating the old 919 as the target.

---

## 10. Evidence index

- **Checkout dead end:** `app/CheckoutClientPage.tsx:502-551` (weekday filter), `:740-760` (submit guard), `:1726-1737` (empty state), `:1970-1976` (KES 0), `:2088-2117` (RSVP CTA); `components/LiveMiniEventBanner.tsx:63, 108-128`; `app/page.tsx:230-272`.
- **PWA reload:** `components/ui/PwaUpdatePrompt.tsx:22-30, 60-72, 76-101`; `public/sw.js:24-49`.
- **Labels/landmarks:** `app/radio/page.tsx:221`; `app/radio/apply/page.tsx:99, 145-267`; `components/radio/ShoutoutWall.tsx:212-265`; `components/radio/TipModal.tsx:114-116, 152`; `app/gallery/page.tsx:49-54, 68-72, 122-126`; `app/login/page.tsx:82`; `app/scanner/login/page.tsx:140, 165, 195, 209`; `app/vendor/login/page.tsx:87-93`; `app/presenter/login/page.tsx:43-52`; `app/events/page.tsx:53-59`.
- **Type/palette:** `app/globals.css`; counts from `app/` + `components/`; `app/scanner/login/page.tsx:155, 176`; `app/CheckoutClientPage.tsx:1561-1571`; radio component hex counts above.
- **Date:** `app/CheckoutClientPage.tsx:1585-1601`; `lib/event-availability.ts:273, 401-411`; DB event 3 `event_date`/`sales_close_date`.
- **Detector:** `npx --yes impeccable --json --fast app components` → 919 findings before the `DESIGN.md` rewrite (902 advisory, 17 warning); 1,099 after (958 font-size, 112 color, 25 warning). The rise is the stricter 11px floor, not a regression in the code.
- **Stable audit JSON/screenshots:** `%TEMP%\gl-stable.json`, `%TEMP%\gl-extra.json`, `%TEMP%\gl-audit-shots\` (local, not committed).
