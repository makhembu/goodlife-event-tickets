export interface RadioPlayoutDbCache {
  settings: {
    broadcast_mode?: string;
    active_set_id?: string | number | null;
    active_started_at?: string | null;
    queued_next_set_id?: string | number | null;
    ai_drops_enabled?: boolean;
    live_title?: string;
    live_stream_url?: string;
    is_reconnecting?: boolean;
    grace_ends_at?: string | null;
    ended_reason?: "dropped" | "ended" | null;
  };
  sets: any[];
  activatedAt: string | null;
  activePlaylistName: string | null;
  activePlaylistId: number | null;
  timestamp: number;
}

let _dbPlayoutCache: RadioPlayoutDbCache | null = null;

export function getPlayoutCache(): RadioPlayoutDbCache | null {
  return _dbPlayoutCache;
}

export function setPlayoutCache(cache: RadioPlayoutDbCache | null) {
  _dbPlayoutCache = cache;
}

export function invalidateLivePlayoutCache() {
  _dbPlayoutCache = null;
}

let _stateDbCache: any = null;

export function getStateDbCache(): any {
  return _stateDbCache;
}

export function setStateDbCache(cache: any) {
  _stateDbCache = cache;
}

export function invalidateRadioStateCache() {
  _stateDbCache = null;
}
