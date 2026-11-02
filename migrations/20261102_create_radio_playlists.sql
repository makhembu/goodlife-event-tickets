-- GOODLIFE Radio Playlists Migration
-- Tracks and orderable playlists with single-active broadcast constraint

CREATE TABLE IF NOT EXISTS radio_playlists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  cover_url TEXT,
  genre VARCHAR(100) DEFAULT 'Amapiano',
  is_public BOOLEAN DEFAULT true,
  is_broadcast_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Partial unique index: at most ONE playlist can have is_broadcast_active = true among active playlists
CREATE UNIQUE INDEX IF NOT EXISTS idx_radio_playlists_single_active 
ON radio_playlists (is_broadcast_active) 
WHERE is_broadcast_active = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS radio_playlist_tracks (
  id SERIAL PRIMARY KEY,
  playlist_id INT NOT NULL REFERENCES radio_playlists(id) ON DELETE CASCADE,
  track_id INT NOT NULL REFERENCES radio_sets(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_radio_playlist_tracks_pos 
ON radio_playlist_tracks (playlist_id, position ASC);
