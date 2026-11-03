-- Migration: Add Music Intelligence Columns to radio_sets
-- Phase 6: Database Architecture Enhancement

ALTER TABLE radio_sets
  ADD COLUMN IF NOT EXISTS key_confidence REAL,
  ADD COLUMN IF NOT EXISTS bpm_confidence REAL,
  ADD COLUMN IF NOT EXISTS analysis_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS analysis_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Constraints to maintain clean data invariants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_key_confidence'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_key_confidence
      CHECK (key_confidence IS NULL OR (key_confidence >= 0.0 AND key_confidence <= 1.0));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_bpm_confidence'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_bpm_confidence
      CHECK (bpm_confidence IS NULL OR (bpm_confidence >= 0.0 AND bpm_confidence <= 1.0));
  END IF;
END $$;
