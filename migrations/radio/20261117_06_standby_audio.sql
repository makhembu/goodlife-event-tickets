-- ==============================================================================
-- GOODLIFE Radio 254 - Standby Audio Customization
-- Adds standby_audio_url to presenters and default_standby_audio_url to radio_settings
-- ==============================================================================

ALTER TABLE presenters
  ADD COLUMN IF NOT EXISTS standby_audio_url VARCHAR(500);

ALTER TABLE radio_settings
  ADD COLUMN IF NOT EXISTS default_standby_audio_url VARCHAR(500);
