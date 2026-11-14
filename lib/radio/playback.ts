import { extractR2Key } from "@/lib/r2-storage";

export type PlayableRow = {
  id: number | string;
  r2_key?: string | null;
  audio_url?: string | null;
  audio_high_url?: string | null;
  r2_high_key?: string | null;
  duration_sec?: number | null;
  duration?: number | string | null;
  [key: string]: any;
};

/**
 * Resolves the underlying Cloudflare R2 object key from a playable database row.
 * Returns null for live streams, upstream relay URLs, local /public/... paths, and blob: URLs.
 */
export function resolveR2Key(row: PlayableRow): string | null {
  if (row.r2_key) {
    const clean = row.r2_key.trim().replace(/^\/+/, "");
    return clean || null;
  }
  if (!row.audio_url) return null;
  const trimmed = row.audio_url.trim();
  // Pass through anything that is not one of our R2 objects
  if (trimmed.startsWith("/") || trimmed.startsWith("blob:")) return null;
  if (trimmed.startsWith("http") && !extractR2Key(trimmed)) return null;
  return extractR2Key(trimmed);
}

/**
 * Calculates playback URL TTL in seconds.
 * Bound to Math.min(86400, Math.max(3600, duration_sec + 600)).
 */
export function playbackTtlSec(row: PlayableRow): number {
  let dur = 0;
  if (typeof row.duration_sec === "number" && !isNaN(row.duration_sec)) {
    dur = row.duration_sec;
  } else if (typeof row.duration === "number" && !isNaN(row.duration)) {
    dur = row.duration;
  } else if (typeof row.duration === "string") {
    const parsed = parseInt(row.duration, 10);
    if (!isNaN(parsed) && parsed > 0) dur = parsed;
  }
  return Math.min(86400, Math.max(3600, (dur || 0) + 600));
}

/**
 * Returns the permanent, stable playback API endpoint for a track, recording, or drop.
 * e.g. /api/radio/audio/track/123
 */
export function stablePlaybackPath(
  row: PlayableRow,
  kind: "track" | "recording" | "drop"
): string | null {
  const key = resolveR2Key(row);
  if (!key) return null;
  return `/api/radio/audio/${kind}/${encodeURIComponent(String(row.id))}`;
}

export function isSignedPlaybackEnabled(): boolean {
  const envVal = process.env.RADIO_USE_SIGNED_PLAYBACK?.toLowerCase().trim();
  return envVal === "true" || envVal === "1";
}

/**
 * Maps a playable row into a public response object with playback_url,
 * stripping raw bucket keys and raw URLs.
 */
export function withPlayback<T extends PlayableRow>(
  row: T,
  kind: "track" | "recording" | "drop"
): T & { playback_url: string } {
  const stable = stablePlaybackPath(row, kind);
  const playbackUrl = stable || row.audio_url || "";

  const mapped: any = {
    ...row,
    playback_url: playbackUrl,
  };

  // If signed playback is active, or if stripping is requested, purge raw R2 bucket exposures
  const shouldStrip = isSignedPlaybackEnabled() || process.env.RADIO_USE_SIGNED_PLAYBACK !== "false";
  if (shouldStrip) {
    delete mapped.r2_key;
    delete mapped.r2_high_key;
    delete mapped.audio_high_url;
    if (stable) {
      delete mapped.audio_url;
    }
  }

  return mapped;
}
