import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeSearch } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";

async function searchYouTubeFallback(query: string) {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = contents?.[0]?.itemSectionRenderer?.contents || [];
    const results: any[] = [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (v && v.videoId) {
        const durationText = v.lengthText?.simpleText || "";
        let duration_sec = 0;
        if (durationText) {
          const parts = durationText.split(":").map(Number);
          if (parts.length === 2) duration_sec = parts[0] * 60 + parts[1];
          else if (parts.length === 3) duration_sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        results.push({
          video_id: v.videoId,
          title: v.title?.runs?.[0]?.text || "Unknown Title",
          artist: v.ownerText?.runs?.[0]?.text || "YouTube",
          duration_sec,
          thumbnail_url: v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          source: "youtube",
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        });
        if (results.length >= 12) break;
      }
    }
    return results;
  } catch (err) {
    console.warn("[api/admin/radio/search] fallback youtube search error:", err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  // 1. Search existing local library tracks (radio_sets)
  const libItems: any[] = [];
  try {
    const { rows } = await neonQuery(
      `SELECT id, title, dj_name, duration_sec, audio_url, cover_image_url
       FROM radio_sets
       WHERE deleted_at IS NULL AND (title ILIKE $1 OR dj_name ILIKE $1)
       ORDER BY created_at DESC LIMIT 6`,
      [`%${q.trim()}%`]
    );
    if (rows && rows.length > 0) {
      for (const row of rows) {
        let safeCover = row.cover_image_url || row.cover_url || "";
        if (safeCover.includes("192.168.") || safeCover.includes("localhost") || safeCover.includes("127.0.0.1") || safeCover.includes(":3000")) {
          const match = safeCover.match(/\/vi\/([a-zA-Z0-9_-]{11})/);
          safeCover = match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : "/flyer.png";
        }
        libItems.push({
          id: row.id,
          video_id: `lib_${row.id}`,
          title: row.title,
          artist: row.dj_name || "Library Track",
          duration_sec: row.duration_sec || 0,
          thumbnail_url: safeCover,
          source: "library",
          url: row.audio_url || "",
        });
      }
    }
  } catch (e) {
    console.warn("[api/admin/radio/search] local library search error:", e);
  }

  // 2. Search online via Invidious Bridge
  let onlineItems: any[] = [];
  try {
    const bridgeRes = await bridgeSearch(q);
    if (bridgeRes.ok && Array.isArray(bridgeRes.data) && bridgeRes.data.length > 0) {
      onlineItems = bridgeRes.data.map((item: any) => {
        // Guarantee clean public YouTube CDN thumbnail so browser never makes private LAN requests
        const safeThumb = item.video_id
          ? `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`
          : (item.thumbnail_url && !item.thumbnail_url.includes("192.168.") && !item.thumbnail_url.includes(":3000") ? item.thumbnail_url : "/flyer.png");
        return {
          video_id: item.video_id,
          title: item.title,
          artist: item.artist,
          duration_sec: item.duration_sec || 0,
          thumbnail_url: safeThumb,
          source: "invidious",
          url: `https://www.youtube.com/watch?v=${item.video_id}`,
        };
      });
    }
  } catch (e) {
    console.warn("[api/admin/radio/search] bridge error, falling back to direct search:", e);
  }

  // 3. Fallback to direct YouTube search if bridge returned nothing
  if (onlineItems.length === 0) {
    onlineItems = await searchYouTubeFallback(q);
  }

  const combined = [...libItems, ...onlineItems];
  return NextResponse.json(combined);
}
