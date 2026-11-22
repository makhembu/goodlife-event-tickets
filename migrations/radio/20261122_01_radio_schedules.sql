-- Migration: 20261122_01_radio_schedules.sql
-- Description: Timed scheduling for songs and soundboard drops with recurrence, soft queues, and cue markers.

CREATE TABLE IF NOT EXISTS radio_schedules (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('track', 'drop')),
  target_id VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  artist_or_persona VARCHAR(150),
  audio_url TEXT NOT NULL,
  cover_url TEXT,
  duration_sec INT DEFAULT 0,
  
  trigger_type VARCHAR(30) NOT NULL CHECK (trigger_type IN ('clock_soft', 'clock_duck', 'song_cue', 'next_transition')),
  scheduled_for TIMESTAMPTZ,              -- Used for clock triggers (UTC)
  cue_offset_sec INT,                     -- Seconds into track (or negative for outro window)
  parent_track_id VARCHAR(100),           -- Target track for 'song_cue'
  recurrence VARCHAR(20) NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'hourly', 'daily', 'weekly')),
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'armed', 'executed', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  created_by VARCHAR(100) DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_radio_schedules_pending ON radio_schedules(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_radio_schedules_parent_track ON radio_schedules(parent_track_id) WHERE status = 'pending';
