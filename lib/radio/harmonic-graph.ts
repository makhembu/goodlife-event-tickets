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
  energy?: number | null;
  duration_sec?: number | null;
  cover_url?: string | null;
  audio_url?: string | null;
}

const GENERIC_DJ_LABELS = new Set([
  "goodlife resident",
  "resident selector",
  "resident dj",
  "goodlife artist",
  "youtube artist",
  "spotify artist",
  "various artists",
  "unknown",
  "",
]);

export function extractPrimaryArtist(title?: string | null, djName?: string | null): string {
  const rawDj = (djName || "").trim();
  if (rawDj && !GENERIC_DJ_LABELS.has(rawDj.toLowerCase())) {
    return rawDj
      .toLowerCase()
      .split(/\s*(?:ft\.?|feat\.?|&|x|,|\||vs\.?)\s*/i)[0]
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  }
  const cleanTitle = (title || "").trim();
  const dashSplit = cleanTitle.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2) {
    return dashSplit[0]
      .toLowerCase()
      .split(/\s*(?:ft\.?|feat\.?|&|x|,)\s*/i)[0]
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  }
  return cleanTitle
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

export function getGenreBridgeScore(genreA?: string | null, genreB?: string | null): number {
  if (!genreA || !genreB) return 0;
  const a = genreA.toLowerCase().trim();
  const b = genreB.toLowerCase().trim();
  if (a === b) return 1.2;

  const afroCluster = ["amapiano", "afro house", "afrobeats", "afropop", "3-step", "afro-tech"];
  const urbanCluster = ["hip-hop", "rap", "gengetone", "arbantone", "trap", "drill", "r&b", "pop"];
  const chillCluster = ["chillout", "sundowner", "lounge", "reggae", "soul", "rhumba"];

  const inSameCluster = [afroCluster, urbanCluster, chillCluster].some(
    (c) => c.some((tok) => a.includes(tok)) && c.some((tok) => b.includes(tok))
  );
  if (inSameCluster) return 0.7;
  return -0.8;
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
 * Traverses candidate tracks using Homeboyz Radio / NRG pro DJ graph traversal:
 * - Relative Major/Minor & +1/+2 Camelot lifts scored warmly so mixes breathe organically
 * - Sliding artist separation cooldown (real artist parsed from title/dj_name)
 * - Same-key monotony damper (prevents 4+ identical-key tracks locking in a plateau)
 * - Genre bridge affinity & smooth wave energy continuity
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
  let sameKeyStreak = 0;

  // 2. Build dynamic DJ mix sequence
  while (pool.length > 0 && result.length < maxLen) {
    const lastTrack = result[result.length - 1];
    const recentArtists = result
      .slice(-4)
      .map((r) => extractPrimaryArtist(r.title, r.dj_name))
      .filter(Boolean);

    let bestScore = -999;
    let bestIdx = 0;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      let score = getTransitionScore(lastTrack, candidate);

      // Break exact-key monotony plateaus after 2 consecutive same-key tracks
      const pLast = parseCamelotKey(lastTrack.musical_key);
      const pCand = parseCamelotKey(candidate.musical_key);
      if (pLast && pCand) {
        const isExact = pLast.number === pCand.number && pLast.letter === pCand.letter;
        const isRelativeOrNeighbor =
          (pLast.number === pCand.number && pLast.letter !== pCand.letter) ||
          (pLast.letter === pCand.letter &&
            Math.min(Math.abs(pLast.number - pCand.number), 12 - Math.abs(pLast.number - pCand.number)) === 1);
        if (isExact && sameKeyStreak >= 1) {
          score -= sameKeyStreak * 1.1;
        } else if (isRelativeOrNeighbor && sameKeyStreak >= 1) {
          score += 0.9; // Reward lifting or modulating cleanly into next Camelot hour!
        }
      }

      // Real artist separation across 4-track broadcast window
      const candArtist = extractPrimaryArtist(candidate.title, candidate.dj_name);
      if (candArtist) {
        const backDist = recentArtists.slice().reverse().indexOf(candArtist);
        if (backDist === 0) score -= 6.0;
        else if (backDist === 1) score -= 3.0;
        else if (backDist >= 2) score -= 1.2;
      }

      // Genre bridge affinity
      score += getGenreBridgeScore(lastTrack.genre, candidate.genre);

      // Energy wave / curve adjustments
      if (options?.energyCurve === "ascend") {
        if ((candidate.bpm || 0) >= (lastTrack.bpm || 0)) score += 0.6;
        if (candidate.energy && lastTrack.energy && candidate.energy >= lastTrack.energy) score += 0.4;
      } else if (options?.energyCurve === "chill") {
        if ((candidate.bpm || 0) <= (lastTrack.bpm || 0) + 2) score += 0.6;
      } else {
        // Gentle broadcast wave energy continuity
        if (candidate.energy && lastTrack.energy) {
          const eDiff = Math.abs(candidate.energy - lastTrack.energy);
          if (eDiff <= 1) score += 0.6;
          else if (eDiff >= 4) score -= 1.2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [nextTrack] = pool.splice(bestIdx, 1);
    const pLast = parseCamelotKey(lastTrack.musical_key);
    const pNext = parseCamelotKey(nextTrack.musical_key);
    if (pLast && pNext && pLast.number === pNext.number && pLast.letter === pNext.letter) {
      sameKeyStreak += 1;
    } else {
      sameKeyStreak = 0;
    }
    result.push(nextTrack);
  }

  return result;
}

export type AutoPlaylistVibe = "late_night" | "club_peak" | "sundowner" | "morning_rise" | "amapiano_groove" | "afro_energy";

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
    genres: ["Amapiano", "Afro House", "Lounge"],
    minBpm: 90,
    maxBpm: 118,
    energyCurve: "chill",
  },
  morning_rise: {
    id: "morning_rise",
    name: "Nairobi Morning Rise & Chill",
    description: "Gentle sunrise warmth, soulful keys, and relaxed midtempo rhythms for morning airwaves.",
    suggestedCover: "/flyer.png",
    genres: ["Amapiano", "Lounge", "R&B / Soul"],
    minBpm: 95,
    maxBpm: 114,
    energyCurve: "chill",
  },
  club_peak: {
    id: "club_peak",
    name: "Club Peak Time · High Voltage",
    description: "High-octane festival anthems with ascending Camelot key progressions for peak-hour euphoria.",
    suggestedCover: "/flyer-park-chill.png",
    genres: ["Afro House", "3-Step", "Festival Anthems"],
    minBpm: 118,
    maxBpm: 135,
    energyCurve: "ascend",
  },
  sundowner: {
    id: "sundowner",
    name: "Nairobi Sundowner & Chill",
    description: "Golden hour sunset vibes. Warm harmonic transitions, rich baselines, and relaxed grooves.",
    suggestedCover: "/flyer-park-chill.png",
    genres: ["Amapiano", "Afro House", "Lounge"],
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
    genres: ["Afro House", "3-Step", "Festival Anthems"],
    minBpm: 100,
    maxBpm: 128,
    energyCurve: "ascend",
  },
};
