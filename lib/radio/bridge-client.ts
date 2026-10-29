import crypto from "crypto";

const rawBridgeUrl = process.env.RADIO_BRIDGE_URL?.trim();
const BRIDGE_BASE_URL = (
  rawBridgeUrl && rawBridgeUrl !== '""' && rawBridgeUrl !== "''"
    ? rawBridgeUrl
    : "https://invidious-bridge.darajadigital.com"
).replace(/\/+$/, "");

const rawBridgeSecret = process.env.RADIO_BRIDGE_SECRET?.trim();
if (!rawBridgeSecret || rawBridgeSecret === '""' || rawBridgeSecret === "''") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("RADIO_BRIDGE_SECRET environment variable is required in production");
  }
}
const BRIDGE_SECRET =
  rawBridgeSecret && rawBridgeSecret !== '""' && rawBridgeSecret !== "''"
    ? rawBridgeSecret
    : "dev-placeholder-set-RADIO_BRIDGE_SECRET-in-env";

function signRequest(body: string): { timestamp: string; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", BRIDGE_SECRET)
    .update(`${timestamp}:${body}`)
    .digest("hex");
  return { timestamp, signature };
}

async function requestBridge<T>(
  path: string,
  options: { method?: string; body?: any; timeoutMs?: number } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const method = options.method || "GET";
  const bodyStr = options.body ? JSON.stringify(options.body) : "";
  const { timestamp, signature } = signRequest(bodyStr);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 8000);

  try {
    const res = await fetch(`${BRIDGE_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Timestamp": timestamp,
        "X-Bridge-Signature": signature,
        "X-Goodlife-Timestamp": timestamp,
        "X-Goodlife-Radio-Key": signature,
      },
      body: method !== "GET" ? bodyStr : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Bridge returned HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Bridge request timed out" };
    }
    return { ok: false, error: err.message || "Failed to reach radio bridge" };
  }
}

export async function bridgeHealth() {
  return requestBridge<{ status: string; uptime: number }>("/health");
}

export async function bridgeSearch(query: string) {
  return requestBridge<Array<{
    video_id: string;
    title: string;
    artist: string;
    duration_sec: number;
    thumbnail_url: string;
  }>>(`/invidious/search?q=${encodeURIComponent(query)}`, { timeoutMs: 15000 });
}

export async function bridgePlaylistPreview(playlistUrl: string) {
  return requestBridge<{
    title: string;
    track_count: number;
    tracks: Array<{
      video_id: string;
      title: string;
      artist: string;
      duration_sec: number;
      thumbnail_url: string;
    }>;
  }>(`/invidious/playlist?url=${encodeURIComponent(playlistUrl)}`, { timeoutMs: 30000 });
}

export async function bridgeQueueIngest(payload: {
  tracks: Array<{
    video_id: string;
    title: string;
    artist: string;
    duration_sec: number;
    thumbnail_url: string;
  }>;
  genre?: string;
  event_id?: number | null;
}) {
  return requestBridge<{ job_id: string; total_tracks: number; status: string }>(
    "/jobs/create",
    { method: "POST", body: payload, timeoutMs: 10000 }
  );
}

export async function bridgeGetJob(jobId: string) {
  return requestBridge<{
    job_id: string;
    total_tracks: number;
    completed_tracks: number;
    status: "queued" | "running" | "completed" | "failed";
    current_track?: string;
    error?: string;
    tracks: Array<any>;
  }>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function bridgeQueueNext(payload: {
  url: string;
  custom_drop_text?: string;
  voice_preference?: "male" | "female";
}) {
  return requestBridge<{
    status: string;
    artist: string;
    title: string;
    drop_script: string;
    media_id: number;
    queued_as_up_next: boolean;
  }>("/api/radio/queue-next", {
    method: "POST",
    body: payload,
    timeoutMs: 45000,
  });
}

export async function bridgeGenerateAiDrop(payload: {
  prompt?: string;
  theme?: string;
  custom_text?: string;
  voice_id?: string;
}) {
  return requestBridge<{
    success: boolean;
    script: string;
    drop_url: string;
    mastered_file: string;
  }>("/api/radio/drops/generate", {
    method: "POST",
    body: payload,
    timeoutMs: 4000,
  });
}

export async function bridgeGetNowPlaying() {
  return requestBridge<{
    status: string;
    station: string;
    server_time: string;
    azuracast_online: boolean;
    now_playing: string;
  }>("/health", { timeoutMs: 5000 });
}

export async function bridgeGetAzuracastNowPlaying() {
  return requestBridge<any>("/api/azuracast/nowplaying", { timeoutMs: 5000 });
}

export async function bridgeSkipTrack() {
  return requestBridge<{ status: string; action: string }>("/api/azuracast/skip", {
    method: "POST",
    timeoutMs: 10000,
  });
}

export async function bridgeGetAzuracastQueue() {
  return requestBridge<{ queue: any[] }>("/api/azuracast/queue", { timeoutMs: 6000 });
}

export async function bridgeDeleteQueueItem(queueId: number | string) {
  return requestBridge<{ status: string; removed_id: number }>(
    `/api/azuracast/queue/${encodeURIComponent(queueId)}`,
    {
      method: "DELETE",
      timeoutMs: 8000,
    }
  );
}

/**
 * Masters audio using native FFmpeg on Home Server (.29) via Bridge API.
 * Applies EBU R128 loudness normalization (-14 LUFS, -1.0 dBFS True Peak, 7 LRA)
 * and resamples to 44.1 kHz, 192 kbps broadcast MP3.
 */
export async function bridgeMasterAudioFfmpeg(
  rawBuffer: Buffer,
  options: {
    inputFormat?: "auto" | "pcm" | "wav" | "mp3";
    sampleRate?: number;
    channels?: number;
    targetLufs?: number;
    timeoutMs?: number;
  } = {}
): Promise<Buffer | null> {
  const { timestamp, signature } = signRequest("multipart");
  const timeoutMs = options.timeoutMs || 12000;

  // Prefer LAN IP if running in local network, fall back to Cloudflare tunnel
  const candidateUrls = [
    process.env.RADIO_BRIDGE_LAN_URL || "http://192.168.100.29:8283",
    BRIDGE_BASE_URL,
  ];

  for (const baseUrl of candidateUrls) {
    if (!baseUrl) continue;
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const formData = new FormData();
      formData.append("audio", new Blob([new Uint8Array(rawBuffer)]), "audio_input");
      formData.append("input_format", options.inputFormat || "auto");
      formData.append("sample_rate", String(options.sampleRate || 24000));
      formData.append("channels", String(options.channels || 1));
      formData.append("target_lufs", String(options.targetLufs || -14.0));

      const res = await fetch(`${cleanBase}/api/radio/ffmpeg/master`, {
        method: "POST",
        headers: {
          "X-Bridge-Timestamp": timestamp,
          "X-Bridge-Signature": signature,
          "X-Goodlife-Timestamp": timestamp,
          "X-Goodlife-Radio-Key": signature,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("audio/") || ct.includes("octet-stream")) {
          const ab = await res.arrayBuffer();
          const masteredBuf = Buffer.from(ab);
          if (masteredBuf.length > 500) {
            console.log(`[bridge-client] Successfully mastered audio via .29 server FFmpeg (${masteredBuf.length} bytes)`);
            return masteredBuf;
          }
        }
      }
    } catch {
      clearTimeout(timer);
      // Try next candidate URL
    }
  }

  console.warn("[bridge-client] Remote FFmpeg mastering on .29 server failed or timed out");
  return null;
}

export { signRequest, BRIDGE_BASE_URL, BRIDGE_SECRET };
