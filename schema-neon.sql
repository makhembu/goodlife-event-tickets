-- SQL Schema to create the tickets, event_details, and pending_payments tables in Neon PostgreSQL

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  mpesa_receipt TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  amount_paid NUMERIC NOT NULL,
  purchase_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_scanned BOOLEAN DEFAULT false NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE,
  scanned_by TEXT,
  buyer_name TEXT NOT NULL DEFAULT 'Guest'
);

-- Create event_details table
CREATE TABLE IF NOT EXISTS event_details (
  id INT PRIMARY KEY DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'GOODLIFE',
  subtitle TEXT NOT NULL DEFAULT '237-THIKA | JULY 11',
  tag TEXT NOT NULL DEFAULT 'SMWHR INC · MARARA CAMP',
  venue TEXT NOT NULL DEFAULT 'MARARA CAMP, THIKA',
  till_number TEXT NOT NULL DEFAULT '5761205',
  flyer_url TEXT NOT NULL DEFAULT '/flyer.png',
  regulations TEXT NOT NULL DEFAULT 'Camp gate opens strictly at noon. Carry your dynamic physical PDF ticket or phone download for scanning validation. Absolute zero external beverage allowance at Marara. Access is limited strictly to 18+ and above, original ID documentation verified.'
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
