-- ==============================================================================
-- GOODLIFE Radio 254 - Station Default Cover Artwork Customization
-- Adds default_cover_url to radio_settings
-- ==============================================================================

ALTER TABLE radio_settings
  ADD COLUMN IF NOT EXISTS default_cover_url VARCHAR(500);
