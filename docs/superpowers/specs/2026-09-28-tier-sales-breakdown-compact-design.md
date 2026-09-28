# Compact Ticket Tier Sales Breakdown — Design

**Date:** 2026-09-28
**Status:** Approved
**File:** `components/admin/TierSalesBreakdown.tsx` (single file, presentation-only)

## Problem

`TierSalesBreakdown` occupies ~416px of vertical space in `/admin/dashboard` between `BoxOfficeMetrics` and the "STAFF & VENDOR POS STALLS" card, pushing the 6-tab working bar (Ticket Sales / Tiers / Payments / Payment Requests / Waitlist / Trash) roughly 800px down the page.

Two causes:

1. **One ~96px card per configured tier.** `fetchDashboardMetrics` seeds `campingTiers` with *every* configured tier (`lib/supabase-db.ts:462`) before folding in sales. With `DEFAULT_POSTER_TIERS` that is 8 tiers — up to 6 of which can render `Sold: 0 · Ksh 0` with an empty bar.
2. **Layout `grid-cols-1 md:grid-cols-3 gap-6`** → 8 tiers = 3 rows; `grid-cols-1` on mobile = 8 stacked cards ≈ 940px.

Meanwhile the component receives `stats.cap` (`max_quantity`) and never renders it, and its percentage is share-of-ticket-count, which is misleading for camping tiers that admit 1/2/4/6 people.

## Decision

Compact, always-visible row list. Zero-sale tiers are hidden with a one-line disclosure. Bars show sold-of-cap where a cap exists.

## Design

### Row anatomy

Replaces the 96px card. ~30px per row.

| Element | Specification |
|---|---|
| Name | `flex-1 min-w-0 truncate`, `text-footnote font-black uppercase` |
| Best seller | `★` inline before the name (was its own line, ~20px) |
| Sold out | `SOLD OUT` inline after the name, `text-brand-danger` |
| Category | 3px colored left rule — navy = TICKETS, `var(--brand-accent)` = CAMPING. Replaces the `[TAG]` chip at zero height cost. Detected from `tag` containing `CAMP` |
| Bar | `h-2` (was `h-4`). Width = `sold/totalTicketsSold` for every row — one scale, directly comparable. Clamped to 100. Fill turns `brand-danger` when sold out |
| Sold | `w-12 md:w-16`, right-aligned, `tabular-nums`. Renders `42/200` when the tier has a cap |
| Revenue | `w-28`, right-aligned, `tabular-nums` |
| Shimmer | Retained on the best-seller row only — a shimmer on every row simultaneously is motion noise |

Bar widths: `w-full sm:w-48 md:w-64` so the bar wraps to its own line on the narrowest breakpoint and sits inline from `sm` up.

### Card shell

Unchanged: `border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-5 shadow-(--shadow-brut-md)`. Brutalist identity preserved.

Header becomes a flex row with the aggregate pushed right (`412 SOLD · Ksh 1.28M`), replacing the per-tier `Sold:`/`Ksh` line stack.

### Guards

- **`+ N UNSOLD TIERS`** as a trailing `text-caption` line — plain text, no interaction (YAGNI). Preserves the "this tier isn't selling" signal that full hiding would destroy.
- **Scroll cap:** when more than 10 tiers are selling, the list is wrapped in `max-h-[320px] overflow-y-auto custom-scrollbar`. Height stops being a function of *configured* tier count and grows only ~30px per *selling* tier.
- **Empty state:** `return null` when nothing has sold. `BoxOfficeMetrics` already reads 0, so a bare disclosure line would be noise.

### Single bar scale

An earlier draft encoded capacity in the bar (progress-to-cap) for capped tiers and share-of-sales for uncapped ones. That made bar lengths incomparable across the two groups: a 50%-full bar could mean "half your cap" or "half your sales", so the eye could not conclude one tier outsells another.

Resolved by giving the bar exactly one question — **share of all tickets sold** — so every row is directly comparable. Capacity moved out of the bar and into the sold column, which renders `42/200` when a cap exists. The `SOLD OUT` marker and red fill still fire at `sold >= cap`, so stock-out state remains the loudest thing on the row.

## Scope

- **Changed:** `components/admin/TierSalesBreakdown.tsx` only.
- **Unchanged:** `app/admin/dashboard/page.tsx`, `lib/supabase-db.ts` / `fetchDashboardMetrics`, and the component's props (`campingTiers`, `totalTicketsSold`, `ticketTiers`). All required data already flows through.

## Result

~416px → ~210px for a typical 4-selling-tier event.

## Verification

1. `npm run build` — this repo's only typechecker (`typescript.ignoreBuildErrors: false`).
2. `npm run lint` — not run during build (`eslint.ignoreDuringBuilds: true`).
3. Visual: `/admin/dashboard` at desktop and 390px, against an event with 4–5 selling tiers and at least one at zero sales. Confirm the tab bar is above the fold, the unsold disclosure shows, and a capped tier fills correctly.
