// tests/soundboard-database.check.ts
import fs from "fs";
import path from "path";
import {
  isValidSoundboardAudioUrl,
  calculateStepReorder,
  canDeleteBank,
  reorderPadsWithPositions,
  validateSoundboardAudioLimits,
  checkAdminSessionValid,
  executePadReorderTransaction,
} from "../lib/radio/soundboard-helpers";

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log("Starting GOODLIFE Soundboard Database System verification...\n");

  console.log("--- SECTION 1: Behavioral Unit Tests (Pure Logic & URL Rules) ---");
  check("Validates relative /drops/ URLs", isValidSoundboardAudioUrl("/drops/samples/dj-fusion_context_drop.mp3"));
  check("Validates custom /drops/ subdirectory", isValidSoundboardAudioUrl("/drops/wazi-254.mp3"));
  check("Validates Cloudflare R2 pub-*.r2.dev domains", isValidSoundboardAudioUrl("https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/test.mp3"));
  check("Validates Cloudflare R2 cloudflarestorage.com domains", isValidSoundboardAudioUrl("https://goodlife.bucket.cloudflarestorage.com/radio/drops/test.mp3"));
  check("Allows null or empty audio_url (empty pad state)", isValidSoundboardAudioUrl(null) && isValidSoundboardAudioUrl(""));
  check("Rejects unauthorized external domains", !isValidSoundboardAudioUrl("https://malicious-site.com/track.mp3"));
  check("Rejects javascript: URI injection", !isValidSoundboardAudioUrl("javascript:alert(1)"));
  check("Rejects data: URI injection", !isValidSoundboardAudioUrl("data:audio/mp3;base64,..."));
  check("Rejects non-https schemes", !isValidSoundboardAudioUrl("http://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/test.mp3"));

  const sampleIds = [101, 102, 103, 104];
  check(
    "calculateStepReorder moves item earlier",
    JSON.stringify(calculateStepReorder(sampleIds, 103, "earlier")) === JSON.stringify([101, 103, 102, 104])
  );
  check(
    "calculateStepReorder moves item later",
    JSON.stringify(calculateStepReorder(sampleIds, 102, "later")) === JSON.stringify([101, 103, 102, 104])
  );
  check(
    "calculateStepReorder handles earlier at start boundary safely",
    JSON.stringify(calculateStepReorder(sampleIds, 101, "earlier")) === JSON.stringify([101, 102, 103, 104])
  );
  check(
    "calculateStepReorder handles later at end boundary safely",
    JSON.stringify(calculateStepReorder(sampleIds, 104, "later")) === JSON.stringify([101, 102, 103, 104])
  );
  check(
    "calculateStepReorder handles item not in list safely",
    JSON.stringify(calculateStepReorder(sampleIds, 999, "earlier")) === JSON.stringify([101, 102, 103, 104])
  );

  check("canDeleteBank allows deletion when >1 banks exist", canDeleteBank(3) && canDeleteBank(2));
  check("canDeleteBank prevents deletion when only 1 bank exists", !canDeleteBank(1) && !canDeleteBank(0));

  const samplePads = [
    { id: 10, position: 0, label: "A" },
    { id: 20, position: 1, label: "B" },
    { id: 30, position: 2, label: "C" },
  ];
  const reordered = reorderPadsWithPositions(samplePads, [30, 10, 20]);
  check(
    "reorderPadsWithPositions updates positions sequentially starting from 0",
    reordered[0].id === 30 && reordered[0].position === 0 &&
    reordered[1].id === 10 && reordered[1].position === 1 &&
    reordered[2].id === 20 && reordered[2].position === 2
  );

  console.log("\n--- SECTION 2: Behavioral Unit Tests (Admin Session Auth Verification) ---");
  process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "test_admin_session_secret_for_hardening_suite";
  const { signAdminSession } = await import("../lib/admin-session");
  const testSignedAdminToken = await signAdminSession(3600);
  check("checkAdminSessionValid accepts valid session cookie", (await checkAdminSessionValid(testSignedAdminToken)) === true);
  check("checkAdminSessionValid rejects legacy 'true' cookie", (await checkAdminSessionValid("true")) === false);
  check("checkAdminSessionValid rejects false string", (await checkAdminSessionValid("false")) === false);
  check("checkAdminSessionValid rejects undefined cookie", (await checkAdminSessionValid(undefined)) === false);
  check("checkAdminSessionValid rejects arbitrary token injection", (await checkAdminSessionValid("bearer-token-123")) === false);

  console.log("\n--- SECTION 3: Behavioral Unit Tests (Server-Side Audio Limits) ---");
  // Test existing local file within limit
  const localValid = await validateSoundboardAudioLimits("/drops/wazi-254.mp3");
  check("validateSoundboardAudioLimits verifies existing local file (/drops/wazi-254.mp3)", localValid.valid === true);

  // Test non-existent local file
  const localMissing = await validateSoundboardAudioLimits("/drops/missing-file-does-not-exist.mp3");
  check("validateSoundboardAudioLimits rejects missing local audio files", localMissing.valid === false && !!localMissing.error);

  // Test unauthorized host
  const unauthHost = await validateSoundboardAudioLimits("https://example.com/audio.mp3");
  check("validateSoundboardAudioLimits rejects unauthorized remote domains", unauthHost.valid === false);

  // Test empty/null audio is allowed (empty pad)
  const emptyClip = await validateSoundboardAudioLimits(null);
  check("validateSoundboardAudioLimits allows null clip (empty pad)", emptyClip.valid === true);

  console.log("\n--- SECTION 4: Behavioral Unit Tests (Atomic DB Transaction Mechanics) ---");
  // Mock DB client recording transaction lifecycle calls
  const mockQueries: { sql: string; params?: any[] }[] = [];
  const mockClient = {
    query: async (sql: string, params?: any[]) => {
      mockQueries.push({ sql: sql.trim(), params });
      return { rows: [] };
    },
  };

  const count = await executePadReorderTransaction(mockClient, 2, [50, 60, 70]);
  check("executePadReorderTransaction returns updated count", count === 3);
  check("executePadReorderTransaction initiates transaction with BEGIN", mockQueries[0]?.sql === "BEGIN");
  check(
    "executePadReorderTransaction updates pad positions sequentially in order",
    mockQueries[1]?.params?.[0] === 0 && mockQueries[1]?.params?.[1] === 50 && mockQueries[1]?.params?.[2] === 2 &&
    mockQueries[2]?.params?.[0] === 1 && mockQueries[2]?.params?.[1] === 60 && mockQueries[2]?.params?.[2] === 2 &&
    mockQueries[3]?.params?.[0] === 2 && mockQueries[3]?.params?.[1] === 70 && mockQueries[3]?.params?.[2] === 2
  );
  check("executePadReorderTransaction finalizes transaction with COMMIT", mockQueries[4]?.sql === "COMMIT");

  // Verify rollback behavior when a query fails mid-transaction
  const failingQueries: string[] = [];
  const failingClient = {
    query: async (sql: string) => {
      failingQueries.push(sql.trim());
      if (sql.includes("UPDATE")) {
        throw new Error("Simulated DB connection drop during update");
      }
      return { rows: [] };
    },
  };

  let caughtError: any = null;
  try {
    await executePadReorderTransaction(failingClient, 2, [50]);
  } catch (err: any) {
    caughtError = err;
  }
  check("executePadReorderTransaction triggers ROLLBACK on query failure", failingQueries.includes("ROLLBACK"));
  check("executePadReorderTransaction rethrows the error to caller", caughtError?.message === "Simulated DB connection drop during update");

  console.log("\n--- SECTION 5: Schema & Contract Invariant Checks ---");
  const migrationCode = fs.readFileSync(path.join(process.cwd(), "scripts/migrate-soundboard.js"), "utf8");
  check("Migration defines soundboard_banks table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_banks"));
  check("Migration defines soundboard_pads table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_pads"));
  check("Migration references radio_drops on delete set null", migrationCode.includes("REFERENCES radio_drops(id) ON DELETE SET NULL"));
  check("Migration seeds only when soundboard_banks is empty", migrationCode.includes("SELECT COUNT(*)::int as count FROM soundboard_banks"));
  check("Migration verifies audio files exist in public/", migrationCode.includes("fs.existsSync(fullPath)"));

  const padsApiRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/pads/[id]/route.ts"), "utf8");
  check("Pad deletion explicitly only deletes from soundboard_pads", padsApiRoute.includes("DELETE FROM soundboard_pads WHERE id = $1"));
  check("Pad deletion does NOT delete from radio_drops", !padsApiRoute.includes("DELETE FROM radio_drops"));

  console.log("\n================================");
  if (process.exitCode === 1) {
    console.log("Some soundboard checks failed.");
  } else {
    console.log("All soundboard checks passed.");
  }
  console.log("================================");
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
