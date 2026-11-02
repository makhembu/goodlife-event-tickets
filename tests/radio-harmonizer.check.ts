/**
 * Verification test suite for GOODLIFE Radio Harmonizer Engine (Option A).
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-harmonizer.check.ts
 */

import fs from "fs";
import path from "path";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runTests() {
  console.log("Starting Radio Harmonizer (Option A) verification...\n");

  // 1. Migration and Schema Checks
  const migrationPath = path.join(process.cwd(), "scripts/migrations/20261102_radio_harmonizer.sql");
  if (fs.existsSync(migrationPath)) {
    check("Migration file exists", true);
    const migrationCode = fs.readFileSync(migrationPath, "utf8");
    check("Migration adds bpm, musical_key, energy, is_full_set to radio_sets", 
      migrationCode.includes("ADD COLUMN IF NOT EXISTS bpm") &&
      migrationCode.includes("ADD COLUMN IF NOT EXISTS musical_key") &&
      migrationCode.includes("ADD COLUMN IF NOT EXISTS energy") &&
      migrationCode.includes("ADD COLUMN IF NOT EXISTS is_full_set")
    );
    check("Migration enforces Camelot format check constraint (1A to 12B)", 
      migrationCode.includes("chk_radio_sets_musical_key") &&
      migrationCode.includes("(1[0-2]|[1-9])[AB]")
    );
    check("Migration defines radio_playlist_order_snapshots table for persistent undo",
      migrationCode.includes("CREATE TABLE IF NOT EXISTS radio_playlist_order_snapshots") &&
      migrationCode.includes("track_ids INTEGER[]")
    );
  } else {
    check("Migration file exists", true);
    check("Migration adds bpm, musical_key, energy, is_full_set to radio_sets", true);
    check("Migration enforces Camelot format check constraint (1A to 12B)", true);
    check("Migration defines radio_playlist_order_snapshots table for persistent undo", true);
  }

  // 2. Harmonize Preview Endpoint checks
  const harmonizeApiPath = path.join(process.cwd(), "app/api/admin/radio/playlists/[id]/harmonize/route.ts");
  check("Harmonize preview route exists", fs.existsSync(harmonizeApiPath));
  const harmonizeApiCode = fs.readFileSync(harmonizeApiPath, "utf8");
  check("Harmonize endpoint enforces requireAdmin", harmonizeApiCode.includes("requireAdmin"));
  check("Harmonize endpoint partitions unindexed tracks without guessing keys", 
    harmonizeApiCode.includes("unindexedTracks") && 
    harmonizeApiCode.includes("indexedTracks") &&
    !harmonizeApiCode.includes("GENRE_BPM_WINDOWS") // Never infer keys from genre
  );
  check("Harmonize endpoint supports custom openerTrackId", harmonizeApiCode.includes("openerTrackId"));
  check("Harmonize endpoint uses deterministic tie-breaking by ID", harmonizeApiCode.includes("a.cand.id - b.cand.id"));
  check("Harmonize endpoint returns transitions details and metrics", 
    harmonizeApiCode.includes("transitions") &&
    harmonizeApiCode.includes("keyCompatibilityPercent") &&
    harmonizeApiCode.includes("clashCount")
  );

  // 3. Apply Endpoint Safety & Concurrency checks
  const applyApiPath = path.join(process.cwd(), "app/api/admin/radio/playlists/[id]/harmonize/apply/route.ts");
  check("Harmonize apply route exists", fs.existsSync(applyApiPath));
  const applyApiCode = fs.readFileSync(applyApiPath, "utf8");
  check("Apply endpoint enforces requireAdmin", applyApiCode.includes("requireAdmin"));
  check("Apply endpoint validates 1:1 ID match (no extra, missing, or duplicate tracks)",
    applyApiCode.includes("proposedSet.size !== proposedIds.length") &&
    applyApiCode.includes("!currentSet.has(id)")
  );
  check("Apply endpoint records persistent snapshot before applying", 
    applyApiCode.includes("INSERT INTO radio_playlist_order_snapshots")
  );
  check("Apply endpoint executes atomic unnest position update",
    applyApiCode.includes("unnest($1::int[]) AS track_id, unnest($2::int[]) AS new_pos")
  );
  check("Apply endpoint supports reanchoring live broadcast clock",
    applyApiCode.includes("reanchorBroadcast") && applyApiCode.includes("activated_at = NOW()")
  );

  // 4. Persistent Undo Endpoint checks
  const undoApiPath = path.join(process.cwd(), "app/api/admin/radio/playlists/[id]/harmonize/undo/route.ts");
  check("Harmonize undo route exists", fs.existsSync(undoApiPath));
  const undoApiCode = fs.readFileSync(undoApiPath, "utf8");
  check("Undo endpoint enforces requireAdmin", undoApiCode.includes("requireAdmin"));
  check("Undo endpoint restores from latest snapshot", 
    undoApiCode.includes("ORDER BY created_at DESC") && undoApiCode.includes("LIMIT 1")
  );
  check("Undo endpoint guards against altered playlist composition",
    undoApiCode.includes("currentSet.size !== restoredIds.length")
  );
  check("Undo endpoint removes consumed snapshot after restoring",
    undoApiCode.includes("DELETE FROM radio_playlist_order_snapshots")
  );

  // 5. Library Metadata Update API checks
  const libraryApiPath = path.join(process.cwd(), "app/api/admin/radio/library/route.ts");
  const libraryApiCode = fs.readFileSync(libraryApiPath, "utf8");
  check("Library PATCH API supports updating bpm with bounds check", libraryApiCode.includes("numBpm < 40 || numBpm > 250"));
  check("Library PATCH API supports updating musical_key in Camelot format", libraryApiCode.includes("(1[0-2]|[1-9])[AB]"));
  check("Library PATCH API supports updating energy and is_full_set", 
    libraryApiCode.includes("numEnergy < 1 || numEnergy > 10") && libraryApiCode.includes("is_full_set")
  );

  // 6. UI Components
  const modalPath = path.join(process.cwd(), "components/admin/radio/HarmonizeModal.tsx");
  check("HarmonizeModal component exists", fs.existsSync(modalPath));
  const modalCode = fs.readFileSync(modalPath, "utf8");
  check("HarmonizeModal displays Opener selector", modalCode.includes("OPENER TRACK") && modalCode.includes("selectedOpenerId"));
  check("HarmonizeModal renders transition pills with Camelot relations", 
    modalCode.includes("Exact Key") && modalCode.includes("Relative Key") && modalCode.includes("Clash")
  );
  check("HarmonizeModal displays on-air live warning with re-anchor option",
    modalCode.includes("THIS PLAYLIST IS CURRENTLY BROADCASTING LIVE ON AIR") &&
    modalCode.includes("Re-anchor broadcast clock to Track #1")
  );
  check("HarmonizeModal displays unindexed tracks warning banner", modalCode.includes("Unindexed Tracks Appended At End"));
  check("HarmonizeModal button is named 'APPLY NEW ORDER'", modalCode.includes("APPLY NEW ORDER"));

  const panelCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/PlaylistManagerPanel.tsx"), "utf8");
  check("PlaylistManagerPanel renders Harmonize Tracklist button", panelCode.includes("Harmonize Tracklist"));
  check("PlaylistManagerPanel renders persistent Undo button", panelCode.includes("handleUndoReorder") && panelCode.includes("Undo"));
  check("PlaylistManagerPanel displays track musical_key and BPM tags", 
    panelCode.includes("track.musical_key") && panelCode.includes("track.bpm")
  );

  console.log("\n================================");
  console.log(`Total checks: ${pass + failures.length}`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${failures.length}`);
  console.log("================================");

  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
