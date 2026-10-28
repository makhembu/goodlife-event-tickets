export type RadioDropType =
  | "event_countdown"
  | "ticket_push"
  | "recurring_tease"
  | "happening_now"
  | "next_track_tease"
  | "time_check"
  | "station_id"
  | "generic_station";

export type RadioDaypart = "morning" | "afternoon" | "peak_evening" | "deep_overnight";

export interface RadioPersonaConfig {
  id: string;
  name: string;
  voice_id: string;
  style: string;
  dayparts: RadioDaypart[];
  energy_range: [number, number];
  tags: string[];
}

export interface DropVerifiedFacts {
  station_callout: string;
  daypart: RadioDaypart;
  persona: string;
  current_genre?: string;
  next_track?: {
    id?: number;
    title: string;
    artist: string;
    genre?: string;
  };
  event?: {
    id: number;
    name_spoken: string;
    venue_spoken: string | null;
    countdown_phrase: string;
    gates_open_phrase: string | null;
    spoken_ticket_url: string;
    tiers: Array<{ name: string; price: number; price_spoken: string }>;
    lineup: string[];
    promo_blurb?: string | null;
    facts_hash: string;
    valid_until: Date | number;
  };
  coarse_time_phrase?: string;
}

export interface DropValidationResult {
  valid: boolean;
  errors: string[];
  parsedJson?: {
    tag: string;
    text: string;
  };
}

export interface GeneratedDropRecord {
  id: string;
  drop_type: RadioDropType;
  persona_id: string;
  persona_name: string;
  voice_id: string;
  tag: string;
  script: string;
  audio_url: string;
  duration_sec?: number;
  event_id?: number | null;
  facts_hash?: string | null;
  valid_until: Date;
  target_track_id?: number | null;
  created_at: Date;
  provider: "groq" | "nvidia" | "pollinations" | "generic_library";
  model_id: string;
  latency_ms: number;
  is_generic_fallback: boolean;
}

export interface GateVerificationResult {
  allowed: boolean;
  reason: "valid" | "expired_valid_until" | "facts_hash_mismatch" | "event_cancelled" | "db_offline_stale" | "track_mismatch";
  final_drop: GeneratedDropRecord;
}
