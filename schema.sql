-- SQL Schema to create the tickets table in Supabase
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/kbwftozaisewcpnfzcar/sql/new

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
  buyer_name TEXT NOT NULL DEFAULT 'Guest',
  pdf_data TEXT -- base64-encoded cached PDF, generated once on first download
);

-- Enable Row Level Security (RLS)
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Allow anonymous ticket creation (for checkout)
CREATE POLICY "Allow anonymous insert" ON tickets
  FOR INSERT WITH CHECK (true);

-- Allow authenticated admins full read/write/update access
CREATE POLICY "Allow authenticated read" ON tickets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated update" ON tickets
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete" ON tickets
  FOR DELETE TO authenticated USING (true);

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
  ticker_text TEXT NOT NULL DEFAULT 'NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦',
  logo_url TEXT DEFAULT NULL
);

-- Enable RLS
ALTER TABLE event_details ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read
CREATE POLICY "Allow public read event_details" ON event_details
  FOR SELECT USING (true);

-- Allow authenticated admins to do everything
CREATE POLICY "Allow authenticated edit event_details" ON event_details
  FOR ALL TO authenticated USING (true);

-- Insert default row
INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text)
VALUES (1, 'GOODLIFE', '237-THIKA | JULY 11', 'SMWHR INC · MARARA CAMP', 'MARARA CAMP, THIKA', '5761205', '/flyer.png', 'Camp gate opens strictly at noon. Carry your dynamic physical PDF ticket or phone download for scanning validation. Absolute zero external beverage allowance at Marara. Access is limited strictly to 18+ and above, original ID documentation verified.', 'NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦')
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

-- Enable RLS for pending_payments
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for checkout)
CREATE POLICY "Allow anonymous insert pending_payments" ON pending_payments
  FOR INSERT WITH CHECK (true);

-- Allow authenticated admins to read and delete pending payments
CREATE POLICY "Allow authenticated read pending_payments" ON pending_payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete pending_payments" ON pending_payments
  FOR DELETE TO authenticated USING (true);


