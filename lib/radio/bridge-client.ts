import crypto from "crypto";

const BRIDGE_BASE_URL = (
  process.env.RADIO_BRIDGE_URL || "https://invidious-bridge.darajadigital.com"
).replace(/\/+$/, "");
const BRIDGE_SECRET = process.env.RADIO_BRIDGE_SECRET || "goodlife_bridge_secret_dev";

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
  }>>(`/invidious/search?q=${encodeURIComponent(query)}`);
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
  }>(`/invidious/playlist?url=${encodeURIComponent(playlistUrl)}`);
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
