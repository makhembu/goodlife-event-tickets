const { Pool } = require('pg');

async function createPosTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const sql = `
-- 1. Master Vendors Directory
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_phone TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- 2. Per-Event Vendor Assignments & Commission Contracts
CREATE TABLE IF NOT EXISTS vendor_event_assignments (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  commission_rate NUMERIC DEFAULT 0,       -- percentage, e.g. 10.0 = 10%
  flat_fee NUMERIC DEFAULT 0,              -- fixed booth fee in KES
  status TEXT DEFAULT 'active',            -- 'active', 'settled', 'closed'
  total_sales NUMERIC DEFAULT 0,           -- denormalized sales counter
  commission_owed NUMERIC DEFAULT 0,       -- calculated commission
  settled_amount NUMERIC DEFAULT 0,        -- amount paid to organizer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_vea_event_vendor ON vendor_event_assignments(event_id, vendor_id);

-- 3. Individual Stall Operators & PIN Credentials
CREATE TABLE IF NOT EXISTS vendor_operators (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,                       -- 4-digit PIN
  role TEXT DEFAULT 'cashier',             -- 'cashier', 'manager'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Notice: PIN uniqueness per active operator ensures no conflicting logins
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_pin ON vendor_operators(pin) WHERE is_active = TRUE;

-- 4. Vendor Products, Menu Catalog & Stock Management
CREATE TABLE IF NOT EXISTS vendor_items (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  price NUMERIC NOT NULL,
  stock_qty INTEGER DEFAULT NULL,          -- NULL represents infinite/untracked stock
  low_stock_threshold INTEGER DEFAULT 5,
  image_url TEXT DEFAULT '',
  modifiers JSONB DEFAULT '[]',            -- list of { name: string, price_add: number }
  is_available BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_vendor_items_stall ON vendor_items(vendor_id, event_id);

-- 5. POS Master Sales Record
CREATE TABLE IF NOT EXISTS pos_sales (
  id TEXT PRIMARY KEY,                     -- 'POS-{timestamp}-{random4}'
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  operator_id INTEGER REFERENCES vendor_operators(id),
  subtotal NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  payment_status TEXT DEFAULT 'completed', -- 'completed', 'voided', 'partial'
  voided_by INTEGER REFERENCES vendor_operators(id),
  void_reason TEXT DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_vendor_event ON pos_sales(vendor_id, event_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_created ON pos_sales(created_at);

-- 6. POS Line Items
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id SERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES vendor_items(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  modifiers JSONB DEFAULT '[]',
  line_total NUMERIC NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON pos_sale_items(sale_id);

-- 7. Flexible Multi-Payer Split Payments
CREATE TABLE IF NOT EXISTS pos_split_payments (
  id SERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,                    -- 'cash', 'mpesa', 'tab'
  amount NUMERIC NOT NULL,
  payer_name TEXT DEFAULT '',
  payer_phone TEXT DEFAULT '',
  mpesa_ref TEXT DEFAULT '',
  tab_id INTEGER,                          -- foreign key to customer_tabs (added manually below)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_split_payments_sale ON pos_split_payments(sale_id);

-- 8. Customer Credit Tabs
CREATE TABLE IF NOT EXISTS customer_tabs (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  credit_limit NUMERIC DEFAULT 5000,
  balance NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open',              -- 'open', 'settled', 'written_off'
  settlement_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_tabs_vendor_event ON customer_tabs(vendor_id, event_id);

-- Add the missing foreign key constraint to pos_split_payments for tab_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pos_split_payments_tab_id_fkey'
  ) THEN
    ALTER TABLE pos_split_payments ADD CONSTRAINT pos_split_payments_tab_id_fkey FOREIGN KEY (tab_id) REFERENCES customer_tabs(id);
  END IF;
END $$;

-- 9. Tab Transaction Ledger
CREATE TABLE IF NOT EXISTS tab_transactions (
  id SERIAL PRIMARY KEY,
  tab_id INTEGER NOT NULL REFERENCES customer_tabs(id) ON DELETE CASCADE,
  sale_id TEXT REFERENCES pos_sales(id),
  type TEXT NOT NULL,                      -- 'charge' or 'payment'
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT '',                  -- 'cash', 'mpesa'
  mpesa_ref TEXT DEFAULT '',
  operator_id INTEGER REFERENCES vendor_operators(id),
  ordered_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tab_txns_tab ON tab_transactions(tab_id);

-- 10. Event Lifecycle & Scheduled Sales Columns (Add to events table)
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'live'; -- 'scheduled', 'live', 'closed', 'archived'
ALTER TABLE events ADD COLUMN IF NOT EXISTS sales_open_date TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sales_close_date TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS next_event_title TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS recap_video_url TEXT DEFAULT '';

-- 10a. Column migrations for EXISTING deployments: CREATE TABLE IF NOT EXISTS
-- does nothing when the table already exists, so these columns must be added
-- idempotently for pre-tab-system databases.
ALTER TABLE customer_tabs ADD COLUMN IF NOT EXISTS settlement_reason TEXT DEFAULT '';
ALTER TABLE tab_transactions ADD COLUMN IF NOT EXISTS ordered_by TEXT DEFAULT '';

-- 10b. Idempotent tab-payment ledger: prevents double-crediting a tab with the
-- same M-Pesa receipt (webhook vs polling race protection).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tab_txns_mpesa_ref
  ON tab_transactions (tab_id, mpesa_ref)
  WHERE mpesa_ref IS NOT NULL AND mpesa_ref <> '';

-- 11. Early-Bird WhatsApp Drop Waitlist
CREATE TABLE IF NOT EXISTS event_waitlist (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(event_id, phone_number)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_event ON event_waitlist(event_id);

-- 12. Festival Photo Gallery Drops
CREATE TABLE IF NOT EXISTS event_gallery (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  tag TEXT DEFAULT 'CROWD',                -- 'CROWD', 'STAGE', 'VENDORS', 'CAMPFIRE'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gallery_event ON event_gallery(event_id);

-- 13. GOODLIFE Radio / Live DJ Sets Hub
CREATE TABLE IF NOT EXISTS radio_sets (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,                     -- e.g. "DJ Slick Live Sunset Set"
  dj_name TEXT NOT NULL,                   -- e.g. "DJ Slick"
  audio_url TEXT NOT NULL,                 -- MP3 or sound stream URL
  cover_url TEXT DEFAULT '',
  duration TEXT DEFAULT '1:45:00',
  genre TEXT DEFAULT 'Amapiano / Afrobeats',
  play_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
  `;

  try {
    console.log('Creating POS & Cultural Hub Tables...');
    await pool.query(sql);
    console.log('Tables created successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

createPosTables();
