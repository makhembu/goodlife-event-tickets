-- ==============================================================================
-- GOODLIFE Radio 254 - Phase 1 Migration
-- Tables: presenters, shows, show_slots
-- Idempotent, safe, transaction-ready.
-- ==============================================================================

-- 1. Presenters Table
CREATE TABLE IF NOT EXISTS presenters (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    dj_name VARCHAR(150) NOT NULL,
    slug VARCHAR(160) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT true,
    bio TEXT,
    avatar_url VARCHAR(500),
    social_links JSONB DEFAULT '{}'::jsonb,
    stream_key_hash VARCHAR(255),
    stream_key_prefix VARCHAR(16),
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presenters_slug ON presenters(slug);
CREATE INDEX IF NOT EXISTS idx_presenters_status ON presenters(status);
CREATE INDEX IF NOT EXISTS idx_presenters_email ON presenters(email);

-- 2. Shows Table
CREATE TABLE IF NOT EXISTS shows (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,
    description TEXT,
    genre VARCHAR(100) DEFAULT 'Eclectic',
    cover_image_url VARCHAR(500),
    primary_presenter_id INTEGER NOT NULL REFERENCES presenters(id) ON DELETE CASCADE,
    default_duration_min INTEGER NOT NULL DEFAULT 120,
    recurrence_pattern VARCHAR(30) DEFAULT 'weekly' CHECK (recurrence_pattern IN ('none', 'daily', 'weekly', 'biweekly')),
    recurrence_days TEXT[] DEFAULT ARRAY['Friday']::TEXT[],
    default_start_time TIME WITHOUT TIME ZONE DEFAULT '20:00:00',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shows_slug ON shows(slug);
CREATE INDEX IF NOT EXISTS idx_shows_presenter ON shows(primary_presenter_id);
CREATE INDEX IF NOT EXISTS idx_shows_active ON shows(is_active);

-- 3. Show Slots Table (The Single Broadcast Channel Timetable)
CREATE TABLE IF NOT EXISTS show_slots (
    id SERIAL PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    presenter_id INTEGER NOT NULL REFERENCES presenters(id) ON DELETE CASCADE,
    substitute_presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled' 
        CHECK (status IN ('scheduled', 'warmup', 'live', 'completed', 'cancelled', 'noshow')),
    notes TEXT,
    generated_from_recurrence BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_slot_ends_after_starts CHECK (ends_at > starts_at),
    CONSTRAINT uq_show_slot_time UNIQUE (show_id, starts_at)
);

CREATE INDEX IF NOT EXISTS idx_show_slots_window ON show_slots(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_show_slots_status ON show_slots(status);
CREATE INDEX IF NOT EXISTS idx_show_slots_presenter ON show_slots(presenter_id);
CREATE INDEX IF NOT EXISTS idx_show_slots_show ON show_slots(show_id);

-- 4. Database Exclusion Constraint for Single Channel Overlaps (if btree_gist is available)
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_non_cancelled_slots'
        ) THEN
            ALTER TABLE show_slots 
            ADD CONSTRAINT no_overlapping_non_cancelled_slots 
            EXCLUDE USING gist (
                tstzrange(starts_at, ends_at) WITH &&
            ) WHERE (status != 'cancelled');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Notice: btree_gist extension or exclusion constraint could not be created: %. Application-level transaction overlap checks will be the primary guard.', SQLERRM;
    END;
END $$;
