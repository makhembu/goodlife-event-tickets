/**
 * Verification test for Radio Playlist Resolver (large playlists & YouTube Innertube continuation).
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-playlist-resolution.check.ts
 */

import { extractPlaylistId, resolvePlaylist } from "../lib/radio/playlist-resolver";

async function run() {
  console.log("Checking extractPlaylistId edge cases...");
  const t1 = extractPlaylistId("https://youtube.com/playlist?list=PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE&si=yGp3NQCy_H8ZOC7b");
  if (t1.type !== "youtube" || t1.id !== "PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE") {
    throw new Error(`extractPlaylistId failed on standard playlist URL: ${JSON.stringify(t1)}`);
  }

  const t2 = extractPlaylistId("https://music.youtube.com/playlist?list=PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE");
  if (t2.type !== "youtube" || t2.id !== "PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE") {
    throw new Error(`extractPlaylistId failed on YouTube Music URL: ${JSON.stringify(t2)}`);
  }

  const t3 = extractPlaylistId("youtube.com/playlist?list=PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE");
  if (t3.type !== "youtube" || t3.id !== "PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE") {
    throw new Error(`extractPlaylistId failed on protocol-less URL: ${JSON.stringify(t3)}`);
  }

  console.log("PASS: extractPlaylistId parses URLs correctly.");

  console.log("Resolving 150-track YouTube playlist with pagination...");
  const url = "https://youtube.com/playlist?list=PLjazO1G219bd6COaFBvKm0h4YlKDIvmTE&si=yGp3NQCy_H8ZOC7b";
  const res = await resolvePlaylist(url);

  console.log(`PASS: Playlist title: "${res.title}"`);
  console.log(`PASS: Total tracks retrieved: ${res.track_count}`);

  if (res.track_count < 140) {
    throw new Error(`Expected at least 140 playable tracks, got ${res.track_count}`);
  }

  if (!res.tracks[0]?.video_id || !res.tracks[0]?.title) {
    throw new Error("Track data missing video_id or title");
  }

  console.log("PASS: Successfully resolved large playlist (>100 tracks) with full pagination!");
}

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
