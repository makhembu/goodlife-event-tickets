import fs from "fs";
import path from "path";
import {
  extractCoordsFromMapsUrl,
  toSpokenPlace,
  toSpokenDriveTime,
  toSpokenWeatherSummary,
} from "../lib/radio/drop-context";
import {
  extractPrimaryArtist,
  getGenreBridgeScore,
  buildHarmonicSequence,
  type TrackWithHarmony,
} from "../lib/radio/harmonic-graph";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
    failed++;
  }
}

console.log("=== GOODLIFE Studio & Radio Pro Upgrades Verification ===\n");

// 1. Live Mic Prompter Sync & Rundown Single-Scroll UX
const radioCtxCode = fs.readFileSync(path.join(process.cwd(), "context/RadioContext.tsx"), "utf8");
const rundownCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/OnAirRundown.tsx"), "utf8");
const micCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/BrowserMicRecorder.tsx"), "utf8");
const studioPageCode = fs.readFileSync(path.join(process.cwd(), "app/admin/radio/page.tsx"), "utf8");

check(
  "RadioContext activates polling on /admin/radio while keeping public cadence literal",
  radioCtxCode.includes('pathname?.startsWith("/admin/radio")') &&
    radioCtxCode.includes("(isOnRadioPage && isPlaying) ? 5000 : 30000")
);
check(
  "OnAirRundown removes mobile double-scroll trap and includes Full Queue Drawer",
  !rundownCode.includes("overflow-y-auto max-h-[420px]") &&
    rundownCode.includes("Full Queue") &&
    rundownCode.includes("onTrackStateSync")
);
check(
  "BrowserMicRecorder receives direct syncedTrack prop from OnAirRundown",
  micCode.includes("syncedTrack?:") &&
    studioPageCode.includes("syncedTrack={syncedBroadcastTrack}")
);

// 2. Drops Vault Queue & On-Air Fire Buttons
const aiGenCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/AiDropGenerator.tsx"), "utf8");
const dropMgrCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/DropManagerPanel.tsx"), "utf8");

check(
  "AiDropGenerator exposes Send to Cue and Fire On Air actions",
  aiGenCode.includes("Send to Cue") &&
    aiGenCode.includes("Fire On Air") &&
    aiGenCode.includes("airLiveDrop")
);
check(
  "DropManagerPanel vault items expose Send to Cue and Fire On Air actions",
  dropMgrCode.includes("Send to Cue") &&
    dropMgrCode.includes("Fire On Air") &&
    dropMgrCode.includes("airLiveDrop")
);

// 3. Unified Drop Context Endpoint + Broadcast Tags + Event Lineup Editing
const dropCtxCode = fs.readFileSync(path.join(process.cwd(), "lib/radio/drop-context.ts"), "utf8");
const dropCtxRouteCode = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/radio/drops/context/route.ts"),
  "utf8"
);
const dropStudioCode = fs.readFileSync(path.join(process.cwd(), "components/admin/radio/DropStudio.tsx"), "utf8");
const editEventCode = fs.readFileSync(
  path.join(process.cwd(), "app/admin/events/[id]/edit/EventEditClient.tsx"),
  "utf8"
);
const createEventCode = fs.readFileSync(
  path.join(process.cwd(), "components/admin/CreateEventModal.tsx"),
  "utf8"
);

check(
  "Unified context route enforces requireAdmin",
  dropCtxRouteCode.includes("requireAdmin(req)")
);
check(
  "drop-context never queries customer PII columns",
  !dropCtxCode.includes("customer_phone") &&
    !dropCtxCode.includes("customer_email") &&
    !dropCtxCode.includes("whatsapp_number")
);
check(
  "DropStudio loads live tags from /api/admin/radio/drops/context",
  dropStudioCode.includes("/api/admin/radio/drops/context")
);
check(
  "EventEditClient and CreateEventModal expose artist lineup + confirmation controls",
  editEventCode.includes('set("lineup"') &&
    editEventCode.includes('set("lineup_confirmed"') &&
    createEventCode.includes("lineup_confirmed")
);

const c1 = extractCoordsFromMapsUrl("https://www.google.com/maps/@-1.0365,37.0721,15z");
check("extractCoordsFromMapsUrl parses @lat,lng accurately", c1?.lat === -1.0365 && c1?.lng === 37.0721);
const c2 = extractCoordsFromMapsUrl("https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika");
check("extractCoordsFromMapsUrl falls back cleanly for Marara links", c2 !== null && c2.lat < 0);

// 4. Optional Streaming Link Ingestion & Refresh Persistence
const plPanelCode = fs.readFileSync(
  path.join(process.cwd(), "components/admin/radio/PlaylistManagerPanel.tsx"),
  "utf8"
);
const webhookCode = fs.readFileSync(
  path.join(process.cwd(), "app/api/webhooks/radio-ingest/route.ts"),
  "utf8"
);

check(
  "PlaylistManagerPanel Create modal supports optional streaming link + localStorage/DB job persistence",
  plPanelCode.includes("Spotify or YouTube Playlist Link (Optional)") &&
    plPanelCode.includes("goodlife_playlist_ingest_jobs_v1") &&
    plPanelCode.includes("ingest_job_id")
);
check(
  "Radio ingest webhook attaches completed tracks to target playlist_id when provided",
  webhookCode.includes("playlist_id") && webhookCode.includes("INSERT INTO radio_playlist_tracks")
);

// 5. Parallel Batch Harmonizer Energy Persistence
const batchCode = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/radio/library/harmonize-batch/route.ts"),
  "utf8"
);
check(
  "harmonize-batch uses concurrent waves and persists energy",
  batchCode.includes("Promise.all") && batchCode.includes("energy =")
);

// 6. Pro Homeboyz Radio / NRG Harmonic Sequencing
check(
  "extractPrimaryArtist parses artist from YouTube title when dj_name is generic resident",
  extractPrimaryArtist("Burna Boy - City Boys (Official Audio)", "GOODLIFE Resident") === "burna boy"
);
check(
  "getGenreBridgeScore rewards related Afro rhythms and dampens abrupt genre cliffs",
  getGenreBridgeScore("Amapiano", "Afro House") > 0 &&
    getGenreBridgeScore("Amapiano", "Rock") < 0
);

// Verify anti-monotony + artist cooldown in a realistic mock set
const proTracks: TrackWithHarmony[] = [
  { id: 1, title: "Burna Boy - City Boys", dj_name: "GOODLIFE Resident", genre: "Afrobeats", bpm: 112, musical_key: "8A", energy: 6 },
  { id: 2, title: "Burna Boy - Sittin On Top", dj_name: "GOODLIFE Resident", genre: "Afrobeats", bpm: 112, musical_key: "8A", energy: 6 },
  { id: 3, title: "Tyler ICU - Mnike", dj_name: "GOODLIFE Resident", genre: "Amapiano", bpm: 113, musical_key: "8B", energy: 7 },
  { id: 4, title: "Kabza De Small - Imithandazo", dj_name: "GOODLIFE Resident", genre: "Amapiano", bpm: 112, musical_key: "9B", energy: 7 },
  { id: 5, title: "Kelvin Momo - Ivy League", dj_name: "GOODLIFE Resident", genre: "Amapiano", bpm: 113, musical_key: "8A", energy: 6 },
];
const seq = buildHarmonicSequence(proTracks, { seedTrackId: 1 });
check(
  "buildHarmonicSequence separates same-artist consecutive Burna Boy tracks parsed from title",
  seq[0].id === 1 && seq[1].id !== 2,
  `Order: ${seq.map((s) => s.id).join(" -> ")}`
);
check(
  "buildHarmonicSequence modulates harmonically instead of locking in 8A when better relative/adjacent neighbor exists",
  seq.some((t, i) => i > 0 && t.musical_key !== "8A"),
  `Keys: ${seq.map((s) => s.musical_key).join(" -> ")}`
);

// 7. 9.5/10 Spoken TTS Formatting & Gapless Audible Ducking
check(
  "toSpokenPlace converts ALL-CAPS venue names to natural speech casing",
  toSpokenPlace("THE HUB GARDEN, NAIROBI") === "The Hub Garden"
);
const drivePhrase = toSpokenDriveTime(23, "The Hub Garden");
check(
  "toSpokenDriveTime speaks conversational cruise without telemetry symbols or decimals",
  !drivePhrase.includes("km") && !/\d/.test(drivePhrase) && drivePhrase.includes("The Hub Garden")
);
const weatherPhrase = toSpokenWeatherSummary("Light drizzle", 16);
check(
  "toSpokenWeatherSummary speaks weather without °C or digits",
  !weatherPhrase.includes("°") && !/\d/.test(weatherPhrase)
);

const writeScriptCode = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/radio/drops/write-script/route.ts"),
  "utf8"
);
check(
  "write-script enforces sanitizeScriptForTts and rejects telemetry metrics",
  writeScriptCode.includes("sanitizeScriptForTts") && writeScriptCode.includes("strictTts")
);

const liveRouteCode = fs.readFileSync(
  path.join(process.cwd(), "app/api/radio/live/route.ts"),
  "utf8"
);
check(
  "/api/radio/live includes audio_url on up_next tracks for gapless transition",
  liveRouteCode.includes("audio_url: t.audio_url")
);
check(
  "RadioContext uses audible low-volume duck bed (~30%) and allows ended tracks to advance during active drops",
  radioCtxCode.includes("Math.max(0.24, Math.min(0.36,") &&
    !radioCtxCode.includes("* 0.22") &&
    radioCtxCode.includes("if (isDropPlayingRef.current && !audioRef.current?.ended) return;")
);
check(
  "PlaylistManagerPanel highlights the currently playing track with ON AIR NOW badge and Jump to Playing",
  plPanelCode.includes("activeOnAirSetId") &&
    plPanelCode.includes("ON AIR NOW") &&
    plPanelCode.includes("Jump to Playing")
);
check(
  "PlaylistManagerPanel uses custom modals instead of native browser confirm() dialogs",
  !plPanelCode.includes("confirm(") &&
    plPanelCode.includes("deleteModalTarget") &&
    plPanelCode.includes("showUndoModal")
);
check(
  "PlaylistManagerPanel supports Quick Add Song (Search/Link) and Import Playlist / Merge inside open playlist",
  plPanelCode.includes("Quick Add Song") &&
    plPanelCode.includes("Import Playlist / Merge") &&
    plPanelCode.includes("handleMergeSavedPlaylist")
);

check(
  "OnAirRundown and PlaylistManagerPanel both expose Quick Edit Track Properties modal/drawer",
  rundownCode.includes("onEditTrack") &&
    rundownCode.includes("Edit Track Properties") &&
    plPanelCode.includes("onEditTrack") &&
    studioPageCode.includes("rundownRefreshTick")
);
check(
  "RadioContext implements Dual-Deck Equal-Power Crossfader and 3-Track Browser Preloader",
  radioCtxCode.includes("executeCrossfade") &&
    radioCtxCode.includes("activeDeckRef") &&
    radioCtxCode.includes("urlsToPreload") &&
    rundownCode.includes("handlePlayNow")
);

console.log(`\nChecks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
