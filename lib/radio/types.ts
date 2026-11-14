export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type BroadcastMode = 'curated' | 'live' | 'autodj' | 'mania';
export type AudioQuality = 'standard' | 'high';

export interface RadioSet {
  id: number;
  event_id?: number | null;
  title: string;
  dj_name: string;
  audio_url?: string;
  playback_url?: string;
  audio_high_url?: string;
  r2_key?: string | null;
  r2_high_key?: string | null;
  cover_url: string;
  duration?: string;
  duration_sec: number;
  genre: string;
  file_size: number;
  file_size_high?: number;
  bitrate: number;
  bitrate_high?: number;
  source_type: 'r2' | 'stream' | 'external';
  external_id?: string | null;
  processing_status: ProcessingStatus;
  error_message?: string;
  display_order: number;
  is_active: boolean;
  play_count: number;
  bpm?: number | null;
  musical_key?: string | null;
  energy?: number | null;
  is_full_set?: boolean;
  key_source?: 'manual' | 'tunebat' | 'analyzed' | null;
  key_confidence?: number | null;
  bpm_confidence?: number | null;
  analysis_method?: string | null;
  analysis_version?: string | null;
  analyzed_at?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface RadioSettings {
  broadcast_mode: BroadcastMode;
  live_stream_url: string;
  live_title: string;
  live_fallback_set_id?: number | null;
  last_heartbeat: string;
  updated_at: string;
}

export interface RadioBroadcastSchedule {
  active_index: number;
  active_set_id: number;
  offset_sec: number;
  server_time: number;
  total_duration_sec: number;
}

export interface RadioDrop {
  id: string;
  title: string;
  audio_url: string;
  playback_url?: string;
  theme?: string;
  persona?: string;
  mood?: string;
  script?: string;
  target_track_id?: number | string;
  target_track_title?: string;
  target_artist?: string;
}

export interface RadioPublicState {
  mode: BroadcastMode;
  live: {
    title: string;
    stream_url: string;
    fallback_set: RadioSet | null;
  };
  broadcast?: RadioBroadcastSchedule | null;
  sets: RadioSet[];
  drops?: RadioDrop[];
}

export interface IngestJobTrack {
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface LiveNowPlayingTrack {
  title: string;
  artist?: string;
  genre?: string;
  thumbnail?: string;
  audio_url?: string;
  playback_url?: string;
  duration?: number;
  duration_sec?: number;
  elapsed?: number;
  video_id?: string;
  thought?: string;
  theme?: string;
  daypart?: string;
  provenance?: string;
  state?: string;
  listeners?: {
    total: number;
    unique?: number;
  };
}

export interface LiveQueueItem {
  video_id?: string;
  id?: number | string;
  title: string;
  artist: string;
  duration?: number;
  duration_sec?: number;
  thumbnail?: string;
  audio_url?: string;
  playback_url?: string;
  dj_note?: string;
  provenance?: string;
}

export interface LiveHistoryItem {
  video_id?: string;
  title: string;
  artist?: string;
  genre?: string;
  played_at: string;
}

export interface RadioLiveBffResponse {
  offline: boolean;
  stale: boolean;
  reason?: string;
  mode?: string;
  playlist_id?: number | null;
  playlist_name?: string | null;
  now_playing: LiveNowPlayingTrack | null;
  up_next: LiveQueueItem[];
  history: LiveHistoryItem[];
  live_drop?: {
    id: string | number;
    persona?: string;
    title?: string;
    script?: string;
    audio_url: string;
    playback_url?: string;
    fired_at?: string;
    age_seconds?: number;
  } | null;
  target_duration_sec?: number;
  listeners_count?: number;
  on_air_slot?: any;
}

export type PresenterStatus = 'pending' | 'active' | 'suspended';

export interface Presenter {
  id: number;
  full_name: string;
  dj_name: string;
  slug: string;
  email: string;
  phone?: string | null;
  password_hash?: string;
  must_change_password: boolean;
  bio?: string | null;
  avatar_url?: string | null;
  social_links?: Record<string, string>;
  stream_key_hash?: string | null;
  stream_key_prefix?: string | null;
  status: PresenterStatus;
  failed_login_count: number;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
}

export type ShowRecurrencePattern = 'none' | 'daily' | 'weekly' | 'biweekly';

export interface Show {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  genre: string;
  cover_image_url?: string | null;
  primary_presenter_id: number;
  primary_presenter?: Presenter;
  default_duration_min: number;
  recurrence_pattern: ShowRecurrencePattern;
  recurrence_days: string[];
  default_start_time: string; // "HH:MM:SS" (Africa/Nairobi)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SlotStatus = 'scheduled' | 'warmup' | 'live' | 'completed' | 'cancelled' | 'noshow';

export interface ShowSlot {
  id: number;
  show_id: number;
  show?: Show;
  presenter_id: number;
  presenter?: Presenter;
  substitute_presenter_id?: number | null;
  substitute_presenter?: Presenter | null;
  starts_at: string; // ISO 8601 UTC
  ends_at: string;   // ISO 8601 UTC
  status: SlotStatus;
  notes?: string | null;
  generated_from_recurrence: boolean;
  created_at: string;
  updated_at: string;
}

