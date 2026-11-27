# Universal Mobile Radio Broadcaster (OpenBroadcaster / GoodLife Radio) Plan

> **For Claude / Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 100% free, open-source Android Jetpack Compose broadcasting app in a standalone directory (`C:\Users\Khesh\Downloads\goodlife-broadcaster-android`) that allows presenters, DJs, and podcasters anywhere to stream songs, playlists, or live audio directly from their phone to **any radio server** (Icecast 2, AzuraCast, Liquidsoap, Shoutcast v1/v2), featuring station profile management, 1-tap GoodLife preset, lockscreen background playback survival, and zero ads/paywalls.

**Project Root:** `C:\Users\Khesh\Downloads\goodlife-broadcaster-android` (Dedicated standalone repository, completely separated from the ticketing codebase).

**Architecture:** Kotlin 1.9+ with Jetpack Compose (BOM 2024.02.01) and Material 3 UI. Multi-protocol streaming engine (Icecast 2 HTTP `SOURCE`/`PUT` and Shoutcast ICY handshake) running inside an Android Foreground Service (`FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`) with hardware `WakeLock` and `WifiLock` for rock-solid lockscreen survival. Profile repository with JSON export/import for easy sharing of station credentials between presenters. Android Storage Access Framework (SAF) for picking individual audio files and entire music folders with persistent URI permissions.

**Tech Stack:** Kotlin, Jetpack Compose, Material 3, AndroidX Room / SharedPreferences, AndroidX Lifecycle / ViewModel / StateFlow, Android Foreground Service, MediaSessionCompat, Java NIO / TCP Sockets, Android Storage Access Framework (SAF).

---

### Task 1: Standalone Project Scaffolding & Manifest Configuration

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/build.gradle.kts`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/settings.gradle.kts`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/gradle.properties`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/build.gradle.kts`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/AndroidManifest.xml`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/res/values/strings.xml`

**Requirements:**
- Independent Gradle project at `C:\Users\Khesh\Downloads\goodlife-broadcaster-android`.
- Android SDK: `compileSdk = 34`, `minSdk = 26` (Android 8.0+), `targetSdk = 34` (Android 14).
- Dependencies:
  - Compose BOM: `2024.02.01`
  - `androidx.compose.material3:material3`
  - `androidx.compose.material:material-icons-extended`
  - `androidx.compose.ui:ui`
  - `androidx.compose.ui:ui-tooling-preview`
  - `androidx.activity:activity-compose:1.8.2`
  - `androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0`
  - `androidx.lifecycle:lifecycle-runtime-compose:2.7.0`
  - `androidx.media:media:1.7.0`
  - `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0`
  - `org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3` (for profile export/import)
- Permissions:
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.WAKE_LOCK`
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  - `android.permission.POST_NOTIFICATIONS`
  - `android.permission.READ_MEDIA_AUDIO`

---

### Task 2: Station Profile Model & Multi-Station Presets

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/model/StationProfile.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/model/BroadcastProtocol.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/model/AudioCodec.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/profile/StationProfileRepository.kt`
- Test: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/test/java/com/goodlife/broadcaster/StationProfileTest.kt`

**Profile Data Structure:**
```kotlin
@Serializable
data class StationProfile(
    val id: String = UUID.randomUUID().toString(),
    val name: String,                           // e.g. "GOODLIFE Radio 254", "My Custom Station"
    val protocol: BroadcastProtocol = BroadcastProtocol.ICECAST_2, // ICECAST_2, SHOUTCAST_V1, SHOUTCAST_V2
    val host: String,                           // e.g. "stream.darajadigital.com"
    val port: Int = 8005,
    val mount: String = "/live",                // e.g. "/live", "/stream", "/"
    val username: String = "source",            // e.g. "source" or "dj_<name>"
    val password: String = "",                  // Stream key or station password
    val codec: AudioCodec = AudioCodec.MP3,     // MP3, AAC
    val bitrateKbps: Int = 320,                 // 64, 128, 192, 256, 320
    val stationGenre: String = "Urban, Electronic, Variety",
    val isPublic: Boolean = true
)
```

**Built-in Default Preset:**
- App comes pre-configured with **GOODLIFE Radio 254** profile:
  - Host: `stream.darajadigital.com`
  - Port: `8005`
  - Mount: `/live`
  - Protocol: `ICECAST_2`
  - Bitrate: `320 kbps`
- Users can create unlimited additional profiles for any station (Icecast/Shoutcast/AzuraCast/Live365).
- Share Profiles: Export profile as a clean JSON snippet or import via link/file so station managers can share setup with DJs in 1 tap.

---

### Task 3: Multi-Protocol Live Ingest Client (Icecast 2 & Shoutcast)

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/network/RadioSocketBroadcaster.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/network/IcecastProtocolHandler.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/network/ShoutcastProtocolHandler.kt`
- Test: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/test/java/com/goodlife/broadcaster/RadioProtocolHandshakeTest.kt`

**Icecast 2 Handshake (`SOURCE` / `PUT`):**
```http
SOURCE /live HTTP/1.0
Authorization: Basic <base64("username:password")>
Content-Type: audio/mpeg
ice-name: Presenter Live
ice-genre: Urban
ice-bitrate: 320
ice-public: 1

```

**Shoutcast v1 Handshake (`ICY`):**
```http
<password>\r\n
icy-name:Presenter Live\r\n
icy-genre:Urban\r\n
icy-br:320\r\n
icy-pub:1\r\n
\r\n
```

**Real-Time Clock Pacing Engine:**
- Calculates target bytes per second based on the audio file's bitrate (e.g. 320 kbps = 40 KB/s).
- Streams 4096-byte frames using `System.nanoTime()` pacing drift correction.
- Prevents server buffer overflow or client underrun on any standard Icecast/Shoutcast instance.
- Automatic reconnection with exponential backoff on network dropouts.

---

### Task 4: Storage Access Framework (SAF) & Universal Playlist Manager

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/model/Track.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/playlist/PlaylistManager.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/data/playlist/AudioMetadataReader.kt`

**Capabilities:**
- Works with any Android storage (Internal storage, SD Card, OTG USB drive).
- Pick Individual Audio Files: `ACTION_OPEN_DOCUMENT` (multi-select MP3, AAC, M4A, FLAC, WAV, OGG).
- Pick Entire Folders / Albums: `ACTION_OPEN_DOCUMENT_TREE` (automatically indexes all audio files within the folder).
- Persistent URI permission take (`takePersistableUriPermission`) so playlists persist across app restarts.
- Reads ID3 tags (Title, Artist, Duration, Bitrate, Album Art thumbnail) via `MediaMetadataRetriever`.
- Full Queue Controls:
  - Add single tracks or bulk folders.
  - Reorder tracks (drag or move up/down).
  - Delete individual track or clear entire queue.
  - Auto-advance to next song upon track completion.
  - Loop Modes: `REPEAT_OFF`, `REPEAT_ALL`, `REPEAT_ONE`.
  - Shuffle mode toggle.

---

### Task 5: Background Foreground Service & Lockscreen Engine

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/service/BroadcastService.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/service/ServiceNotificationManager.kt`

**Lockscreen Survival Architecture:**
1. **Foreground Service:**
   - Runs with `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`.
   - Android 14+ compliant with persistent Notification Channel (`IMPORTANCE_LOW`).
2. **Hardware Power & Network Locks:**
   - `PowerManager.WakeLock` (`PARTIAL_WAKE_LOCK`): Prevents CPU deep sleep when screen turns off.
   - `WifiManager.WifiLock` (`WIFI_MODE_FULL_HIGH_PERF`): Prevents Android OS from throttling Wi-Fi / cellular data.
3. **MediaSessionCompat Integration:**
   - Lockscreen media widget displays:
     - Track Title & Artist
     - Active Station Name (e.g. "ON AIR: GOODLIFE Radio 254")
     - Play / Pause / Skip Next / Stop buttons
   - Integrates with Bluetooth headsets & car dashboard displays.
4. **Audio Focus Handling:**
   - Listens to `AudioManager.OnAudioFocusChangeListener`.
   - Automatically pauses or ducks streaming if a phone call comes in, resuming when the call ends.

---

### Task 6: Modern Material 3 UI & Theme

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/theme/Color.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/theme/Theme.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/theme/Type.kt`

**Aesthetic:**
- Clean, open, high-contrast dark theme suitable for dark DJ booths and daytime mobile use:
  - `Background`: `#0E1015` (Deep Slate Charcoal)
  - `SurfaceCard`: `#181B22`
  - `AccentLive`: `#FF3B30` / `#FF2D55` (Pulsing Live Red)
  - `AccentGold`: `#F5C842` (Warm Gold / GoodLife brand accent)
  - `TextPrimary`: `#FBF9F6` (Crisp Off-White)
  - `TextSecondary`: `#9096A2` (Slate Grey)

---

### Task 7: MVI State Management & Screens

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/BroadcasterViewModel.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/BroadcasterUiState.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/BroadcasterScreen.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/components/StationProfileSelector.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/components/OnAirMeterDeck.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/components/NowPlayingDeck.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/components/PlaylistDeck.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/ui/components/ProfileEditDialog.kt`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/src/main/java/com/goodlife/broadcaster/MainActivity.kt`

**UI Features:**
1. **Station Profile Selector:**
   - Dropdown pill to switch between saved stations (e.g. "GOODLIFE Radio 254", "Club Set", "Custom Station").
   - "+ Add Station" button with modal to input Server, Port, Mount, Protocol (Icecast/Shoutcast), and Stream Key.
   - "Export / Share Profile" button to generate a clean JSON or QR code for other presenters.
2. **On-Air Meter Deck:**
   - Large live status beacon: `ON AIR` (pulsing red) or `OFFLINE` (dimmed).
   - Real-time technical telemetry: Live Bitrate (kbps), Uptime timer (`01:45:20`), and Total MegaBytes sent.
   - Master "GO LIVE / STOP" button.
3. **Now Playing Deck:**
   - Track artwork / animated vinyl disc indicator.
   - Track Title and Artist with marquee scrolling for long names.
   - Seek progress bar & time counter.
   - Transport controls: Previous, Play/Pause, Next, Loop, Shuffle.
4. **Universal Playlist Deck:**
   - Action buttons: `+ Add Audio Files` (multi-select) and `+ Add Folder`.
   - Scrollable track list with track number, title, artist, file size, and remove button.
   - Drag handles to reorder songs on the fly.
5. **100% Free & Open Source:**
   - Zero ads, zero subscriptions, zero tracking analytics, zero locked pro features.

---

### Task 8: Verification & Open Distribution Documentation

**Files:**
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/README.md`
- Create: `C:/Users/Khesh/Downloads/goodlife-broadcaster-android/LICENSE` (MIT / Apache 2.0 Open Source)

**Step 1: Build the Debug APK**
```bash
cd C:/Users/Khesh/Downloads/goodlife-broadcaster-android
./gradlew assembleDebug
```
Output APK location:
`C:/Users/Khesh/Downloads/goodlife-broadcaster-android/app/build/outputs/apk/debug/app-debug.apk`

**Step 2: Universal Testing Checkpoints**
1. Test connecting to **GoodLife Radio 254** (`stream.darajadigital.com:8005/live`) using preset.
2. Test adding and connecting to a secondary custom server (e.g. custom Icecast / Shoutcast mount).
3. Test streaming songs while the phone screen is completely locked in pocket for >15 minutes.
4. Test lockscreen notification controls (Skip, Pause, Resume).
5. Test profile export/import between devices.

---

## Execution Handoff

Plan updated for a **universal open-source radio broadcaster** and saved to:
- `docs/plans/2026-11-27-goodlife-android-broadcaster.md` (in ticketing repo for reference)
- Target build directory: `C:\Users\Khesh\Downloads\goodlife-broadcaster-android`

Two execution options:
1. **Subagent-Driven (this session)** - I dispatch fresh subagents per task, review between tasks, fast iteration.
2. **Direct Turn-by-Turn Execution** - We step through each task right here in this session with full visibility.

Which approach would you prefer?
