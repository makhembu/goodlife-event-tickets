// tests/soundboard-database.check.ts
import fs from "fs";
import path from "path";
import {
  isValidSoundboardAudioUrl,
  calculateStepReorder,
  canDeleteBank,
  reorderPadsWithPositions,
} from "../lib/radio/soundboard-helpers";

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  }
}

console.log("Starting GOODLIFE Soundboard Database System verification...\n");

// 1. Audio URL Validation Checks
check("Validates relative /drops/ URLs", isValidSoundboardAudioUrl("/drops/samples/dj-fusion_context_drop.mp3"));
check("Validates custom /drops/ subdirectory", isValidSoundboardAudioUrl("/drops/wazi-254.mp3"));
check("Validates Cloudflare R2 pub-*.r2.dev domains", isValidSoundboardAudioUrl("https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/test.mp3"));
check("Allows null or empty audio_url (empty pad state)", isValidSoundboardAudioUrl(null) && isValidSoundboardAudioUrl(""));
check("Rejects unauthorized external domains", !isValidSoundboardAudioUrl("https://malicious-site.com/track.mp3"));
check("Rejects javascript: or data: injection URIs", !isValidSoundboardAudioUrl("javascript:alert(1)") && !isValidSoundboardAudioUrl("data:audio/mp3;base64,..."));

// 2. Pure Logic & Position Math Checks
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

// 3. Migration and Source Checks
const migrationCode = fs.readFileSync(path.join(process.cwd(), "scripts/migrate-soundboard.js"), "utf8");
check("Migration defines soundboard_banks table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_banks"));
check("Migration defines soundboard_pads table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_pads"));
check("Migration references radio_drops on delete set null", migrationCode.includes("REFERENCES radio_drops(id) ON DELETE SET NULL"));
check("Migration seeds only when soundboard_banks is empty", migrationCode.includes("SELECT COUNT(*)::int as count FROM soundboard_banks"));
check("Migration verifies audio files exist in public/", migrationCode.includes("fs.existsSync(fullPath)"));

// 4. API Route Source Checks
const apiRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/route.ts"), "utf8");
check("Soundboard API route enforces requireAdmin", apiRoute.includes("requireAdmin(req)"));
check("Soundboard API route queries soundboard_banks", apiRoute.includes("FROM soundboard_banks"));
check("Soundboard API route queries soundboard_pads", apiRoute.includes("FROM soundboard_pads"));
check("Soundboard API route returns Drops Vault options from radio_drops", apiRoute.includes("FROM radio_drops"));

const padsApiRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/pads/[id]/route.ts"), "utf8");
check("Pads PATCH/DELETE route enforces requireAdmin", padsApiRoute.includes("requireAdmin(req)"));
check("Pad deletion explicitly only deletes from soundboard_pads", padsApiRoute.includes("DELETE FROM soundboard_pads WHERE id = $1"));
check("Pad deletion does NOT delete from radio_drops", !padsApiRoute.includes("DELETE FROM radio_drops"));

// 5. Reorder Route Atomic Transaction Checks
const reorderRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/reorder/route.ts"), "utf8");
check("Reorder route enforces requireAdmin", reorderRoute.includes("requireAdmin(req)"));
check("Reorder route begins transaction", reorderRoute.includes('client.query("BEGIN")'));
check("Reorder route commits transaction", reorderRoute.includes('client.query("COMMIT")'));
check("Reorder route rolls back on error", reorderRoute.includes('client.query("ROLLBACK")'));
check("Reorder route releases DB client in finally block", reorderRoute.includes("client.release()"));

// 6. Bank Management Route Checks
const bankRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/banks/[id]/route.ts"), "utf8");
check("Bank route enforces requireAdmin", bankRoute.includes("requireAdmin(req)"));
check("Bank route protects last remaining bank from deletion", bankRoute.includes("Cannot delete the last remaining bank"));

console.log("\n================================");
if (process.exitCode === 1) {
  console.log("Some soundboard checks failed.");
} else {
  console.log("All soundboard checks passed.");
}
console.log("================================");
