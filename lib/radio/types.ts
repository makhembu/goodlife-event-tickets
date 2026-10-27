export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type BroadcastMode = 'curated' | 'live';
export type AudioQuality = 'standard' | 'high';

export interface RadioSet {
  id: number;
  event_id?: number | null;
  title: string;
  dj_name: string;
  audio_url: string;
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
  theme?: string;
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

export interface IngestJob {
  job_id: string;
  playlist_title?: string;
  total_tracks: number;
  completed_tracks: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  tracks: IngestJobTrack[];
  created_at: string;
  updated_at: string;
}
