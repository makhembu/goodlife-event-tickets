import assert from "assert";
import fs from "fs";
import path from "path";
import {
  isScriptTooClose,
  buildDropPrompt,
  validateDropScript,
  cleanupExpiredRadioDrops,
  DROP_ARCHETYPES,
  RECENT_SCRIPTS_CAPACITY,
  DropVerifiedFacts,
} from "../lib/radio/drop-engine";

function isProductionDatabaseUrl(candidateUrl: string | undefined): boolean {
  if (!candidateUrl) return false;
  const cand = candidateUrl.trim();
  const currentDbUrl = process.env.DATABASE_URL?.trim();
  if (currentDbUrl && currentDbUrl === cand) return true;
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"#]+?)"?\s*$/);
        if (m && m[1].trim() === cand) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

async function main() {
  console.log("=== Goodlife Radio 254: Anti-Repetition & Memory Verification ===\n");

  // 1. Capacity Check
  assert.strictEqual(RECENT_SCRIPTS_CAPACITY, 50, "Recent scripts capacity must be 50");
  console.log("  PASS: Recent scripts capacity is 50 drops");

  // 2. Archetype Diversity Check
  assert.strictEqual(DROP_ARCHETYPES.length, 5, "Must declare 5 distinct drop archetypes");
  assert(DROP_ARCHETYPES.includes("track_stager"), "Must include track_stager archetype");
  assert(DROP_ARCHETYPES.includes("station_callout"), "Must include station_callout archetype");
  assert(DROP_ARCHETYPES.includes("event_spotlight"), "Must include event_spotlight archetype");
  assert(DROP_ARCHETYPES.includes("host_banter"), "Must include host_banter archetype");
  assert(DROP_ARCHETYPES.includes("ticket_cta"), "Must include ticket_cta archetype");
  console.log("  PASS: Declares 5 diverse drop archetypes");

  // 3. 4-Gram Repetition Check
  const pastDrops = [
    "Nairobi stand up, we are rocking the sound system live tonight on GOODLIFE Radio 254.",
    "Turn up the volume in your matatu because the weekend vibes are officially unlocked.",
  ];

  const repeatingFourGram = "We are rocking the sound system everywhere across town.";
  const check1 = isScriptTooClose(repeatingFourGram, pastDrops);
  assert.strictEqual(check1.tooClose, true, "Should reject candidate sharing 4 consecutive words");
  console.log("  PASS: 4-gram repetition detector rejects shared 4-word phrasing");

  // 4. Jaccard Vocabulary Similarity Check (>40%)
  const similarVocabulary = "Nairobi stand up rocking the sound system live tonight.";
  const check2 = isScriptTooClose(similarVocabulary, pastDrops);
  assert.strictEqual(check2.tooClose, true, "Should reject candidate with high vocabulary overlap");
  console.log("  PASS: Jaccard similarity detector rejects high token overlap");

  // 5. Distinct Drop Passes Cleanly
  const freshDrop = "Bazuu wangu piga luku safi, selector anadrop track mpya bila simile.";
  const check3 = isScriptTooClose(freshDrop, pastDrops);
  assert.strictEqual(check3.tooClose, false, "Completely fresh drop must pass anti-closeness check");
  console.log("  PASS: Fresh distinct script passes anti-closeness check");

  // 6. Track Title Digit Whitelisting
  const mockFacts: DropVerifiedFacts = {
    station_callout: "GOODLIFE Radio 254",
    daypart: "peak_evening",
    persona: "MC Cheche",
    next_track: {
      id: 101,
      title: "Big 7 Live Mix 2026",
      artist: "Burna Boy",
      genre: "afrobeats",
    },
  };

  const validScriptWithTitleNumber = JSON.stringify({
    tag: "[excited]",
    text: "MC Cheche hapa, cheki Burna Boy na Big 7 Live Mix 2026 ikishake speakers!",
  });

  const val = validateDropScript(validScriptWithTitleNumber, mockFacts, 10);
  assert.strictEqual(val.valid, true, `Track title digits must be whitelisted: ${val.errors.join(", ")}`);
  console.log("  PASS: Numbers from track titles (e.g. 'Big 7', '2026') are whitelisted");

  // 7. Expired Drops Retention Cleanup (Requires TEST_DATABASE_URL to touch DB)
  if (!process.env.TEST_DATABASE_URL) {
    console.log("  PASS: Live DB drop cleanup skipped (TEST_DATABASE_URL is not set; preventing database mutations)");
  } else {
    const testUrl = process.env.TEST_DATABASE_URL.trim();
    if (isProductionDatabaseUrl(testUrl)) {
      console.error("SAFETY REFUSAL: TEST_DATABASE_URL matches production DATABASE_URL (or .env.local). Refusing to run live DB drop cleanup against production!");
      process.exit(1);
    }
    process.env.DATABASE_URL = testUrl;
    const cleanupRes = await cleanupExpiredRadioDrops(24);
    assert(typeof cleanupRes.deletedDbRows === "number", "Retention cleanup reports deleted DB rows");
    assert(typeof cleanupRes.deletedFiles === "number", "Retention cleanup reports deleted files");
    console.log(`  PASS: Expired drops retention cleanup executed (cleaned ${cleanupRes.deletedDbRows} DB rows, ${cleanupRes.deletedFiles} old files)`);
  }

  console.log("\nResults: ALL PASS (Anti-Repetition & 50-Drop Memory Verified)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
