-- Migration: 20261028_make_radio_plays_set_id_nullable.sql
-- Purpose: Adds live session duration telemetry to radio_plays without PII (no city, no visitor ID).
-- Stores session duration and server-side snapshot of the live track on air at receipt time.
-- DO NOT RUN AUTOMATICALLY ON NEON.

ALTER TABLE radio_plays 
  ALTER COLUMN set_id DROP NOT NULL,
  ALTER COLUMN session_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'vault',
  ADD COLUMN IF NOT EXISTS track_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS track_artist VARCHAR(255);

-- Verification query (DO NOT EXECUTE AUTOMATICALLY):
-- SELECT column_name, is_nullable, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'radio_plays';
