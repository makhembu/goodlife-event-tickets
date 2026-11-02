-- ==============================================================================
-- GOODLIFE Radio 254 - Radio Recordings Table (Neon PostgreSQL)
-- Tracks mastered DJ session recordings archived to Cloudflare R2
-- Migration File: scripts/migrations/create-radio-recordings.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS radio_recordings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    dj_name VARCHAR(255) NOT NULL DEFAULT 'Resident DJ',
    audio_url VARCHAR(500) NOT NULL,
    r2_key VARCHAR(500) NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0, -- Duration in seconds
    file_size BIGINT NOT NULL DEFAULT 0, -- File size in bytes
    bitrate INTEGER NOT NULL DEFAULT 320, -- Audio bitrate (e.g. 320kbps)
    genre VARCHAR(100) DEFAULT 'Festival Live Set',
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for rapid query performance in the Festival Set Vault
CREATE INDEX IF NOT EXISTS idx_radio_recordings_recorded_at ON radio_recordings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_radio_recordings_is_public ON radio_recordings(is_public);
CREATE INDEX IF NOT EXISTS idx_radio_recordings_event_id ON radio_recordings(event_id);
