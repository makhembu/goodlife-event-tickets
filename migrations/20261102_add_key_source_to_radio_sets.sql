-- Migration: Add provenance column key_source to radio_sets
ALTER TABLE radio_sets
  ADD COLUMN IF NOT EXISTS key_source VARCHAR(20) DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_radio_sets_key_source'
  ) THEN
    ALTER TABLE radio_sets ADD CONSTRAINT chk_radio_sets_key_source
      CHECK (key_source IS NULL OR key_source IN ('manual', 'tunebat', 'analyzed'));
  END IF;
END $$;
