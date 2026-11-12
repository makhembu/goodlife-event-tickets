-- ==============================================================================
-- GOODLIFE Radio Phase 5 Migrations: Ops, Money, Hardening & Attribution
-- ==============================================================================

-- 1. Radio Tips Table
-- Dedicated listener tips table. Status: pending, completed, failed, reversed.
-- Isolated from pending_payments to prevent any collision with ticket sales.
CREATE TABLE IF NOT EXISTS radio_tips (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(64) UNIQUE NOT NULL,       -- External reference e.g. TIP-A1B2C3D4
    amount NUMERIC(10, 2) NOT NULL,              -- Tip amount in KES
    phone VARCHAR(32) NOT NULL,                  -- Raw or normalized M-Pesa phone
    phone_hash VARCHAR(64),                      -- SHA-256 for rate limiting / anonymized lookups
    sender_name VARCHAR(128) NOT NULL,           -- Friendly listener name or "Anonymous"
    message TEXT,                                -- Optional cheer / message to the station / DJ
    slot_id INTEGER REFERENCES radio_show_slots(id) ON DELETE SET NULL,
    presenter_id INTEGER REFERENCES radio_presenters(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, completed, failed, reversed
    payhero_reference VARCHAR(64),               -- PayHero transaction ID
    mpesa_receipt VARCHAR(64),                   -- Safaricom M-Pesa receipt code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_radio_tips_ref ON radio_tips(reference);
CREATE INDEX IF NOT EXISTS idx_radio_tips_status ON radio_tips(status);
CREATE INDEX IF NOT EXISTS idx_radio_tips_presenter ON radio_tips(presenter_id);
CREATE INDEX IF NOT EXISTS idx_radio_tips_slot ON radio_tips(slot_id);
CREATE INDEX IF NOT EXISTS idx_radio_tips_created_at ON radio_tips(created_at DESC);

-- 2. Presenters Link to Staff / Operators (Additive)
-- Add nullable staff_id column to radio_presenters
ALTER TABLE radio_presenters 
ADD COLUMN IF NOT EXISTS staff_id INTEGER;

-- 3. Radio Sponsors Table
CREATE TABLE IF NOT EXISTS radio_sponsors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    logo_url TEXT,
    link_url TEXT,
    tagline VARCHAR(255),
    show_id INTEGER REFERENCES radio_shows(id) ON DELETE CASCADE,
    slot_id INTEGER REFERENCES radio_show_slots(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radio_sponsors_active ON radio_sponsors(is_active);
CREATE INDEX IF NOT EXISTS idx_radio_sponsors_show ON radio_sponsors(show_id);

-- 4. Radio Audit Logs Table
CREATE TABLE IF NOT EXISTS radio_audit_logs (
    id SERIAL PRIMARY KEY,
    admin_actor VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'superadmin',
    action VARCHAR(128) NOT NULL,                -- e.g. "revoke_key", "regenerate_key", "force_disconnect", "edit_schedule"
    target_type VARCHAR(64) NOT NULL,            -- e.g. "presenter", "slot", "sponsor", "stream"
    target_id VARCHAR(64),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_radio_audit_logs_created_at ON radio_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radio_audit_logs_actor ON radio_audit_logs(admin_actor);
