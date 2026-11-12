/**
 * Audio Duration Accuracy & Dead-Air Prevention Verification Suite
 *
 * Verifies that:
 * 1. HIPHOP MIX (id = 649) has exact duration (1893s / 31:33) and bitrate (192) in DB.
 * 2. Full sets do not suffer from the 160kbps division bug (e.g. MARARA MIXX duration is accurate).
 * 3. sync-r2-catalog.js does not use naive 'size / 20000' division.
 * 4. lib/radio/audio-prober.ts works accurately for time formatting and probing.
 * 5. register-upload endpoint integrates probeAudioMetadata.
 */

import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { formatAudioDuration } from "../lib/radio/audio-prober";

function assert(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}${detail ? ` -> ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log("=== Audio Duration Accuracy & Dead-Air Prevention Suite ===");

  // 1. Unit test: duration formatting
  assert(formatAudioDuration(1893) === "31:33", "formatAudioDuration(1893) formats to '31:33'");
  assert(formatAudioDuration(10303) === "2:51:43", "formatAudioDuration(10303) formats to '2:51:43'");
  assert(formatAudioDuration(45) === "0:45", "formatAudioDuration(45) formats to '0:45'");

  // 2. Static analysis: sync-r2-catalog.js does not have 'size / 20000'
  const syncScriptPath = path.resolve(process.cwd(), "scripts/sync-r2-catalog.js");
  if (fs.existsSync(syncScriptPath)) {
    const content = fs.readFileSync(syncScriptPath, "utf8");
    assert(!content.includes("t.size / 20000") && !content.includes("size / 20000"), "sync-r2-catalog.js does not contain naive 'size / 20000' calculation");
    assert(content.includes("probeAudioQuick"), "sync-r2-catalog.js uses probeAudioQuick for dynamic stream probing");
  } else {
    assert(false, "sync-r2-catalog.js exists");
  }

  // 3. Static analysis: register-upload route integrates probeAudioMetadata
  const regUploadPath = path.resolve(process.cwd(), "app/api/admin/radio/register-upload/route.ts");
  if (fs.existsSync(regUploadPath)) {
    const content = fs.readFileSync(regUploadPath, "utf8");
    assert(content.includes("probeAudioMetadata"), "register-upload route imports probeAudioMetadata");
    assert(content.includes("formatAudioDuration"), "register-upload route uses formatAudioDuration");
  } else {
    assert(false, "register-upload route exists");
  }

  // 4. Live database checks
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    const m = env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
    if (m && m[1]) {
      const pool = new Pool({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } });
      try {
        const res = await pool.query(`
          SELECT id, title, duration_sec, duration, bitrate, file_size
          FROM radio_sets
          WHERE id IN (643, 646, 649)
          ORDER BY id ASC
        `);

        const map = new Map(res.rows.map((r: any) => [r.id, r]));

        // Check HIPHOP MIX (id = 649)
        const hiphop = map.get(649);
        assert(hiphop !== undefined, "HIPHOP MIX (id=649) exists in database");
        if (hiphop) {
          assert(hiphop.duration_sec === 1893, `HIPHOP MIX duration_sec is 1893 (actual: ${hiphop.duration_sec})`);
          assert(hiphop.bitrate === 192, `HIPHOP MIX bitrate is 192 (actual: ${hiphop.bitrate})`);
          assert(hiphop.duration === "31:33", `HIPHOP MIX formatted duration is '31:33' (actual: '${hiphop.duration}')`);
        }

        // Check MARARA MIXX (id = 643) - previously inflated by 1.7 hours!
        const marara = map.get(643);
        assert(marara !== undefined, "MARARA MIXX (id=643) exists in database");
        if (marara) {
          assert(marara.duration_sec === 10303, `MARARA MIXX duration_sec is 10303s (actual: ${marara.duration_sec})`);
          assert(marara.bitrate === 256, `MARARA MIXX bitrate is 256k (actual: ${marara.bitrate})`);
        }

        // Check GROWN AND SEXY 2 (id = 646) - previously inflated by 11.5 minutes!
        const grown = map.get(646);
        assert(grown !== undefined, "GROWN AND SEXY 2 (id=646) exists in database");
        if (grown) {
          assert(grown.duration_sec === 3422, `GROWN AND SEXY 2 duration_sec is 3422s (actual: ${grown.duration_sec})`);
          assert(grown.bitrate === 192, `GROWN AND SEXY 2 bitrate is 192k (actual: ${grown.bitrate})`);
        }

        // Check SAWA SAWA (id = 768) - previously had 60s silence outro!
        const sawaRes = await pool.query(`SELECT id, title, duration_sec, duration, bitrate FROM radio_sets WHERE id = 768`);
        const sawa = sawaRes.rows[0];
        assert(sawa !== undefined, "SAWA SAWA (id=768) exists in database");
        if (sawa) {
          assert(sawa.duration_sec === 191, `SAWA SAWA duration_sec is 191s (3:11) (actual: ${sawa.duration_sec})`);
          assert(sawa.duration === "3:11", `SAWA SAWA formatted duration is '3:11' (actual: '${sawa.duration}')`);
        }
      } catch (err: any) {
        assert(false, "Database query succeeded", err.message);
      } finally {
        await pool.end();
      }
    }
  }

  // 5. Static analysis: radio-ingest webhook and batch-ingest routes integrate probeAudioMetadata
  const webhookPath = path.resolve(process.cwd(), "app/api/webhooks/radio-ingest/route.ts");
  if (fs.existsSync(webhookPath)) {
    const content = fs.readFileSync(webhookPath, "utf8");
    assert(content.includes("probeAudioMetadata"), "radio-ingest webhook imports probeAudioMetadata");
  }

  const batchIngestPath = path.resolve(process.cwd(), "app/api/admin/radio/batch-ingest/route.ts");
  if (fs.existsSync(batchIngestPath)) {
    const content = fs.readFileSync(batchIngestPath, "utf8");
    assert(content.includes("probeAudioMetadata"), "batch-ingest route imports probeAudioMetadata");
  }

  // 6. Static analysis: radio-bridge-server.py has silenceremove filter
  const bridgeServerPath = path.resolve(process.cwd(), "scripts/radio-bridge-server.py");
  if (fs.existsSync(bridgeServerPath)) {
    const content = fs.readFileSync(bridgeServerPath, "utf8");
    assert(content.includes("silenceremove=stop_periods=-1"), "radio-bridge-server.py includes silenceremove filter to strip trailing dead air");
  }

  console.log("=== Verification Completed ===");
}

run();
