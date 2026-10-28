/**
 * GOODLIFE Radio 254: Track Sequencer & BPM Normalization Engine
 * Implements Section 7.3 and Section 7.4 of RADIO-SPECIFICATION.md
 */

export interface TrackMetadata {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  key: string; // Camelot format, e.g. "8A", "11B"
  energy: number; // 1 to 10
  genre?: string;
  duration_seconds: number;
  intro_seconds?: number;
  hook_note?: string;
  needs_review?: boolean;
}

export interface BpmNormalizationResult {
  bpm: number;
  needs_review: boolean;
  reason?: string;
}

export type DaypartEnergyCurve = {
  min: number;
  max: number;
};

/**
 * Section 7.3: Genre-Specific BPM Normalization Rules
 * Candidates: {x / 2, x, 2x}.
 * Pick candidate that falls within the genre's window.
 * If none or several qualify, flag needs_review = true.
 */
export const GENRE_BPM_WINDOWS: Record<string, { min: number; max: number }> = {
  amapiano: { min: 108, max: 115 },
  gengetone: { min: 90, max: 105 },
  arbantone: { min: 90, max: 105 },
  drill: { min: 140, max: 145 }, // Often detected at ~70, folded to 140-145
  afropop: { min: 100, max: 112 },
  "afro-tech": { min: 120, max: 124 },
  "deep house": { min: 120, max: 124 },
  classics: { min: 95, max: 110 },
  rhumba: { min: 95, max: 110 },
};

export function normalizeTrackBpm(rawBpm: number, genre?: string): BpmNormalizationResult {
  if (!rawBpm || rawBpm <= 0) {
    return { bpm: 0, needs_review: true, reason: "Invalid raw BPM" };
  }

  const normalizedGenre = genre?.trim().toLowerCase();
  const window = normalizedGenre ? GENRE_BPM_WINDOWS[normalizedGenre] : undefined;

  // Candidates: half-time, normal, double-time
  const candidates = [rawBpm / 2, rawBpm, rawBpm * 2];

  if (window) {
    const validCandidates = candidates.filter((c) => c >= window.min && c <= window.max);

    if (validCandidates.length === 1) {
      return { bpm: Math.round(validCandidates[0]), needs_review: false };
    }

    // Gengetone detected at 70: candidates are 35, 70, 140. None are in [90, 105]!
    // Specification invariant: Gengetone at 70 is flagged, not silently doubled to 140!
    if (validCandidates.length === 0) {
      return {
        bpm: rawBpm,
        needs_review: true,
        reason: `No candidate {x/2, x, 2x} fell in ${normalizedGenre} window [${window.min}-${window.max}]`,
      };
    }

    return {
      bpm: rawBpm,
      needs_review: true,
      reason: `Multiple candidates fell in ${normalizedGenre} window [${window.min}-${window.max}]`,
    };
  }

  // General fold for tracks with no genre: 85 to 135
  const generalCandidates = candidates.filter((c) => c >= 85 && c <= 135);
  if (generalCandidates.length === 1) {
    return { bpm: Math.round(generalCandidates[0]), needs_review: false };
  }

  if (generalCandidates.length > 1) {
    // If multiple qualify in general window, choose the one closest to 115
    const closest = generalCandidates.reduce((prev, curr) =>
      Math.abs(curr - 115) < Math.abs(prev - 115) ? curr : prev
    );
    return { bpm: Math.round(closest), needs_review: false };
  }

  return { bpm: rawBpm, needs_review: true, reason: "BPM fell outside general window [85-135]" };
}

/**
 * Camelot Wheel Distance Calculation
 * Allowed transitions: distance <= 1 (e.g. 8A to 7A, 8A, 9A, or 8B)
 */
export function isCamelotCompatible(keyA: string, keyB: string): boolean {
  if (!keyA || !keyB) return true; // Relax if keys are not tagged

  const parse = (k: string) => {
    const m = k.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
    if (!m) return null;
    return { num: parseInt(m[1], 10), letter: m[2] };
  };

  const a = parse(keyA);
  const b = parse(keyB);
  if (!a || !b) return true;

  // Same key
  if (a.num === b.num && a.letter === b.letter) return true;

  // Same number, opposite letter (e.g. 8A <-> 8B)
  if (a.num === b.num && a.letter !== b.letter) return true;

  // Adjacent number (+/- 1 around the 12-hour wheel), same letter
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return true; // 12 and 1 are adjacent
  }

  return false;
}

/**
 * Section 7.4: Daypart Energy Curves
 * 06:00-12:00: energy 3 to 5
 * 12:00-18:00: energy 6 to 8
 * 18:00-00:00: energy 8 to 10
 * 00:00-06:00: energy 5 to 7
 * Festival mode override: 8 to 10 across all dayparts
 */
export function getTargetEnergyCurve(
  now = new Date(),
  festivalMode = false
): DaypartEnergyCurve {
  if (festivalMode) {
    return { min: 8, max: 10 };
  }

  const eatHour = (now.getUTCHours() + 3) % 24;
  if (eatHour >= 6 && eatHour < 12) return { min: 3, max: 5 };
  if (eatHour >= 12 && eatHour < 18) return { min: 6, max: 8 };
  if (eatHour >= 18 && eatHour < 24) return { min: 8, max: 10 };
  return { min: 5, max: 7 };
}

export interface SequencerHistoryItem {
  trackId: number;
  artist: string;
  playedAt: number; // epoch ms
}

/**
 * Section 7.4 Rule-based Sequencer:
 * Picks next track respecting:
 * - Camelot distance <= 1
 * - Tempo window +/- 6%
 * - No artist repeat within N tracks (default 4)
 * - No track repeat within 4 hours (14,400,000 ms)
 * - Daypart energy curve (or festival mode override)
 */
export function selectNextTrack(
  pool: TrackMetadata[],
  currentTrack: TrackMetadata | null,
  history: SequencerHistoryItem[],
  now = new Date(),
  options: {
    festivalMode?: boolean;
    artistRepeatSpacing?: number;
    trackRepeatHours?: number;
  } = {}
): TrackMetadata | null {
  if (!pool || pool.length === 0) return null;

  const artistSpacing = options.artistRepeatSpacing ?? 4;
  const trackCooldownMs = (options.trackRepeatHours ?? 4) * 3600 * 1000;
  const nowMs = now.getTime();

  // History filtering
  const recentTracks = history.filter((h) => nowMs - h.playedAt < trackCooldownMs);
  const playedTrackIds = new Set(recentTracks.map((h) => h.trackId));

  const recentArtists = history
    .slice(-artistSpacing)
    .map((h) => h.artist.toLowerCase());
  const recentArtistSet = new Set(recentArtists);

  const energyCurve = getTargetEnergyCurve(now, options.festivalMode);

  // Score candidate tracks
  const scored = pool
    .filter((track) => !playedTrackIds.has(track.id))
    .filter((track) => !recentArtistSet.has(track.artist.toLowerCase()))
    .map((track) => {
      let score = 100;

      // 1. Energy alignment
      if (track.energy >= energyCurve.min && track.energy <= energyCurve.max) {
        score += 30;
      } else {
        const energyDiff = Math.min(
          Math.abs(track.energy - energyCurve.min),
          Math.abs(track.energy - energyCurve.max)
        );
        score -= energyDiff * 15;
      }

      // 2. Tempo and Camelot (if current track exists)
      if (currentTrack) {
        // Tempo window: +/- 6%
        const tempoDiffRatio = Math.abs(track.bpm - currentTrack.bpm) / currentTrack.bpm;
        if (tempoDiffRatio <= 0.06) {
          score += 25;
        } else if (tempoDiffRatio <= 0.12) {
          score += 5;
        } else {
          score -= 20;
        }

        // Camelot key transition
        if (isCamelotCompatible(currentTrack.key, track.key)) {
          score += 25;
        } else {
          score -= 15;
        }
      }

      return { track, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored[0].track;
  }

  // Fallback: relax artist spacing if pool is exhausted
  const relaxed = pool
    .filter((track) => !playedTrackIds.has(track.id))
    .sort((a, b) => b.energy - a.energy);

  return relaxed[0] || pool[0];
}
