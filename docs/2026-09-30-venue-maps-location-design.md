# Design Document: Venue Location & Maps Pin Integration

**Date**: 2026-09-30  
**Status**: Approved & Ready for Implementation  
**Audience**: Engineering & Product  

---

## 1. Understanding Summary
* **Goal**: Provide an effortless, foolproof way for attendees to navigate to specific event locations and pins (e.g. "The Garden" vs. "The Hut" within Marara Camp, or "The Hub Garden, Nairobi"), both pre-purchase on checkout and post-purchase via WhatsApp.
* **Why it exists**: Event properties are large with multiple gathering areas; organizers need attendees directed to the exact designated pin.
* **Key Constraints**:
  * Mandatory `maps_url` on event creation/edit in the Admin Dashboard.
  * Zero heavy iframes or JavaScript map SDKs on the checkout page (preserves the $y \le 1021\text{px}$ mobile fold budget).
  * Tactile, "minimally but almost too obvious" clickability affordance matching Goodlife's brutalist aesthetic.
  * Full backward compatibility with backfilled pins for existing events.

---

## 2. Assumptions
1. Schema will store `maps_url VARCHAR(500)` in the `events` table in Neon Postgres.
2. In the checkout UI, the `LOCATION` tile on mobile acts as an active link with a `[ 📍 MAP ↗ ]` tag and `TAP FOR DIRECTIONS ↗` sub-label.
3. On desktop, the unified header ribbon displays the venue name with a navigation arrow `↗` linking directly to the pin.
4. Ticket confirmations on WhatsApp include the direct Google Maps directions URL.

---

## 3. Decision Log

| Decision # | Context | Chosen Decision | Alternatives Considered | Rationale |
|---|---|---|---|---|
| **DEC-01** | User interaction mode | Tap-to-Navigate (Direct Link + WhatsApp Delivery) | Interactive Map Modal, Expandable Location Accordion | Lowest friction; immediately launches native maps app on phone without layout bloat. |
| **DEC-02** | Destination URL source | Specific pin link configured per event with fallback | Pure dynamic search only | Enables pinning specific huts/gardens within the same property. |
| **DEC-03** | Admin Input Policy | Strict (Mandatory `maps_url` on event creation/edit) | Optional field with search fallback | Ensures every event always has a verified, curated location pin. |
| **DEC-04** | Clickability Affordance | Micro-tag `[ 📍 MAP ↗ ]` + `TAP FOR DIRECTIONS ↗` sub-label | Standalone modal button, Plain underline | "Minimally but almost too obvious" — impossible to miss, perfectly matches brutalist styling. |

---

## 4. Architecture & Technical Specification

### 4.1 Database Layer (Neon Postgres)
* Column addition:
  ```sql
  ALTER TABLE events ADD COLUMN IF NOT EXISTS maps_url VARCHAR(500);
  ```
* Backfill data:
  * Event 2 (`GOODLIFE 4`): `https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika`
  * Event 3 (`SUNDAY PARK & CHILL #12`): `https://www.google.com/maps/search/?api=1&query=The+Hub+Karen+Nairobi`

### 4.2 TypeScript & API Layer
* Update `lib/supabase-db-types.ts` (`Event` model) to include `maps_url?: string;`.
* Update `lib/supabase-db.ts` to include `maps_url` in event selects, creates, and updates.
* Update `app/api/events/route.ts` and `app/api/events/[id]/route.ts` to persist `maps_url`.

### 4.3 Admin Dashboard & Event Creation
* Update `components/admin/CreateEventModal.tsx`:
  * Add required `maps_url` state and input field with placeholder and validation.
  * Flagship preset pre-fills Marara Camp pin; Mini preset pre-fills The Hub Karen pin.
* Update `app/admin/dashboard/page.tsx`:
  * Add `maps_url` field to event editor with `"Test Pin ↗"` preview action.

### 4.4 Checkout Page UI (`app/CheckoutClientPage.tsx`)
* Helper: `getDirectionsUrl(eventDetails)`.
* Mobile location tile:
  * Wraps in `<a>` tag with `href={directionsUrl}` and `target="_blank" rel="noopener noreferrer"`.
  * Header: `LOCATION` + `[ 📍 MAP ↗ ]` micro-chip.
  * Body: Venue title + `TAP FOR DIRECTIONS ↗`.
* Desktop unified ribbon:
  * Venue text rendered as an interactive link with `↗` icon and hover styling.

### 4.5 WhatsApp Notification (`lib/whatsapp.ts`)
* Add `📍 Directions: ${mapsUrl}` to ticket delivery template.

---

## 5. Implementation Checklist
- [ ] 1. Run migration script to add `maps_url` column to `events` table and backfill existing events.
- [ ] 2. Update `lib/supabase-db-types.ts`, `lib/supabase-db.ts`, and `/api/events` routes.
- [ ] 3. Update `components/admin/CreateEventModal.tsx` and `app/admin/dashboard/page.tsx` with required `maps_url` input & validation.
- [ ] 4. Update `app/CheckoutClientPage.tsx` with mobile tile affordance (`[ 📍 MAP ↗ ]`) and desktop broadsheet navigation link.
- [ ] 5. Update `lib/whatsapp.ts` with directions link in ticket messages.
- [ ] 6. Run `npm run clean && npm run build` and layout check tests.
- [ ] 7. Commit, push, and deploy to Vercel production.
