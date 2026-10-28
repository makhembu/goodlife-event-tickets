import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface LiveCachedState {
  nowPlaying: any;
  upNext: any[];
  history: any[];
  ts: number;
}

let _cachedLiveState: LiveCachedState | null = null;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "GoodlifeRadio-BFF/1.0",
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const upstreamBase = process.env.RADIO_UPSTREAM_URL;

  // If no upstream server is configured in environment, fail-closed to honest offline state
  if (!upstreamBase || upstreamBase.trim() === "") {
    return NextResponse.json(
      {
        offline: true,
        reason: "RADIO_UPSTREAM_URL is not configured",
        now_playing: null,
        up_next: [],
        history: [],
        stale: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      }
    );
  }

  const cleanBase = upstreamBase.trim().replace(/\/+$/, "");
  const timeoutMs = 3000; // Strictly 3-second upstream timeout

  try {
    const [nowRes, nextRes, histRes] = await Promise.all([
      fetchWithTimeout(`${cleanBase}/api/now-playing`, timeoutMs),
      fetchWithTimeout(`${cleanBase}/api/up-next`, timeoutMs),
      fetchWithTimeout(`${cleanBase}/api/history`, timeoutMs),
    ]);

    if (!nowRes.ok) {
      throw new Error(`now-playing responded with status ${nowRes.status}`);
    }

    const nowPlaying = await nowRes.json();
    const upNext = nextRes.ok ? await nextRes.json().catch(() => []) : [];
    const history = histRes.ok ? await histRes.json().catch(() => []) : [];

    const liveData: LiveCachedState = {
      nowPlaying,
      upNext: Array.isArray(upNext) ? upNext.slice(0, 5) : [],
      history: Array.isArray(history) ? history.slice(0, 10) : [],
      ts: Date.now(),
    };

    _cachedLiveState = liveData;

    return NextResponse.json(
      {
        offline: false,
        stale: false,
        now_playing: liveData.nowPlaying,
        up_next: liveData.upNext,
        history: liveData.history,
        target_duration_sec: 2.0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      }
    );
  } catch (err: any) {
    console.warn("[api/radio/live] Upstream fetch failed or timed out:", err?.message || err);

    // If we have stale cached data, serve it with stale: true
    if (_cachedLiveState) {
      return NextResponse.json(
        {
          offline: false,
          stale: true,
          now_playing: _cachedLiveState.nowPlaying,
          up_next: _cachedLiveState.upNext,
          history: _cachedLiveState.history,
          target_duration_sec: 2.0,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
          },
        }
      );
    }

    // Completely unavailable without cached fallback -> honest offline state
    return NextResponse.json(
      {
        offline: true,
        stale: true,
        reason: "Upstream server unreachable",
        now_playing: null,
        up_next: [],
        history: [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      }
    );
  }
}
