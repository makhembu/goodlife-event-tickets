export interface LyricsResult {
  synced_lyrics: string | null;
  plain_lyrics: string | null;
  is_instrumental: boolean;
  confidence_score: number;
}

const lyricsCache = new Map<string, { data: LyricsResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cleanString(str: string): string {
  return str
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function fetchTrackLyrics(title: string, artist: string, durationSec: number): Promise<LyricsResult> {
  const normTitle = cleanString(title);
  const normArtist = cleanString(artist);
  const cacheKey = `${normArtist}:${normTitle}`;

  const cached = lyricsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const defaultResult: LyricsResult = {
    synced_lyrics: null,
    plain_lyrics: null,
    is_instrumental: false,
    confidence_score: 0.0,
  };

  try {
    // 1. Try with duration first
    let query = `https://lrclib.net/api/get?track_name=${encodeURIComponent(normTitle)}&artist_name=${encodeURIComponent(normArtist)}`;
    if (durationSec > 0) {
      query += `&duration=${Math.round(durationSec)}`;
    }

    let resp = await fetch(query, {
      headers: {
        "User-Agent": "GoodLifeRadio/2.1 (broadcast-sync@goodlife.smwhr.space)",
      },
      next: { revalidate: 86400 },
    });

    // 2. If not found with exact duration, fall back to matching by track + artist
    if (!resp.ok && durationSec > 0) {
      const relaxedQuery = `https://lrclib.net/api/get?track_name=${encodeURIComponent(normTitle)}&artist_name=${encodeURIComponent(normArtist)}`;
      resp = await fetch(relaxedQuery, {
        headers: {
          "User-Agent": "GoodLifeRadio/2.1 (broadcast-sync@goodlife.smwhr.space)",
        },
        next: { revalidate: 86400 },
      });
    }

    if (resp.ok) {
      const data = await resp.json();
      const resDuration = data.duration || 0;
      const durDiff = durationSec > 0 ? Math.abs(resDuration - durationSec) : 0;
      const confidence = durDiff <= 3 ? 1.0 : Math.max(0.2, 1.0 - durDiff / 15.0);

      const result: LyricsResult = {
        synced_lyrics: data.syncedLyrics || null,
        plain_lyrics: data.plainLyrics || null,
        is_instrumental: Boolean(data.instrumental),
        confidence_score: confidence,
      };

      lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn("[LRCLIB] Lyrics fetch skipped:", err);
  }

  lyricsCache.set(cacheKey, { data: defaultResult, timestamp: Date.now() });
  return defaultResult;
}
