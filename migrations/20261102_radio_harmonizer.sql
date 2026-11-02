-- Migration: Radio Harmonizer schema support
-- Adds musical metadata to radio_sets with strict constraints
-- Adds snapshots table for persistent undo

ALTER TABLE radio_sets
  ADD COLUMN IF NOT EXISTS bpm INTEGER,
  ADD COLUMN IF NOT EXISTS musical_key VARCHAR(10),
  ADD COLUMN IF NOT EXISTS energy SMALLINT,
  ADD COLUMN IF NOT EXISTS is_full_set BOOLEAN DEFAULT false;

-- Add check constraints safely if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_bpm'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_bpm 
      CHECK (bpm IS NULL OR (bpm >= 40 AND bpm <= 250));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_musical_key'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_musical_key 
      CHECK (musical_key IS NULL OR musical_key ~ '^(1[0-2]|[1-9])[AB]$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_energy'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_energy 
      CHECK (energy IS NULL OR (energy >= 1 AND energy <= 10));
  END IF;
END $$;

-- Table to store playlist order snapshots for rock-solid undo
CREATE TABLE IF NOT EXISTS radio_playlist_order_snapshots (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES radio_playlists(id) ON DELETE CASCADE,
  track_ids INTEGER[] NOT NULL,
  reason VARCHAR(50) DEFAULT 'harmonize',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playlist_snapshots_playlist 
  ON radio_playlist_order_snapshots(playlist_id, created_at DESC);
