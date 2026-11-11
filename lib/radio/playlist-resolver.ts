export interface ResolvedPlaylistTrack {
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  url?: string;
}

export interface ResolvedPlaylist {
  title: string;
  track_count: number;
  source: "youtube" | "spotify" | "web";
  tracks: ResolvedPlaylistTrack[];
}

function parseDurationText(str?: string): number {
  if (!str) return 180;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 180;
}

export function extractPlaylistId(urlStr: string): { type: "youtube" | "spotify" | "unknown"; id: string } {
  try {
    const u = new URL(urlStr);
    if (u.hostname.includes("spotify.com") && u.pathname.includes("/playlist/")) {
      const parts = u.pathname.split("/playlist/")[1]?.split("/")[0]?.split("?")[0];
      if (parts) return { type: "spotify", id: parts };
    }

    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const listParam = u.searchParams.get("list");
      if (listParam) return { type: "youtube", id: listParam };
      if (u.pathname.includes("/playlist")) {
        const id = u.searchParams.get("list");
        if (id) return { type: "youtube", id };
      }
    }
  } catch {}
  return { type: "unknown", id: "" };
}

export async function resolvePlaylist(urlStr: string): Promise<ResolvedPlaylist> {
  const { type, id } = extractPlaylistId(urlStr);

  if (type === "spotify" && id) {
    return resolveSpotifyPlaylist(id);
  }

  if (type === "youtube" && id) {
    return resolveYouTubePlaylist(id);
  }

  // Fallback: try YouTube resolving anyway if list parameter exists
  const m = urlStr.match(/[?&]list=([^&]+)/);
  if (m) {
    return resolveYouTubePlaylist(m[1]);
  }

  throw new Error("Unsupported playlist URL. Please provide a valid YouTube or Spotify playlist link.");
}

async function resolveYouTubePlaylist(playlistId: string): Promise<ResolvedPlaylist> {
  const pageUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`YouTube returned status ${response.status}`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
    html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);
  if (!match) {
    throw new Error("Could not parse YouTube playlist structure");
  }

  const data = JSON.parse(match[1]);
  const playlistTitle =
    data.metadata?.playlistMetadataRenderer?.title ||
    data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
    data.header?.playlistHeaderRenderer?.title?.simpleText ||
    "YouTube Playlist";

  const tracks: ResolvedPlaylistTrack[] = [];

  // Parse items
  const items =
    data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ||
    [];

  for (const item of items) {
    if (item.lockupViewModel) {
      const lv = item.lockupViewModel;
      const videoId = lv.contentId;
      if (!videoId) continue;

      const durationText =
        lv.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text ||
        "3:30";
      const accessibilityLabel = lv.rendererContext?.accessibilityContext?.label || "";

      let title = accessibilityLabel.replace(/\s+\d+\s+minutes?,\s+\d+\s+seconds?$/i, "").trim();
      let artist = "GOODLIFE Artist";
      if (title.includes(" - ")) {
        const parts = title.split(" - ");
        artist = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      }

      tracks.push({
        video_id: videoId,
        title: title || `Track ${videoId}`,
        artist,
        duration_sec: parseDurationText(durationText),
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    } else if (item.playlistVideoRenderer) {
      const v = item.playlistVideoRenderer;
      if (!v.videoId) continue;

      tracks.push({
        video_id: v.videoId,
        title: v.title?.runs?.[0]?.text || v.title?.simpleText || "YouTube Track",
        artist: v.shortBylineText?.runs?.[0]?.text || "YouTube Artist",
        duration_sec: parseInt(v.lengthSeconds || "180", 10),
        thumbnail_url: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
    }
  }

  // If no items found via lockupViewModel/playlistVideoRenderer, try RSS feed fallback
  if (tracks.length === 0) {
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      const rssRes = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const entryMatches = xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<\/entry>/g);
        for (const em of entryMatches) {
          const vid = em[1];
          let rawTitle = em[2];
          let artist = "YouTube Artist";
          if (rawTitle.includes(" - ")) {
            const p = rawTitle.split(" - ");
            artist = p[0].trim();
            rawTitle = p.slice(1).join(" - ").trim();
          }
          tracks.push({
            video_id: vid,
            title: rawTitle,
            artist,
            duration_sec: 210,
            thumbnail_url: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${vid}`,
          });
        }
      }
    } catch {}
  }

  return {
    title: playlistTitle,
    track_count: tracks.length,
    source: "youtube",
    tracks,
  };
}

async function resolveSpotifyPlaylist(playlistId: string): Promise<ResolvedPlaylist> {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const response = await fetch(embedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Spotify returned status ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">({[\s\S]*?})<\/script>/);
  if (!match) {
    throw new Error("Could not parse Spotify embed structure");
  }

  const data = JSON.parse(match[1]);
  const entity = data?.props?.pageProps?.state?.data?.entity;
  const playlistTitle = entity?.title || entity?.name || "Spotify Playlist";
  const rawTracks = entity?.trackList || [];

  const tracks: ResolvedPlaylistTrack[] = rawTracks.map((t: any, idx: number) => ({
    video_id: t.uri ? t.uri.replace("spotify:track:", "") : `sp_${idx}`,
    title: t.title || "Track",
    artist: t.subtitle || "Spotify Artist",
    duration_sec: t.duration ? Math.round(t.duration / 1000) : 180,
    thumbnail_url: entity?.images?.[0]?.url || "",
    url: t.uri ? `https://open.spotify.com/track/${t.uri.replace("spotify:track:", "")}` : "",
  }));

  return {
    title: playlistTitle,
    track_count: tracks.length,
    source: "spotify",
    tracks,
  };
}
