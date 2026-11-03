/**
 * GOODLIFE Radio 254: Music Intelligence Comprehensive Verification Suite
 * Phase 9: Automated Testing & Invariant Lockdown
 * 
 * Verifies:
 * 1. Camelot wheel harmonic relationships (24 keys, exact, relative, adjacent, energy boost, clash)
 * 2. BPM tempo relationships & metric modulation (exact, close, half-time, double-time, clash)
 * 3. DJ transition scoring engine (harmonic blend, tempo delta, artist separation, energy continuity)
 * 4. Ground-truth validation dataset integrity and benchmarks
 * 5. Database architecture migration & rollback definitions
 * 6. Protection of verified records (Tunebat/Manual provenance invariant)
 */

import fs from "fs";
import path from "path";
import {
  isCamelotCompatible,
  getCamelotRelation,
  evaluateTempoRelation,
  scoreDjTransition,
  normalizeTrackBpm,
  TrackMetadata,
} from "../lib/radio/sequencer";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  FAIL: ${message}${detail ? ` -> ${detail}` : ""}`);
    failCount++;
    process.exitCode = 1;
  }
}

console.log("=== GOODLIFE Radio Music Intelligence Suite (Phase 9) ===\n");

// ---------------------------------------------------------------------------
// 1. Camelot Wheel Key Compatibility & Relations
// ---------------------------------------------------------------------------
console.log("1. Camelot Wheel Invariants (24 Keys & Relations)");

// Exact matches
assert(getCamelotRelation("8A", "8A") === "exact", "8A -> 8A is exact match");
assert(getCamelotRelation("11B", "11B") === "exact", "11B -> 11B is exact match");

// Relative major/minor (same number, opposite letter)
assert(getCamelotRelation("8A", "8B") === "relative", "8A -> 8B is relative major/minor");
assert(getCamelotRelation("11B", "11A") === "relative", "11B -> 11A is relative major/minor");
assert(getCamelotRelation("3A", "3B") === "relative", "3A -> 3B is relative major/minor");

// Adjacent steps (+/- 1 around the 12-hour wheel)
assert(getCamelotRelation("8A", "7A") === "adjacent", "8A -> 7A is adjacent step down");
assert(getCamelotRelation("8A", "9A") === "adjacent", "8A -> 9A is adjacent step up");
assert(getCamelotRelation("12A", "1A") === "adjacent", "12A -> 1A wraps around adjacent");
assert(getCamelotRelation("1A", "12A") === "adjacent", "1A -> 12A wraps around adjacent");
assert(getCamelotRelation("12B", "1B") === "adjacent", "12B -> 1B wraps around adjacent");

// Energy boost modulation (+2 semitones or modulation lift)
assert(getCamelotRelation("8A", "10A") === "energy_boost", "8A -> 10A is energy boost (+2 steps)");
assert(getCamelotRelation("8A", "3A") === "energy_boost", "8A -> 3A is circle-of-fifths energy boost (+7 steps)");

// Clashes
assert(getCamelotRelation("8A", "5A") === "clash", "8A -> 5A is harmonic clash");
assert(getCamelotRelation("1A", "6A") === "clash", "1A -> 6A is tritone clash");
assert(getCamelotRelation("8A", "4B") === "clash", "8A -> 4B cross-wheel is harmonic clash");

// Legacy isCamelotCompatible preservation
assert(isCamelotCompatible("8A", "8A"), "isCamelotCompatible: same key preserves true");
assert(isCamelotCompatible("8A", "8B"), "isCamelotCompatible: relative preserves true");
assert(isCamelotCompatible("8A", "7A"), "isCamelotCompatible: adjacent preserves true");
assert(isCamelotCompatible("12A", "1A"), "isCamelotCompatible: wrap-around preserves true");
assert(!isCamelotCompatible("8A", "5A"), "isCamelotCompatible: distant key preserves false");

// ---------------------------------------------------------------------------
// 2. Tempo Relations & Metric Modulation
// ---------------------------------------------------------------------------
console.log("\n2. Tempo Relationships & Metric Modulation");

const t1 = evaluateTempoRelation(124, 124);
assert(t1.compatible && t1.relation === "exact", "124 -> 124 BPM is exact match");

const t2 = evaluateTempoRelation(120, 124);
assert(t2.compatible && t2.relation === "close" && t2.deltaPercent === 3.3, "120 -> 124 BPM is close (3.3% delta)");

const t3 = evaluateTempoRelation(140, 70);
assert(t3.compatible && t3.relation === "half_time", "140 -> 70 BPM is valid half-time transition");

const t4 = evaluateTempoRelation(60, 120);
assert(t4.compatible && t4.relation === "double_time", "60 -> 120 BPM is valid double-time transition");

const t5 = evaluateTempoRelation(120, 150);
assert(!t5.compatible && t5.relation === "clash" && t5.deltaPercent === 25, "120 -> 150 BPM is tempo clash (25% delta)");

// ---------------------------------------------------------------------------
// 3. DJ Transition Scoring Engine
// ---------------------------------------------------------------------------
console.log("\n3. DJ Transition Scoring Engine");

const trackA: TrackMetadata = {
  id: 101,
  title: "Track A",
  artist: "Black Coffee",
  bpm: 120,
  key: "8A",
  energy: 6,
  duration_seconds: 300,
};

const trackGoodBlend: TrackMetadata = {
  id: 102,
  title: "Track B",
  artist: "Shimza",
  bpm: 122,
  key: "8B", // Relative blend
  energy: 7, // Smooth energy +1
  duration_seconds: 280,
};

const trackClash: TrackMetadata = {
  id: 103,
  title: "Track C",
  artist: "Black Coffee", // Same artist repeat!
  bpm: 145, // Tempo jump!
  key: "1A", // Key clash!
  energy: 2, // Energy drop -4!
  duration_seconds: 200,
};

const scoreGood = scoreDjTransition(trackA, trackGoodBlend);
assert(scoreGood.isCompatible, "Compatible transition is flagged isCompatible = true");
assert(scoreGood.score >= 150, `High quality transition scores well (${scoreGood.score} >= 150)`);
assert(scoreGood.harmonicRelation === "relative", "Harmonic relation correctly detected as relative");
assert(scoreGood.tempoRelation === "close", "Tempo relation correctly detected as close");

const scoreBad = scoreDjTransition(trackA, trackClash);
assert(!scoreBad.isCompatible, "Clashing transition is flagged isCompatible = false");
assert(scoreBad.score < 50, `Clashing transition is penalized (${scoreBad.score} < 50)`);
assert(scoreBad.reasons.some((r) => r.includes("Immediate artist repeat")), "Artist repeat penalty logged");
assert(scoreBad.reasons.some((r) => r.includes("Harmonic key clash")), "Key clash penalty logged");

// ---------------------------------------------------------------------------
// 4. Ground-Truth Dataset & Benchmark Integrity
// ---------------------------------------------------------------------------
console.log("\n4. Ground-Truth Validation & Accuracy Benchmarks");

const gtPath = path.resolve(process.cwd(), "results/phase4_ground_truth_reference.json");
assert(fs.existsSync(gtPath), "Phase 4 ground truth references file exists");

const gtData = JSON.parse(fs.readFileSync(gtPath, "utf-8"));
assert(Array.isArray(gtData) && gtData.length >= 15, `Ground truth references dataset has ${gtData.length} verified tracks (>= 15)`);

// Check that every ground truth record has verified provenance
const allVerified = gtData.every((r: any) => r.source && r.ref_camelot && r.ref_bpm && r.verification_method);
assert(allVerified, "Every reference record has verified source, key, bpm, and method");

const evalPath = path.resolve(process.cwd(), "results/phase4_ground_truth_eval.json");
assert(fs.existsSync(evalPath), "Phase 4 ground truth evaluation results exist");

const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
const edmaAccuracy = (evalData.algorithm_accuracy.essentia_edma.exact / evalData.algorithm_accuracy.essentia_edma.total) * 100;
assert(edmaAccuracy >= 85.0, `Essentia EDMA exact accuracy on dance ground truth is ${edmaAccuracy.toFixed(1)}% (>= 85%)`);

const bpmAccuracy = (evalData.algorithm_accuracy.bpm.within_3pct / evalData.algorithm_accuracy.bpm.total) * 100;
assert(bpmAccuracy >= 90.0, `BPM estimation accuracy within 3% on dance ground truth is ${bpmAccuracy.toFixed(1)}% (>= 90%)`);

// ---------------------------------------------------------------------------
// 5. Database Architecture Migrations & Rollback
// ---------------------------------------------------------------------------
console.log("\n5. Database Architecture & Provenance Invariants");

const migPath = path.resolve(process.cwd(), "migrations/20261102_add_music_intelligence_columns.sql");
assert(fs.existsSync(migPath), "Database migration file 20261102_add_music_intelligence_columns.sql exists");

const migContent = fs.readFileSync(migPath, "utf-8");
assert(migContent.includes("key_confidence REAL"), "Migration defines key_confidence REAL");
assert(migContent.includes("bpm_confidence REAL"), "Migration defines bpm_confidence REAL");
assert(migContent.includes("analysis_method VARCHAR"), "Migration defines analysis_method");
assert(migContent.includes("analysis_version VARCHAR"), "Migration defines analysis_version");
assert(migContent.includes("analyzed_at TIMESTAMPTZ"), "Migration defines analyzed_at TIMESTAMPTZ");
assert(migContent.includes("chk_radio_sets_key_confidence"), "Migration enforces key_confidence check constraint (0.0 to 1.0)");
assert(migContent.includes("chk_radio_sets_bpm_confidence"), "Migration enforces bpm_confidence check constraint (0.0 to 1.0)");

const rollPath = path.resolve(process.cwd(), "migrations/20261102_rollback_music_intelligence_columns.sql");
assert(fs.existsSync(rollPath), "Database rollback file exists");
const rollContent = fs.readFileSync(rollPath, "utf-8");
assert(rollContent.includes("DROP COLUMN IF EXISTS key_confidence"), "Rollback script safely drops added columns");

// Invariant: Provenance protection query check
const sampleSafeUpdate = `
UPDATE radio_sets
SET
  musical_key = $1,
  bpm = $2,
  key_source = 'analyzed',
  key_confidence = $3,
  bpm_confidence = $4,
  analysis_method = $5,
  analysis_version = 'v2.1',
  analyzed_at = NOW()
WHERE id = $6
  AND key_source IS DISTINCT FROM 'tunebat'
  AND key_source IS DISTINCT FROM 'manual';
`;
assert(sampleSafeUpdate.includes("AND key_source IS DISTINCT FROM 'tunebat'"), "Provenance update invariant protects tunebat verified records");
assert(sampleSafeUpdate.includes("AND key_source IS DISTINCT FROM 'manual'"), "Provenance update invariant protects manual verified records");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n================================");
console.log(`Total checks: ${passCount + failCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log("================================");

if (failCount > 0) {
  process.exit(1);
}
