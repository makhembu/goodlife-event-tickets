-- Rollback: Remove Music Intelligence Columns from radio_sets
-- Phase 6: Rollback Strategy

ALTER TABLE radio_sets
  DROP CONSTRAINT IF EXISTS chk_radio_sets_key_confidence,
  DROP CONSTRAINT IF EXISTS chk_radio_sets_bpm_confidence;

ALTER TABLE radio_sets
  DROP COLUMN IF EXISTS key_confidence,
  DROP COLUMN IF EXISTS bpm_confidence,
  DROP COLUMN IF EXISTS analysis_method,
  DROP COLUMN IF EXISTS analysis_version,
  DROP COLUMN IF EXISTS analyzed_at;
