-- SQL Schema to create the tickets, event_details, and pending_payments tables in Neon PostgreSQL

-- Events table (multi-event support)
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

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  mpesa_receipt TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  amount_paid NUMERIC NOT NULL,
  purchase_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_scanned BOOLEAN DEFAULT false NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE,
  scanned_by TEXT,
  buyer_name TEXT NOT NULL DEFAULT 'Guest',
  event_id INTEGER REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

-- Create event_details table
CREATE TABLE IF NOT EXISTS event_details (
  id INT PRIMARY KEY DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'GOODLIFE',
  subtitle TEXT NOT NULL DEFAULT '237-THIKA | JULY 11',
  tag TEXT NOT NULL DEFAULT 'SMWHR INC · MARARA CAMP',
  venue TEXT NOT NULL DEFAULT 'MARARA CAMP, THIKA',
  till_number TEXT NOT NULL DEFAULT '5761205',
  flyer_url TEXT NOT NULL DEFAULT '/flyer.png',
  regulations TEXT NOT NULL DEFAULT 'Camp gate opens strictly at noon. Carry your dynamic physical PDF ticket or phone download for scanning validation. Absolute zero external beverage allowance at Marara. Access is limited strictly to 18+ and above, original ID documentation verified.',
  ticker_text TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  simulators_enabled BOOLEAN DEFAULT TRUE,
  operator_notifications_enabled BOOLEAN DEFAULT FALSE,
  footer_title VARCHAR(255) DEFAULT 'GOODLIFE TICKETING',
  footer_legal VARCHAR(255) DEFAULT 'STRICTLY 18+ NO OUTSIDE DRINKS',
  whatsapp_message TEXT DEFAULT '',
  event_id INTEGER REFERENCES events(id)
);

-- Insert default row
INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations)
VALUES (1, 'GOODLIFE', '237-THIKA | JULY 11', 'SMWHR INC · MARARA CAMP', 'MARARA CAMP, THIKA', '5761205', '/flyer.png', 'Camp gate opens strictly at noon. Carry your dynamic physical PDF ticket or phone download for scanning validation. Absolute zero external beverage allowance at Marara. Access is limited strictly to 18+ and above, original ID documentation verified.')
ON CONFLICT (id) DO NOTHING;

-- Create pending_payments table
CREATE TABLE IF NOT EXISTS pending_payments (
  checkout_request_id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  buyer_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT '',
  ticket_id TEXT DEFAULT '',
  whatsapp_number TEXT DEFAULT '',
  mpesa_reference TEXT DEFAULT ''
);
