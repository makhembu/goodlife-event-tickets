# ==============================================================================
# GOODLIFE Radio 254 - Custom Liquidsoap Playout Configuration (Liquidsoap 2.1+)
# Station: goodlife_radio_254
# Location: /var/azuracast/stations/goodlife_radio_254/config/liquidsoap.liq
# ==============================================================================

# Enable strict log formatting
log.level.set(3)
log.stdout.set(true)

# 1. Emergency Fallback Track or Randomized Playlist (In case of complete playout silence)
emergency_track =
  if file.exists("/var/goodlife/drops/emergency") then
    playlist(
      mode="randomize",
      reload_mode="watch",
      "/var/goodlife/drops/emergency"
    )
  else
    single("/var/goodlife/drops/emergency-fallback.mp3")
  end

# 2. AutoDJ Playout Input (Driven by AzuraCast Queue & Dynamic Daypart Playlists)
# AzuraCast feeds the standard station playlist queue via internal request.queue
autodj_source = request.queue(id="autodj_queue")

# 3. Live Harbor DJ Ingest (Port 8005, Mount /live)
# Direct connection from BUTT, OBS, Rekordbox, Serato
harbor_user = environment.get("HARBOR_USER", default="source")
harbor_pass = environment.get("HARBOR_PASSWORD", default="")

if harbor_pass == "" then
  log(level=1, "FATAL: HARBOR_PASSWORD env var must be set.")
end

def auth_dj(user, password) =
  if harbor_pass != "" and user == harbor_user and password == harbor_pass then
    log("DJ authenticated successfully: #{user}")
    true
  else
    log("DJ authentication failed for user: #{user}")
    false
  end
end

# Ingest harbor input at native client quality (up to 320kbps)
live_dj = input.harbor(
  "/live",
  port=8005,
  auth=auth_dj,
  buffer=2.0,
  max=10.0,
  id="harbor_live_dj"
)

# 4. Raw 320kbps Native Capture Tap (Recording BEFORE Broadcast Downsampling)
# Captures live festival sets directly from the harbor input in pristine master quality
current_recording_path = ref("")

def on_dj_connect() =
  let timestamp = time.format("%Y-%m-%d_%H-%M-%S")
  let path = "/var/goodlife/recordings/pending/" ^ timestamp ^ "_live_set.mp3"
  current_recording_path := path
  log("Live DJ connected. Starting pristine 320kbps capture to: #{path}")
end

def on_dj_disconnect() =
  let path = !current_recording_path
  log("Live DJ disconnected. Master recording concluded at: #{path}")
  if file.exists(path) then
    # Spawn background notification hook to trigger archiver daemon
    let cmd = "/usr/local/bin/on-disconnect.sh \"" ^ path ^ "\" &"
    ignore(process.run(cmd))
  end
  current_recording_path := ""
end

live_dj = on_connect(on_dj_connect, live_dj)
live_dj = on_disconnect(on_dj_disconnect, live_dj)

# Tap the raw live DJ stream directly to disk at 320kbps MP3
output.file(
  %mp3(bitrate=320, samplerate=44100, stereo=true),
  (fun () ->
    let p = !current_recording_path
    if p != "" then p else "/dev/null" end
  ),
  fallible=true,
  live_dj
)

# 5. Smart Crossfade & Harbor Failover
# Smooth 3.0s crossfade when live DJ joins or drops
def smooth_crossfade(a, b) =
  add(normalize=false, [
    fade.out(duration=3.0, a),
    fade.in(duration=3.0, b)
  ])
end

# Failover logic: Live DJ overrides AutoDJ; Fallback overrides silence
radio_stream = fallback(
  track_sensitive=false,
  transitions=[smooth_crossfade, smooth_crossfade],
  [live_dj, autodj_source, emergency_track]
)

# Apply dynamic audio processing / limiter (AGC + soft-knee limiter)
radio_stream = normalize(target=-14.0, window=0.03, radio_stream)
radio_stream = compress.exponential(mu=2.0, radio_stream)

# 6. Stream Output 1: Primary Low-Latency 192kbps MP3 Stream
# Serves instant snap-to-live (<2s) on goodlife.co.ke/radio
output.icecast(
  %mp3(bitrate=192, samplerate=44100, stereo=true),
  host="127.0.0.1",
  port=8000,
  password=environment.get("ICECAST_SOURCE_PASSWORD", default="change_me_in_env"),
  mount="/listen/goodlife/live.mp3",
  name="GOODLIFE Radio 254 (192k MP3 Direct)",
  description="Afrobeats, Amapiano & Festival Anthems Live from Nairobi",
  genre="Afro-House, Amapiano, Urban",
  url="https://radio.darajadigital.com",
  public=true,
  radio_stream
)

# 7. Stream Output 2: Fallback HLS Stream (4-Second Chunks)
# For high-packet-loss mobile networks
output.hls(
  segment_duration=4.0,
  segments=6,
  segments_overhead=3,
  playlist="live.m3u8",
  path="/var/azuracast/hls/goodlife",
  on_file_change=(fun (state, fname) ->
    if state == "removed" then
      ignore(file.remove(fname))
    end
  ),
  [("live_192k", %mp3(bitrate=192, samplerate=44100, stereo=true))],
  radio_stream
)
