# Event-Linked Tickets + Archive System

**Date:** 2026-08-31
**Status:** Approved

## Problem

All tickets are stored in a flat `tickets` table with no `event_id` column. When a new event is created, old tickets sit alongside new ones with no way to:
- Filter tickets by event
- Archive old event data
- Maintain historical records per event

## Solution

Add event association to tickets and create an archive mechanism so each event's data stays grouped together.

---

## Schema Changes

### 1. New `events` table

```sql
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
  archived_at TIMESTAMP WITH TIME ZONE,  -- NULL = active event
  is_active BOOLEAN DEFAULT TRUE
);

-- RLS policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read events" ON events FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full access events" ON events FOR ALL TO authenticated USING (true);
```

### 2. Add `event_id` to `tickets`

```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
```

### 3. Add `event_id` to `ticket_tiers`

```sql
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
CREATE INDEX IF NOT EXISTS idx_tier_event_id ON ticket_tiers(event_id);
```

### 4. Add `event_id` to `pending_payments`

```sql
ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
```

### 5. Add `event_id` to `payment_logs`

```sql
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id);
```

---

## Table Strategy: `event_details` vs `events`

- **Keep `event_details`** — it's used by checkout page, WhatsApp templates, and existing code
- **Add `events` table** — for multi-event history and archival
- **`event_details` becomes a view of the active event** — sync on event changes
- When active event changes, update `event_details` to match

This minimizes code changes while enabling multi-event support.

---

## Data Migration

### Backfill existing tickets

Link all existing tickets (from 12/07/2026 event) to a new event row:

```sql
-- Create the historical event
INSERT INTO events (title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, is_active)
SELECT title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, TRUE
FROM event_details
WHERE id = 1
ON CONFLICT DO NOTHING;

-- Link all existing tickets to this event
UPDATE tickets SET event_id = 1 WHERE event_id IS NULL;

-- Link existing tiers
UPDATE ticket_tiers SET event_id = 1 WHERE event_id IS NULL;
```

---

## API Changes

### Event Management Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/events` | GET | List all events (admin) |
| `/api/events` | POST | Create new event (admin) — copies tiers from current event |
| `/api/events/[id]` | GET | Get event details |
| `/api/events/[id]` | PUT | Update event (admin) |
| `/api/events/[id]/archive` | POST | Archive event (admin) |
| `/api/events/active` | GET | Get current active event (public) |

### Ticket Changes

- `fetchAllTickets(eventId?)` — filter by event, default = active event
- `fetchAllTicketsAll()` — returns all tickets across events (admin CSV export)
- `createTicket()` — auto-assign to active event if no event_id provided

### Tier Changes

- `fetchTicketTiers(eventId?)` — filter by event, default = active event
- `createTicketTier()` — auto-assign to active event
- On new event creation — copy current event's tiers to new event

---

## Dashboard Changes

### Event Selector

Add event filter dropdown to admin dashboard:
- **Default:** "Current Event" (shows only active event tickets)
- **Options:** "All Events", list of past events by date
- Filter applies to: tickets list, metrics, CSV export

### Metrics

- Metrics calculate based on selected event filter
- "All Events" view shows aggregate + per-event breakdown table

### CSV Export

- Exports filtered by selected event
- "All Events" exports all tickets with event_name column
- Filename includes event name: `GOODLIFE-TICKETS-2026-07-11.csv`

### Archive Section

New "Past Events" section in dashboard:
- Lists archived events with ticket count and revenue
- Click to view that event's tickets (read-only by default)
- Option to re-activate an archived event

---

## Checkout Flow

When a user visits the checkout page:
1. Fetch active event from `events` table (not `event_details`)
2. Display that event's title, subtitle, venue, flyer, regulations
3. Fetch tiers filtered by active event_id
4. On purchase, auto-assign `event_id` of the active event

**Fallback:** If no active event exists, fall back to `event_details` table

---

## Scanner Flow

- Scanner continues to work as-is (validates ticket ID regardless of event)
- Show event name on scan result for clarity

---

## Edge Cases

### No active event
- Checkout falls back to `event_details` table
- Dashboard shows warning: "No active event set"

### Creating new event
- Copy current event's tiers to new event
- Set new event as active
- Archive old event automatically

### PDF tickets
- PDF generation includes event name at time of generation
- Old PDFs retain their event name (no regeneration needed)

---

## File Changes Required

| File | Changes |
|------|---------|
| `schema.sql` | Add `events` table, `event_id` columns, RLS |
| `schema-neon.sql` | Same schema updates |
| `lib/supabase-db-types.ts` | Add `Event` type, update `Ticket`, `TicketTier`, `PendingPayment` |
| `lib/supabase-db.ts` | Add event CRUD, update queries, add `fetchAllTicketsAll` |
| `app/api/events/route.ts` | New — event list/create |
| `app/api/events/[id]/route.ts` | New — event get/update |
| `app/api/events/[id]/archive/route.ts` | New — archive event |
| `app/api/events/active/route.ts` | New — active event (public) |
| `app/admin/dashboard/page.tsx` | Add event selector, archive section, metrics filter |
| `app/page.tsx` | Fetch active event from `events` table |
| `app/CheckoutClientPage.tsx` | Use active event's tiers/details |
| `app/api/admin/tickets/route.ts` | Accept `eventId` query param |
| `app/api/ticket-tiers/route.ts` | Accept `eventId` query param |
| `app/api/mpesa/stkpush/route.ts` | Assign active event_id |
| `app/admin/scanner/page.tsx` | Show event name on scan result |

---

## Migration Script

Run once to set up:
1. Create `events` table with RLS
2. Add `event_id` columns
3. Create initial event from existing `event_details` row
4. Backlink all existing tickets/tiers to this event
5. Create indexes on `event_id`

---

## Rollback Plan

If something goes wrong:
1. Remove `event_id` columns: `ALTER TABLE tickets DROP COLUMN event_id;`
2. Drop `events` table
3. All data stays intact (event_id is nullable)

---

## Success Criteria

- [ ] Old tickets (12/07/2026) are linked to their event
- [ ] Dashboard can filter tickets by event
- [ ] New event creation archives old event + copies tiers
- [ ] Checkout page shows current event's tiers
- [ ] CSV export filters by event
- [ ] No data loss during migration
- [ ] Existing functionality (scan, WhatsApp, PDF) still works
- [ ] Graceful fallback if no active event
