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

export async function bridgeGetNowPlaying() {
  return requestBridge<{
    status: string;
    station: string;
    server_time: string;
    azuracast_online: boolean;
    now_playing: string;
  }>("/health", { timeoutMs: 5000 });
}

export { signRequest, BRIDGE_BASE_URL, BRIDGE_SECRET };
