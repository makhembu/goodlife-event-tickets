/**
 * Unit & Integration verification for Section 7.3 & 7.4 of RADIO-SPECIFICATION.md
 * - BPM normalization & candidate folding {x/2, x, 2x}
 * - Gengetone at 70 flagged "needs review", not doubled to 140
 * - Drill at 72 folded to 144
 * - Camelot key wheel distance <= 1
 * - Daypart energy curve and festival mode override
 * - Sequencer artist spacing and 4h track repetition cooldown
 */

import {
  normalizeTrackBpm,
  isCamelotCompatible,
  getTargetEnergyCurve,
  selectNextTrack,
  TrackMetadata,
} from "../lib/radio/sequencer";

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}${detail ? ` -> ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

console.log("=== Goodlife Radio 254: Sequencer & BPM Invariants (Section 7) ===");

// 1. Amapiano window [108-115]
const r1 = normalizeTrackBpm(112, "amapiano");
assert(!r1.needs_review && r1.bpm === 112, "Amapiano at 112 keeps 112");

const r2 = normalizeTrackBpm(56, "amapiano");
assert(!r2.needs_review && r2.bpm === 112, "Amapiano at 56 doubles to 112");

// 2. Gengetone window [90-105] - CRITICAL INVARIANT: Gengetone at 70 MUST NOT silently double to 140!
const r3 = normalizeTrackBpm(70, "gengetone");
assert(
  r3.needs_review,
  "Gengetone detected at 70 is flagged 'needs review', NOT silently doubled to 140",
  `Got bpm=${r3.bpm}, needs_review=${r3.needs_review}`
);

const r4 = normalizeTrackBpm(98, "gengetone");
assert(!r4.needs_review && r4.bpm === 98, "Gengetone at 98 passes cleanly");

// 3. Drill window [140-145]
const r5 = normalizeTrackBpm(71, "drill");
assert(!r5.needs_review && r5.bpm === 142, "Drill detected at 71 folds to 142");

// 4. General fold [85-135] for track without genre
const r6 = normalizeTrackBpm(60);
assert(!r6.needs_review && r6.bpm === 120, "Un-genred track at 60 folds to 120");

// 5. Camelot Wheel Key Compatibility
assert(isCamelotCompatible("8A", "8A"), "Same key (8A -> 8A) is compatible");
assert(isCamelotCompatible("8A", "8B"), "Relative major/minor (8A -> 8B) is compatible");
assert(isCamelotCompatible("8A", "7A"), "Step down (8A -> 7A) is compatible");
assert(isCamelotCompatible("8A", "9A"), "Step up (8A -> 9A) is compatible");
assert(isCamelotCompatible("12A", "1A"), "Wrap-around (12A -> 1A) is compatible");
assert(!isCamelotCompatible("8A", "10A"), "Two steps away (8A -> 10A) is rejected");
assert(!isCamelotCompatible("8A", "6B"), "Cross-wheel diagonal (8A -> 6B) is rejected");

// 6. Daypart Energy Curves (Nairobi UTC+3)
// 07:00 EAT (04:00 UTC) -> Morning: 3 to 5
const morningDate = new Date("2026-10-28T04:00:00Z");
const morningCurve = getTargetEnergyCurve(morningDate);
assert(morningCurve.min === 3 && morningCurve.max === 5, "07:00 EAT targets morning energy 3 to 5");

// 14:00 EAT (11:00 UTC) -> Afternoon: 6 to 8
const afternoonDate = new Date("2026-10-28T11:00:00Z");
const afternoonCurve = getTargetEnergyCurve(afternoonDate);
assert(afternoonCurve.min === 6 && afternoonCurve.max === 8, "14:00 EAT targets afternoon energy 6 to 8");

// 21:00 EAT (18:00 UTC) -> Peak Evening: 8 to 10
const eveningDate = new Date("2026-10-28T18:00:00Z");
const eveningCurve = getTargetEnergyCurve(eveningDate);
assert(eveningCurve.min === 8 && eveningCurve.max === 10, "21:00 EAT targets peak evening energy 8 to 10");

// 03:00 EAT (00:00 UTC) -> Deep Overnight: 5 to 7
const nightDate = new Date("2026-10-28T00:00:00Z");
const nightCurve = getTargetEnergyCurve(nightDate);
assert(nightCurve.min === 5 && nightCurve.max === 7, "03:00 EAT targets overnight energy 5 to 7");

// Festival Mode Override: 8 to 10 regardless of time
const festivalCurve = getTargetEnergyCurve(morningDate, true);
assert(festivalCurve.min === 8 && festivalCurve.max === 10, "Festival Mode forces energy 8 to 10 in the morning");

// 7. Track Sequencer Selection
const mockPool: TrackMetadata[] = [
  { id: 1, title: "Track A", artist: "Artist 1", bpm: 112, key: "8A", energy: 4, duration_seconds: 240 },
  { id: 2, title: "Track B", artist: "Artist 2", bpm: 114, key: "8B", energy: 4, duration_seconds: 210 },
  { id: 3, title: "Track C", artist: "Artist 3", bpm: 130, key: "1A", energy: 9, duration_seconds: 180 },
  { id: 4, title: "Track D", artist: "Artist 1", bpm: 113, key: "9A", energy: 4, duration_seconds: 200 },
];

const selected = selectNextTrack(mockPool, mockPool[0], [
  { trackId: mockPool[0].id, artist: mockPool[0].artist, playedAt: Date.now() - 60000 },
], morningDate);

assert(selected !== null, "Sequencer successfully selects a track");
assert(selected?.id === 2, "Sequencer chose Track B (Camelot 8B, 114 BPM, Energy 4, different artist)");
assert(selected?.artist !== "Artist 1", "Sequencer respected artist repeat spacing");

console.log("\nSequencer & BPM test suite completed.");
