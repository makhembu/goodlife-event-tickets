# Event-Linked Tickets + Archive — Implementation Plan

**Date:** 2026-08-31
**Design doc:** `docs/2026-08-31-event-archive-design.md`

---

## Phase 1: Database Schema + Types

### 1.1 Create migration script
**File:** `scripts/migrate-event-association.sql`

```sql
-- 1. Create events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  tag TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  flyer_url TEXT DEFAULT '/flyer.png',
  logo_url TEXT DEFAULT '',
  regulations TEXT DEFAULT '',
  ticker_text TEXT DEFAULT '',
  till_number TEXT DEFAULT '',
  event_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- RLS policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read events" ON events FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full access events" ON events FOR ALL TO authenticated USING (true);

-- 2. Add event_id to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

-- 3. Add event_id to ticket_tiers
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tier_event_id ON ticket_tiers(event_id);

-- 4. Add event_id to pending_payments
ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);

-- 5. Add event_id to payment_logs
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);

-- 6. Create initial event from event_details
INSERT INTO events (title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, is_active)
SELECT title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, TRUE
FROM event_details
WHERE id = 1
ON CONFLICT DO NOTHING;

-- 7. Backlink existing tickets
UPDATE tickets SET event_id = 1 WHERE event_id IS NULL;

-- 8. Backlink existing tiers
UPDATE ticket_tiers SET event_id = 1 WHERE event_id IS NULL;
```

### 1.2 Update schema files
**Files:** `schema.sql`, `schema-neon.sql`
- Add `events` table definition with RLS
- Add `event_id` columns to `tickets`, `ticket_tiers`, `pending_payments`, `payment_logs`

### 1.3 Update TypeScript types
**File:** `lib/supabase-db-types.ts`

Add:
```typescript
export interface Event {
  id: number;
  title: string;
  subtitle: string;
  tag: string;
  venue: string;
  flyer_url: string;
  logo_url: string;
  regulations: string;
  ticker_text: string;
  till_number: string;
  event_date: string | null;
  created_at: string;
  archived_at: string | null;
  is_active: boolean;
}
```

Update existing interfaces:
```typescript
export interface Ticket {
  // ... existing fields
  event_id?: number | null;
}

export interface TicketTier {
  // ... existing fields
  event_id?: number | null;
}

export interface PendingPayment {
  // ... existing fields
  event_id?: number | null;
}
```

**Verification:** TypeScript compiles with `npm run build`

---

## Phase 2: Event CRUD Functions

### 2.1 Add event functions to supabase-db.ts
**File:** `lib/supabase-db.ts`

Functions to add:

```typescript
// Fetch all events
export async function fetchAllEvents(): Promise<Event[]>

// Fetch active event
export async function fetchActiveEvent(): Promise<Event | null>

// Fetch event by ID
export async function getEventById(id: number): Promise<Event | null>

// Create new event (copies tiers from current active event)
export async function createEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<Event>

// Update event
export async function updateEvent(id: number, updates: Partial<Event>): Promise<Event | null>

// Archive event (set archived_at, is_active=false)
export async function archiveEvent(id: number): Promise<boolean>

// Unarchive event
export async function unarchiveEvent(id: number): Promise<boolean>

// Set event as active (deactivate others, sync event_details)
export async function setActiveEvent(id: number): Promise<boolean>
```

### 2.2 Event creation copies tiers
When `createEvent()` is called:
1. Create new event row
2. Fetch current active event's tiers
3. Copy tiers to new event with new `event_id`
4. Set new event as active
5. Archive old event

**Verification:** Functions compile, can be imported

---

## Phase 3: Event API Routes

### 3.1 Event list/create endpoint
**File:** `app/api/events/route.ts`

- `GET /api/events` — list all events (admin only)
- `POST /api/events` — create new event (admin only) — copies tiers

### 3.2 Event detail/update endpoint
**File:** `app/api/events/[id]/route.ts`

- `GET /api/events/[id]` — get event details
- `PUT /api/events/[id]` — update event (admin only)

### 3.3 Event archive endpoint
**File:** `app/api/events/[id]/archive/route.ts`

- `POST /api/events/[id]/archive` — archive event (admin only)

### 3.4 Active event endpoint
**File:** `app/api/events/active/route.ts`

- `GET /api/events/active` — get current active event (public)

### 3.5 Update middleware
**File:** `middleware.ts`

Add `/api/events` to matcher, protect with admin auth (except GET on `/api/events/active`)

**Verification:** curl each endpoint, verify responses

---

## Phase 4: Update Existing Queries

### 4.1 Update fetchAllTickets
**File:** `lib/supabase-db.ts`

```typescript
export async function fetchAllTickets(eventId?: number): Promise<Ticket[]> {
  if (eventId === -1) {
    // Fetch ALL tickets across all events
    return fetchAllTicketsAll();
  }
  if (!eventId) {
    // Default: fetch active event's tickets
    const active = await fetchActiveEvent();
    eventId = active?.id;
  }
  // Filter by event_id
}

export async function fetchAllTicketsAll(): Promise<Ticket[]> {
  // Fetch all tickets regardless of event
}
```

### 4.2 Update fetchDashboardMetrics
**File:** `lib/supabase-db.ts`

```typescript
export async function fetchDashboardMetrics(eventId?: number) {
  const tickets = await fetchAllTickets(eventId);
  // Calculate metrics from filtered tickets
}
```

### 4.3 Update createTicket
**File:** `lib/supabase-db.ts`

Auto-assign active event_id if not provided:
```typescript
export async function createTicket(ticket: ...) {
  if (!ticket.event_id) {
    const active = await fetchActiveEvent();
    ticket.event_id = active?.id;
  }
  // Insert with event_id
}
```

### 4.4 Update fetchTicketTiers
**File:** `lib/supabase-db.ts`

```typescript
export async function fetchTicketTiers(eventId?: number): Promise<TicketTier[]> {
  if (!eventId) {
    // Default: fetch active event's tiers
    const active = await fetchActiveEvent();
    eventId = active?.id;
  }
  // Filter by event_id
}
```

### 4.5 Update API routes
**Files:**
- `app/api/admin/tickets/route.ts` — accept `eventId` query param
- `app/api/ticket-tiers/route.ts` — accept `eventId` query param
- `app/api/mpesa/stkpush/route.ts` — assign active event_id

### 4.6 Update checkout page
**File:** `app/page.tsx`

```typescript
// Before: const eventDetails = await fetchEventDetails();
// After:
const activeEvent = await fetchActiveEvent();
const eventDetails = activeEvent || await fetchEventDetails(); // fallback
```

**Verification:** All existing endpoints still work, new filters work

---

## Phase 5: Dashboard UI Changes

### 5.1 Add event selector component
**File:** `components/EventSelector.tsx`

- Dropdown showing: "Current Event", "All Events", list of past events
- Fetches events from `/api/events`
- Stores selected event in state
- On change, re-fetches tickets and metrics

### 5.2 Update admin dashboard
**File:** `app/admin/dashboard/page.tsx`

Changes:
- Add `EventSelector` at top of dashboard
- Pass selected event_id to ticket list and metrics
- Default to active event
- Add "Past Events" section showing archived events with stats
- Show event name/date in metrics header

### 5.3 Update metrics calculation
**File:** `app/admin/dashboard/page.tsx`

- Fetch metrics with event filter
- "All Events" shows aggregate + per-event breakdown table

### 5.4 Update CSV export
**File:** `app/admin/dashboard/page.tsx`

- Export filtered by selected event
- "All Events" exports all tickets with `event_name` column
- Filename: `GOODLIFE-TICKETS-{event-subtitle}.csv`

**Verification:** Dashboard loads, event selector works, metrics update

---

## Phase 6: Checkout Page Changes

### 6.1 Fetch active event
**File:** `app/page.tsx` (checkout)

- Fetch active event from `/api/events/active`
- Fallback to `fetchEventDetails()` if no active event
- Display event title, subtitle, venue, flyer, regulations

### 6.2 Fetch active event's tiers
**File:** `app/page.tsx` (checkout)

- Fetch tiers filtered by active event_id
- Show only active event's available tiers

### 6.3 Assign event_id on purchase
**File:** `app/CheckoutClientPage.tsx` + `app/api/mpesa/stkpush/route.ts`

- Include active event_id in pending payment
- Ticket creation assigns this event_id

**Verification:** Checkout shows correct event, tiers, purchase works

---

## Phase 7: Scanner + WhatsApp Updates

### 7.1 Scanner — show event name
**File:** `app/admin/scanner/page.tsx`

- After scanning, fetch ticket's event details
- Display event name on scan result

### 7.2 WhatsApp — include event name
**File:** `lib/whatsapp.ts`

- Template variables already include `{{eventTitle}}` — verify it pulls from linked event
- If no event_id, fall back to `event_details` table

**Verification:** Scanner shows event name, WhatsApp messages include event

---

## Phase 8: Migration Execution

### 8.1 Run migration on Neon
1. Connect to Neon database
2. Run `scripts/migrate-event-association.sql`
3. Verify: `SELECT COUNT(*) FROM tickets WHERE event_id = 1` matches total tickets

### 8.2 Deploy to Vercel
```bash
vercel --prod --yes --token="$VERCEL_TOKEN"
```

### 8.3 Verify production
- Login to admin dashboard
- Check tickets are linked to event
- Test event selector
- Test checkout flow
- Test scanner
- Test CSV export

---

## Execution Order

1. Phase 1 (Schema + Types) — foundation
2. Phase 2 (Event CRUD) — data layer
3. Phase 3 (Event API) — endpoints
4. Phase 4 (Update Queries) — ticket/tier filtering
5. Phase 5 (Dashboard UI) — event selector + archive
6. Phase 6 (Checkout) — active event on checkout
7. Phase 7 (Scanner/WhatsApp) — polish
8. Phase 8 (Migration + Deploy) — ship it

---

## Risk Mitigation

- **Backward compatible:** `event_id` is nullable, existing queries work without filter
- **Rollback:** Drop `event_id` columns, drop `events` table — no data lost
- **Idempotent migration:** Uses `IF NOT EXISTS`, can run multiple times
- **No downtime:** Additive schema changes, no table rebuilds
- **Fallback:** Checkout uses `event_details` if no active event exists
