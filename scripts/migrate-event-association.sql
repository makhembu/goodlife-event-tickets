-- Migration: Event-Linked Tickets + Archive System
-- Date: 2026-08-31
-- Description: Add events table, link tickets/tiers/payments to events

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

-- RLS policies for events (Neon doesn't use Supabase 'authenticated' role)
-- RLS is optional for Neon since we control access via API middleware

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

-- 6. Create initial event from event_details (if not exists)
INSERT INTO events (title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, is_active)
SELECT title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, TRUE
FROM event_details
WHERE id = 1
AND NOT EXISTS (SELECT 1 FROM events WHERE id = 1);

-- 7. Backlink existing tickets to event_id = 1
UPDATE tickets SET event_id = 1 WHERE event_id IS NULL;

-- 8. Backlink existing tiers to event_id = 1
UPDATE ticket_tiers SET event_id = 1 WHERE event_id IS NULL;
