/**
 * Harmonic Mixing & Camelot Wheel Graph Traversal Engine
 * 
 * Implements Camelot Wheel compatibility, BPM modulation matching,
 * and TSP-style harmonic pathing to auto-generate harmonized radio playlists.
 */

export interface TrackWithHarmony {
  id: number;
  title: string;
  dj_name: string;
  genre?: string | null;
  bpm?: number | null;
  musical_key?: string | null;
  duration_sec?: number | null;
  cover_url?: string | null;
  audio_url?: string | null;
}

export interface CamelotParsed {
  number: number; // 1 to 12
  letter: "A" | "B"; // A = Minor, B = Major
}

export function parseCamelotKey(key?: string | null): CamelotParsed | null {
  if (!key) return null;
  const match = String(key).trim().toUpperCase().match(/^(1[0-2]|[1-9])([AB])$/);
  if (!match) return null;
  return {
    number: parseInt(match[1], 10),
    letter: match[2] as "A" | "B",
  };
}

/**
 * Calculates harmonic compatibility score between two Camelot keys (0 to 10)
 */
export function getHarmonicScore(keyA?: string | null, keyB?: string | null): number {
  const pA = parseCamelotKey(keyA);
  const pB = parseCamelotKey(keyB);
  if (!pA || !pB) return 5; // Neutral score for unindexed keys

  // Exact same key (e.g. 8A -> 8A)
  if (pA.number === pB.number && pA.letter === pB.letter) {
    return 10;
  }

  // Relative Major / Minor (e.g. 8A <-> 8B)
  if (pA.number === pB.number && pA.letter !== pB.letter) {
    return 9.5;
  }

  // Step +1 or -1 on the wheel in the same letter (e.g. 8A -> 9A or 8A -> 7A)
  const diff = Math.abs(pA.number - pB.number);
  const circularDiff = Math.min(diff, 12 - diff);

  if (pA.letter === pB.letter) {
    if (circularDiff === 1) return 9.0; // Neighbor key
    if (circularDiff === 2) return 7.5; // Energy jump (+2 semitones)
    if (circularDiff === 0) return 10.0;
    return Math.max(1, 6 - circularDiff);
  }

  // Cross-letter transitions (e.g. 8A -> 9B or 8A -> 7B)
  if (circularDiff === 1) return 7.0;
  return Math.max(1, 4 - circularDiff);
}

/**
 * Calculates tempo compatibility score between two BPM values (0 to 10)
 */
export function getBpmScore(bpmA?: number | null, bpmB?: number | null): number {
  if (!bpmA || !bpmB || bpmA <= 0 || bpmB <= 0) return 5;

  const rawDiff = Math.abs(bpmA - bpmB);

  // Exact or near-exact match
  if (rawDiff <= 2) return 10;
  if (rawDiff <= 4) return 9;
  if (rawDiff <= 8) return 7.5;
  if (rawDiff <= 12) return 6;

  // Check half-time / double-time matching (e.g., 70 <-> 140, 65 <-> 130)
  const halfA = bpmA / 2;
  const doubleA = bpmA * 2;
  const halfDiff = Math.min(Math.abs(halfA - bpmB), Math.abs(doubleA - bpmB));
  if (halfDiff <= 2) return 8.5;
  if (halfDiff <= 5) return 7.0;

  return Math.max(1, 10 - rawDiff * 0.4);
}

/**
 * Calculates overall harmonic mixing transition score (0 to 10)
 */
export function getTransitionScore(trackA: TrackWithHarmony, trackB: TrackWithHarmony): number {
  const hScore = getHarmonicScore(trackA.musical_key, trackB.musical_key);
  const bScore = getBpmScore(trackA.bpm, trackB.bpm);
  return hScore * 0.65 + bScore * 0.35;
}

/**
 * Traverses candidate tracks using greedy Camelot-wheel graph traversal
 * to build the smoothest harmonic sequence.
 */
export function buildHarmonicSequence(
  tracks: TrackWithHarmony[],
  options?: {
    seedTrackId?: number;
    targetLength?: number;
    energyCurve?: "ascend" | "smooth" | "chill";
  }
): TrackWithHarmony[] {
  if (tracks.length <= 1) return [...tracks];

  const pool = [...tracks];
  const result: TrackWithHarmony[] = [];

  // 1. Pick starting track
  let currentIdx = 0;
  if (options?.seedTrackId) {
    const sIdx = pool.findIndex((t) => t.id === options.seedTrackId);
    if (sIdx !== -1) currentIdx = sIdx;
  } else if (options?.energyCurve === "ascend") {
    // Start with lowest BPM or key
    let lowestBpmIdx = 0;
    for (let i = 1; i < pool.length; i++) {
      if ((pool[i].bpm || 120) < (pool[lowestBpmIdx].bpm || 120)) {
        lowestBpmIdx = i;
      }
    }
    currentIdx = lowestBpmIdx;
  }

  const [first] = pool.splice(currentIdx, 1);
  result.push(first);

  const maxLen = options?.targetLength ? Math.min(options.targetLength, tracks.length) : tracks.length;

  // 2. Greedily find best next harmonic neighbor
  while (pool.length > 0 && result.length < maxLen) {
    const lastTrack = result[result.length - 1];
    let bestScore = -1;
    let bestIdx = 0;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      let score = getTransitionScore(lastTrack, candidate);

      // Energy curve adjustments
      if (options?.energyCurve === "ascend") {
        if ((candidate.bpm || 0) >= (lastTrack.bpm || 0)) score += 0.5;
      } else if (options?.energyCurve === "chill") {
        if ((candidate.bpm || 0) <= (lastTrack.bpm || 0) + 2) score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [nextTrack] = pool.splice(bestIdx, 1);
    result.push(nextTrack);
  }

  return result;
}

export type AutoPlaylistVibe = "late_night" | "club_peak" | "sundowner" | "amapiano_groove" | "afro_energy";

export interface VibeDefinition {
  id: AutoPlaylistVibe;
  name: string;
  description: string;
  suggestedCover: string;
  genres: string[];
  minBpm?: number;
  maxBpm?: number;
  energyCurve: "ascend" | "smooth" | "chill";
}

export const VIBE_DEFINITIONS: Record<AutoPlaylistVibe, VibeDefinition> = {
  late_night: {
    id: "late_night",
    name: "Late Night Drive 254",
    description: "Deep, smooth, low-fatigue festival frequencies for after-hours cruising across Nairobi.",
    suggestedCover: "/flyer.png",
    genres: ["Amapiano", "Pop", "Rock"],
    minBpm: 90,
    maxBpm: 118,
    energyCurve: "chill",
  },
  club_peak: {
    id: "club_peak",
    name: "Club Peak Time · High Voltage",
    description: "High-octane festival anthems with ascending Camelot key progressions for peak-hour euphoria.",
    suggestedCover: "/flyer-park-chill.png",
    genres: ["Afro-House", "Hip-Hop", "Amapiano"],
    minBpm: 118,
    maxBpm: 135,
    energyCurve: "ascend",
  },
  sundowner: {
    id: "sundowner",
    name: "Nairobi Sundowner & Chill",
    description: "Golden hour sunset vibes. Warm harmonic transitions, rich baselines, and relaxed grooves.",
    suggestedCover: "/flyer-park-chill.png",
    genres: ["Amapiano", "Reggae", "Afro-House"],
    minBpm: 100,
    maxBpm: 116,
    energyCurve: "smooth",
  },
  amapiano_groove: {
    id: "amapiano_groove",
    name: "Strictly Piano · Pure Harmonies",
    description: "Log-drum precision and soulful keyboard chords connected in circular harmonic perfection.",
    suggestedCover: "/flyer.png",
    genres: ["Amapiano"],
    minBpm: 110,
    maxBpm: 116,
    energyCurve: "smooth",
  },
  afro_energy: {
    id: "afro_energy",
    name: "Afro Beats & High Vibrations",
    description: "Electrifying rhythm from Nairobi to Lagos with seamless key-locked blends.",
    suggestedCover: "/flyer.png",
    genres: ["Afro-House", "Hip-Hop"],
    minBpm: 100,
    maxBpm: 128,
    energyCurve: "ascend",
  },
};
