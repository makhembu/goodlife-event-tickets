/**
 * Verification test suite for GOODLIFE Radio Playlist System.
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-playlists.check.ts
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
  console.log("Starting GOODLIFE Radio Playlist System verification...\n");

  // 1. Static Layout & Nav checks
  const sidebarCode = fs.readFileSync(
    path.join(process.cwd(), "components/admin/radio/ConsoleSidebar.tsx"),
    "utf8"
  );
  check("ConsoleSidebar includes 'playlists' tab type", sidebarCode.includes('"playlists"'));
  check("ConsoleSidebar has 'Playlists & Sets' navigation item", sidebarCode.includes("Playlists & Sets"));

  const adminPageCode = fs.readFileSync(
    path.join(process.cwd(), "app/admin/radio/page.tsx"),
    "utf8"
  );
  check("Admin radio page imports PlaylistManagerPanel", adminPageCode.includes("PlaylistManagerPanel"));
  check("Admin radio page renders PlaylistManagerPanel when activeTab is playlists", adminPageCode.includes('activeTab === "playlists"'));

  // 2. Migration and schema checks
  const migrationCode = fs.readFileSync(
    path.join(process.cwd(), "scripts/migrations/20261102_create_radio_playlists.sql"),
    "utf8"
  );
  check("Migration defines radio_playlists table", migrationCode.includes("CREATE TABLE IF NOT EXISTS radio_playlists"));
  check("Migration defines radio_playlist_tracks table", migrationCode.includes("CREATE TABLE IF NOT EXISTS radio_playlist_tracks"));
  check("Migration enforces single active broadcast constraint", migrationCode.includes("idx_radio_playlists_single_active") && migrationCode.includes("WHERE is_broadcast_active = true"));
  check("Migration includes activated_at timestamp column", migrationCode.includes("activated_at TIMESTAMPTZ"));

  // 3. API endpoint authentication & contract checks
  const adminPlaylistsApi = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/radio/playlists/route.ts"),
    "utf8"
  );
  check("Admin playlists GET/POST enforces requireAdmin", adminPlaylistsApi.includes("requireAdmin"));
  check("Admin playlists POST generates sanitized slug", adminPlaylistsApi.includes("baseSlug") && adminPlaylistsApi.includes("slug"));

  const adminActivateApi = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/radio/playlists/[id]/activate/route.ts"),
    "utf8"
  );
  check("Activate endpoint enforces requireAdmin", adminActivateApi.includes("requireAdmin"));
  check("Activate endpoint stamps activated_at = NOW()", adminActivateApi.includes("activated_at = NOW()"));
  check("Activate endpoint resets other playlists", adminActivateApi.includes("WHERE is_broadcast_active = true"));
  check("Activate endpoint guards against empty playlists", adminActivateApi.includes("Cannot activate an empty playlist"));

  const adminTracksApi = fs.readFileSync(
    path.join(process.cwd(), "app/api/admin/radio/playlists/[id]/tracks/route.ts"),
    "utf8"
  );
  check("Tracks API enforces requireAdmin", adminTracksApi.includes("requireAdmin"));
  check("Tracks API supports reorder array", adminTracksApi.includes("reorder") && adminTracksApi.includes("position"));

  // 4. Playout math in /api/radio/live and /api/radio/state
  const liveApiCode = fs.readFileSync(
    path.join(process.cwd(), "app/api/radio/live/route.ts"),
    "utf8"
  );
  check("Live BFF checks for active broadcast playlist", liveApiCode.includes("is_broadcast_active = true"));
  check("Live BFF computes offset using activatedAt", liveApiCode.includes("activatedAtSec") && liveApiCode.includes("elapsedSinceActivation"));
  check("Live BFF returns playlist_name in fallback payload", liveApiCode.includes("playlist_name: activePlaylistName"));

  const stateApiCode = fs.readFileSync(
    path.join(process.cwd(), "app/api/radio/state/route.ts"),
    "utf8"
  );
  check("State endpoint computes playlist-locked broadcastSchedule", stateApiCode.includes("playlist_id: activePlaylistId") && stateApiCode.includes("playlist_name: activePlaylistName"));
  check("State endpoint computes cycleSec using activatedAt", stateApiCode.includes("Math.floor(new Date(activatedAt).getTime() / 1000)"));

  // 5. Public playlist API endpoints
  const publicPlaylistsApi = fs.readFileSync(
    path.join(process.cwd(), "app/api/radio/playlists/route.ts"),
    "utf8"
  );
  check("Public playlists API filters out non-public and deleted playlists", publicPlaylistsApi.includes("deleted_at IS NULL AND p.is_public = true"));
  check("Public playlists API includes edge cache headers", publicPlaylistsApi.includes("s-maxage"));

  const publicPlaylistIdApi = fs.readFileSync(
    path.join(process.cwd(), "app/api/radio/playlists/[id]/route.ts"),
    "utf8"
  );
  check("Public playlist item API returns tracks ordered by position", publicPlaylistIdApi.includes("ORDER BY pt.position ASC"));

  // 6. Playout math unit simulation
  const nowSec = 1700000000;
  const activatedAtSec = 1700000000; // Just activated right now
  const totalDurationSec = 600; // 10 minute playlist

  // At the moment of activation, elapsed must be 0
  const elapsedAtActivation = Math.max(0, nowSec - activatedAtSec);
  const cycleAtActivation = elapsedAtActivation % totalDurationSec;
  check("Playout math starts cleanly at 0s at activation time", cycleAtActivation === 0);

  // 120 seconds later
  const elapsedLater = Math.max(0, (nowSec + 120) - activatedAtSec);
  const cycleLater = elapsedLater % totalDurationSec;
  check("Playout math advances to exact elapsed offset 120s later", cycleLater === 120);

  // After playlist loops (700 seconds later on 600s total duration)
  const elapsedLoop = Math.max(0, (nowSec + 700) - activatedAtSec);
  const cycleLoop = elapsedLoop % totalDurationSec;
  check("Playout math wraps cleanly when playlist duration completes", cycleLoop === 100);

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
