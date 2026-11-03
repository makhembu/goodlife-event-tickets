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

export type CamelotRelation = 'exact' | 'relative' | 'adjacent' | 'energy_boost' | 'clash';

export function getCamelotRelation(keyA: string, keyB: string): CamelotRelation {
  if (!keyA || !keyB) return 'clash';

  const parse = (k: string) => {
    const m = k.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
    if (!m) return null;
    return { num: parseInt(m[1], 10), letter: m[2] };
  };

  const a = parse(keyA);
  const b = parse(keyB);
  if (!a || !b) return 'clash';

  // Exact same key (e.g. 8A -> 8A)
  if (a.num === b.num && a.letter === b.letter) return 'exact';

  // Relative major/minor (e.g. 8A -> 8B)
  if (a.num === b.num && a.letter !== b.letter) return 'relative';

  // Adjacent step (+/- 1 around the 12-hour wheel)
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return 'adjacent';
    // Energy boost: modulation up by 1 semitone (+7 on circle of fifths) or +2 on Camelot wheel
    if ((a.num + 2 - 1) % 12 + 1 === b.num || (a.num + 7 - 1) % 12 + 1 === b.num) {
      return 'energy_boost';
    }
  }

  return 'clash';
}

export interface TempoRelationResult {
  compatible: boolean;
  relation: 'exact' | 'close' | 'half_time' | 'double_time' | 'clash';
  deltaPercent: number;
}

export function evaluateTempoRelation(bpmA: number, bpmB: number): TempoRelationResult {
  if (!bpmA || !bpmB || bpmA <= 0 || bpmB <= 0) {
    return { compatible: false, relation: 'clash', deltaPercent: 0 };
  }

  const directDelta = ((bpmB - bpmA) / bpmA) * 100;
  const absDelta = Math.abs(directDelta);

  if (absDelta <= 0.5) {
    return { compatible: true, relation: 'exact', deltaPercent: Math.round(directDelta * 10) / 10 };
  }

  if (absDelta <= 6.0) {
    return { compatible: true, relation: 'close', deltaPercent: Math.round(directDelta * 10) / 10 };
  }

  // Check half-time (e.g. 140 -> 70, or 120 -> 60)
  const halfBpmA = bpmA / 2;
  const halfDelta = Math.abs((bpmB - halfBpmA) / halfBpmA) * 100;
  if (halfDelta <= 6.0) {
    return { compatible: true, relation: 'half_time', deltaPercent: Math.round(halfDelta * 10) / 10 };
  }

  // Check double-time (e.g. 70 -> 140, or 60 -> 120)
  const doubleBpmA = bpmA * 2;
  const doubleDelta = Math.abs((bpmB - doubleBpmA) / doubleBpmA) * 100;
  if (doubleDelta <= 6.0) {
    return { compatible: true, relation: 'double_time', deltaPercent: Math.round(doubleDelta * 10) / 10 };
  }

  return { compatible: false, relation: 'clash', deltaPercent: Math.round(directDelta * 10) / 10 };
}

export interface DjTransitionScore {
  score: number;
  harmonicRelation: CamelotRelation;
  tempoRelation: TempoRelationResult['relation'];
  isCompatible: boolean;
  reasons: string[];
}

export function scoreDjTransition(prev: TrackMetadata, next: TrackMetadata): DjTransitionScore {
  let score = 100;
  const reasons: string[] = [];

  // 1. Harmonic Compatibility
  const hRel = getCamelotRelation(prev.key, next.key);
  switch (hRel) {
    case 'exact':
      score += 35;
      reasons.push('Exact key match (+35)');
      break;
    case 'relative':
      score += 30;
      reasons.push('Relative major/minor harmonic blend (+30)');
      break;
    case 'adjacent':
      score += 25;
      reasons.push('Adjacent Camelot step (+25)');
      break;
    case 'energy_boost':
      score += 15;
      reasons.push('Modulation energy boost (+15)');
      break;
    case 'clash':
      score -= 35;
      reasons.push('Harmonic key clash (-35)');
      break;
  }

  // 2. Tempo Compatibility
  const tRel = evaluateTempoRelation(prev.bpm, next.bpm);
  switch (tRel.relation) {
    case 'exact':
      score += 25;
      reasons.push('Exact BPM match (+25)');
      break;
    case 'close':
      score += 20;
      reasons.push(`BPM within +/-6% (${tRel.deltaPercent}%) (+20)`);
      break;
    case 'half_time':
    case 'double_time':
      score += 10;
      reasons.push(`${tRel.relation} metric transition (+10)`);
      break;
    case 'clash':
      score -= 30;
      reasons.push(`BPM mismatch delta ${tRel.deltaPercent}% (-30)`);
      break;
  }

  // 3. Artist Separation
  if (prev.artist && next.artist && prev.artist.toLowerCase() === next.artist.toLowerCase()) {
    score -= 40;
    reasons.push('Immediate artist repeat (-40)');
  }

  // 4. Energy Progression
  if (prev.energy && next.energy) {
    const eDiff = Math.abs(prev.energy - next.energy);
    if (eDiff <= 1) {
      score += 15;
      reasons.push('Smooth energy transition (+15)');
    } else if (eDiff <= 2) {
      score += 5;
      reasons.push('Moderate energy transition (+5)');
    } else {
      score -= eDiff * 5;
      reasons.push(`Abrupt energy leap ${prev.energy} -> ${next.energy} (-${eDiff * 5})`);
    }
  }

  const isCompatible = (hRel !== 'clash') && tRel.compatible;
  return { score, harmonicRelation: hRel, tempoRelation: tRel.relation, isCompatible, reasons };
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
