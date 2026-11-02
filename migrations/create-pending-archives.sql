-- ==============================================================================
-- GOODLIFE Radio 254 - Pending Archives Recovery Queue
-- Tracks every DJ session archival attempt; survives R2/DB outages.
-- Migration: scripts/migrations/create-pending-archives.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS pending_archives (
    id SERIAL PRIMARY KEY,
    local_path VARCHAR(1000) NOT NULL,
    -- status: pending -> uploading -> complete | failed
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'uploading', 'complete', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_attempted_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    recording_id INTEGER REFERENCES radio_recordings(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_archives_status ON pending_archives(status);
CREATE INDEX IF NOT EXISTS idx_pending_archives_retry ON pending_archives(status, retry_count)
    WHERE status IN ('pending', 'failed') AND retry_count < 10;
