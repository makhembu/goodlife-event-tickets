// tests/soundboard-database.check.ts
import fs from "fs";
import path from "path";
import { isValidSoundboardAudioUrl } from "../lib/radio/soundboard-helpers";

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

// 2. Migration and Source Checks
const migrationCode = fs.readFileSync(path.join(process.cwd(), "scripts/migrate-soundboard.js"), "utf8");
check("Migration defines soundboard_banks table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_banks"));
check("Migration defines soundboard_pads table", migrationCode.includes("CREATE TABLE IF NOT EXISTS soundboard_pads"));
check("Migration references radio_drops on delete set null", migrationCode.includes("REFERENCES radio_drops(id) ON DELETE SET NULL"));
check("Migration seeds only when soundboard_banks is empty", migrationCode.includes("SELECT COUNT(*)::int as count FROM soundboard_banks"));
check("Migration verifies audio files exist in public/", migrationCode.includes("fs.existsSync(fullPath)"));

// 3. API Route Source Checks
const apiRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/route.ts"), "utf8");
check("Soundboard API route enforces requireAdmin", apiRoute.includes("requireAdmin(req)"));
check("Soundboard API route queries soundboard_banks", apiRoute.includes("FROM soundboard_banks"));
check("Soundboard API route queries soundboard_pads", apiRoute.includes("FROM soundboard_pads"));
check("Soundboard API route returns Drops Vault options from radio_drops", apiRoute.includes("FROM radio_drops"));

const padsApiRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/radio/soundboard/pads/[id]/route.ts"), "utf8");
check("Pads PATCH/DELETE route enforces requireAdmin", padsApiRoute.includes("requireAdmin(req)"));
check("Pad deletion explicitly only deletes from soundboard_pads", padsApiRoute.includes("DELETE FROM soundboard_pads WHERE id = $1"));
check("Pad deletion does NOT delete from radio_drops", !padsApiRoute.includes("DELETE FROM radio_drops"));

console.log("\n================================");
if (process.exitCode === 1) {
  console.log("Some soundboard checks failed.");
} else {
  console.log("All soundboard checks passed.");
}
console.log("================================");
