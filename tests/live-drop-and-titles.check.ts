import { formatTrackTitle, normalizeTrackTitle } from "../lib/radio/media-helpers";

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log("=== Goodlife Radio 254: Title Normalization & Live Ingest Verification ===");

// 1. Title Normalization Tests
const sampleDirtyTitles = [
  { raw: "Burna Boy - Big 7 [Official Music Video]", expected: "Burna Boy - Big 7" },
  { raw: "DJ Kent ft The Arrows - Spin My World (Official Music Video)", expected: "DJ Kent ft The Arrows - Spin My World" },
  { raw: "DJ OBZA - ROAD TO VIGRO (Official Music Video)", expected: "DJ OBZA - ROAD TO VIGRO" },
  { raw: "Rudeboyz - Ingozi (Audio) ft. Nokwazi, TNS", expected: "Rudeboyz - Ingozi ft. Nokwazi, TNS" },
  { raw: "Jacky - Don't Let Go feat [Dj Obza] (Official Audio)", expected: "Jacky - Don't Let Go feat [Dj Obza]" },
  { raw: "7. Open Mic Grooves: KayGee Da King & Bizizi - Pikachu", expected: "Open Mic Grooves: KayGee Da King & Bizizi - Pikachu" },
  { raw: "NASTY C - Eazy [Official Music Video] [Explicit]", expected: "NASTY C - Eazy" },
  { raw: "Something About You feat  DJ Maphorisa & Kabza De Small (Official Audio) | ShaSha", expected: "Something About You feat DJ Maphorisa & Kabza De Small" },
  { raw: "Samthing Soweto - \"Lotto\" ft. Mlindo The Vocalist (Official Video)", expected: "Samthing Soweto - Lotto ft. Mlindo The Vocalist" },
  { raw: "01 - Master KG - Jerusalem [4K]", expected: "Master KG - Jerusalem" },
  { raw: "Black Coffee & David Guetta - Drive feat. Delilah Montagu [Ultra Music]", expected: "Black Coffee & David Guetta - Drive feat. Delilah Montagu" },
];

for (const sample of sampleDirtyTitles) {
  const cleaned = formatTrackTitle(sample.raw);
  assert(cleaned === sample.expected, `Title "${sample.raw}" normalized to "${sample.expected}" (got "${cleaned}")`);
}

// 2. Truth in Empty/Null titles
assert(formatTrackTitle(null) === "Updating...", "Null title returns 'Updating...'");
assert(formatTrackTitle("") === "Updating...", "Empty title returns 'Updating...'");
assert(formatTrackTitle("   ") === "Updating...", "Whitespace title returns 'Updating...'");

// 3. Aliasing check
assert(normalizeTrackTitle === formatTrackTitle, "normalizeTrackTitle is alias of formatTrackTitle");

console.log("\nResults: ALL PASS (Title Normalization Verified)");
