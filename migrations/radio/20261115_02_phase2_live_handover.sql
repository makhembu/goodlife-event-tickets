-- ==============================================================================
-- GOODLIFE Radio 254 - Phase 2 Migration: Live Handover, Auth & Recordings
-- Tables: radio_connection_log, presenter_applications
-- Alters: presenters, show_slots, radio_recordings
-- Idempotent, safe, transaction-ready.
-- ==============================================================================

-- 1. Presenters Additions
ALTER TABLE presenters
    ADD COLUMN IF NOT EXISTS stream_key_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Show Slots Lifecycle Additions
ALTER TABLE show_slots
    ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS actual_ended_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS live_stream_title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS cover_requested BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cover_request_reason TEXT,
    ADD COLUMN IF NOT EXISTS cover_requested_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_show_slots_cover_req ON show_slots(cover_requested) WHERE (cover_requested = true);

-- 3. Link Existing radio_recordings to Shows & Presenters
-- Ensure table exists first if running standalone
CREATE TABLE IF NOT EXISTS radio_recordings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    dj_name VARCHAR(150) NOT NULL,
    audio_url VARCHAR(500) NOT NULL,
    r2_key VARCHAR(255),
    duration INTEGER NOT NULL DEFAULT 0,
    file_size BIGINT NOT NULL DEFAULT 0,
    bitrate INTEGER NOT NULL DEFAULT 320,
    genre VARCHAR(100) DEFAULT 'Live DJ Set',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE radio_recordings
    ADD COLUMN IF NOT EXISTS slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS show_id INTEGER REFERENCES shows(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS approved_by_id INTEGER,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_radio_recordings_presenter ON radio_recordings(presenter_id);
CREATE INDEX IF NOT EXISTS idx_radio_recordings_slot ON radio_recordings(slot_id);
CREATE INDEX IF NOT EXISTS idx_radio_recordings_public ON radio_recordings(is_public);

-- 4. Radio Connection Audit Log (Connect Authorization attempts)
CREATE TABLE IF NOT EXISTS radio_connection_log (
    id SERIAL PRIMARY KEY,
    presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL,
    slot_id INTEGER REFERENCES show_slots(id) ON DELETE SET NULL,
    username VARCHAR(100) NOT NULL,
    client_ip VARCHAR(64),
    allowed BOOLEAN NOT NULL,
    reason VARCHAR(255) NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_conn_log_time ON radio_connection_log(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_radio_conn_log_presenter ON radio_connection_log(presenter_id);

-- 5. Presenter Applications (Public Talent Intake)
CREATE TABLE IF NOT EXISTS presenter_applications (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    dj_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    bio TEXT NOT NULL,
    show_concept TEXT NOT NULL,
    genre VARCHAR(100),
    sample_mix_url VARCHAR(500) NOT NULL,
    social_links JSONB DEFAULT '{}'::jsonb,
    client_ip VARCHAR(64),
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presenter_apps_status ON presenter_applications(status);
CREATE INDEX IF NOT EXISTS idx_presenter_apps_email ON presenter_applications(email);
CREATE INDEX IF NOT EXISTS idx_presenter_apps_created ON presenter_applications(created_at DESC);
