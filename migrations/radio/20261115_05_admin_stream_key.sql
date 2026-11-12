-- ==============================================================================
-- GOODLIFE Radio 254 - Migration: Admin Master Live Stream Key & Takeover
-- Adds admin_stream_key_hash and admin_stream_key_prefix to radio_settings
-- ==============================================================================

ALTER TABLE radio_settings
    ADD COLUMN IF NOT EXISTS admin_stream_key_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS admin_stream_key_prefix VARCHAR(32);
