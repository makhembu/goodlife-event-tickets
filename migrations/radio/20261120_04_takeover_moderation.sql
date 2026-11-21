-- Migration: Add presenter_id and is_flagged to radio_shoutouts for live DJ takeover moderation
ALTER TABLE radio_shoutouts ADD COLUMN IF NOT EXISTS presenter_id INTEGER REFERENCES presenters(id) ON DELETE SET NULL;
ALTER TABLE radio_shoutouts ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE radio_shoutouts ADD COLUMN IF NOT EXISTS request_status VARCHAR(20) DEFAULT NULL; -- 'queued', 'played', 'declined'

CREATE INDEX IF NOT EXISTS idx_radio_shoutouts_presenter ON radio_shoutouts(presenter_id);
