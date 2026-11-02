-- Migration: 20261028_add_radio_enabled_to_radio_settings.sql
-- Purpose: Adds the runtime kill switch for the Goodlife Radio playout system.
-- When radio_enabled is false, the client-side radio engine completely suspends audio,
-- stops metadata polling, avoids loading hls.js, and displays the station in an inert/offline state.

ALTER TABLE radio_settings
ADD COLUMN IF NOT EXISTS radio_enabled BOOLEAN NOT NULL DEFAULT true;

-- Verification query (DO NOT EXECUTE AUTOMATICALLY):
-- SELECT id, broadcast_mode, radio_enabled, live_stream_url FROM radio_settings WHERE id = 1;
