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
  const parts = str.trim().split(":").map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2]))
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 180;
}

export function extractPlaylistId(urlStr: string): { type: "youtube" | "spotify" | "unknown"; id: string } {
  try {
    let normalized = urlStr.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    const u = new URL(normalized);

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

  const m = urlStr.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (m) {
    return { type: "youtube", id: m[1] };
  }

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

function extractTracksAndToken(obj: any): { tracks: ResolvedPlaylistTrack[]; continuationToken: string } {
  const tracks: ResolvedPlaylistTrack[] = [];
  const seenIds = new Set<string>();
  let continuationToken = "";

  function walk(node: any) {
    if (!node || typeof node !== "object") return;

    if (node.lockupViewModel) {
      const lv = node.lockupViewModel;
      const videoId = lv.contentId;
      if (videoId && typeof videoId === "string" && !seenIds.has(videoId)) {
        seenIds.add(videoId);
        const durationText =
          lv.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text ||
          "";
        const a11yLabel = lv.rendererContext?.accessibilityContext?.label || "";
        const metaTitle = lv.metadata?.lockupMetadataViewModel?.title?.content || "";
        const channelArtist =
          lv.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ||
          "";

        let rawTitle = metaTitle || a11yLabel.replace(/\s+\d+\s+minutes?,\s+\d+\s+seconds?$/i, "").trim();
        let artist = channelArtist || "YouTube Artist";

        if (rawTitle.includes(" - ")) {
          const parts = rawTitle.split(" - ");
          artist = parts[0].trim();
          rawTitle = parts.slice(1).join(" - ").trim();
        }

        tracks.push({
          video_id: videoId,
          title: rawTitle || `Track ${videoId}`,
          artist,
          duration_sec: parseDurationText(durationText),
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      }
    } else if (node.playlistVideoRenderer) {
      const v = node.playlistVideoRenderer;
      const videoId = v.videoId;
      const rawTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
      if (
        videoId &&
        typeof videoId === "string" &&
        !seenIds.has(videoId) &&
        rawTitle !== "[Private video]" &&
        rawTitle !== "[Deleted video]"
      ) {
        seenIds.add(videoId);
        let artist = v.shortBylineText?.runs?.[0]?.text || "YouTube Artist";
        let title = rawTitle;
        if (title.includes(" - ")) {
          const parts = title.split(" - ");
          artist = parts[0].trim();
          title = parts.slice(1).join(" - ").trim();
        }
        tracks.push({
          video_id: videoId,
          title: title || "YouTube Track",
          artist,
          duration_sec: parseInt(v.lengthSeconds || "180", 10) || 180,
          thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      }
    }

    if (!continuationToken) {
      if (node.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token) {
        continuationToken = node.continuationItemViewModel.continuationCommand.innertubeCommand.continuationCommand.token;
      } else if (node.continuationItemViewModel?.continuationCommand?.continuationCommand?.token) {
        continuationToken = node.continuationItemViewModel.continuationCommand.continuationCommand.token;
      } else if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        continuationToken = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      }
    }

    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  }

  walk(obj);
  return { tracks, continuationToken };
}

async function fetchYouTubeContinuations(
  initialTracks: ResolvedPlaylistTrack[],
  initialToken: string,
  maxPages = 20
): Promise<ResolvedPlaylistTrack[]> {
  const tracks = [...initialTracks];
  let nextToken = initialToken;
  let page = 1;
  const postUrl = `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false`;
  const headers = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-YouTube-Client-Name": "1",
    "X-YouTube-Client-Version": "2.20240101.00.00",
  };

  while (nextToken && page <= maxPages) {
    page++;
    try {
      const res = await fetch(postUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" } },
          continuation: nextToken,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const data = await res.json();
      const endpoints = data.onResponseReceivedEndpoints || data.onResponseReceivedActions || [];
      let foundInPage = 0;
      let newContToken = "";

      for (const ep of endpoints) {
        const { tracks: pageTracks, continuationToken: pageToken } = extractTracksAndToken(ep);
        for (const t of pageTracks) {
          if (!tracks.some((existing) => existing.video_id === t.video_id)) {
            tracks.push(t);
            foundInPage++;
          }
        }
        if (pageToken) newContToken = pageToken;
      }

      if (foundInPage === 0 || !newContToken || newContToken === nextToken) break;
      nextToken = newContToken;
    } catch {
      break;
    }
  }

  return tracks;
}

async function resolveYouTubePlaylist(playlistId: string): Promise<ResolvedPlaylist> {
  const postUrl = `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false`;
  const headers = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-YouTube-Client-Name": "1",
    "X-YouTube-Client-Version": "2.20240101.00.00",
  };

  // 1. Primary: YouTube Innertube Web Client (official internal API, reliable, no HTML scraper breakage)
  try {
    const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
    const response = await fetch(postUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" } },
        browseId,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (response.ok) {
      const data = await response.json();
      const playlistTitle =
        data.metadata?.playlistMetadataRenderer?.title ||
        data.header?.playlistHeaderRenderer?.title?.simpleText ||
        data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
        "YouTube Playlist";

      const { tracks: page1Tracks, continuationToken } = extractTracksAndToken(data);
      if (page1Tracks.length > 0) {
        const allTracks = continuationToken
          ? await fetchYouTubeContinuations(page1Tracks, continuationToken)
          : page1Tracks;

        return {
          title: playlistTitle,
          track_count: allTracks.length,
          source: "youtube",
          tracks: allTracks,
        };
      }
    }
  } catch (err: any) {
    console.warn("[playlist-resolver] Innertube API attempt failed, trying HTML scraping:", err?.message);
  }

  // 2. Fallback: Direct HTML scraping of playlist page
  let tracks: ResolvedPlaylistTrack[] = [];
  let playlistTitle = "YouTube Playlist";

  try {
    const pageUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (response.ok) {
      const html = await response.text();
      const match =
        html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
        html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);

      if (match) {
        const data = JSON.parse(match[1]);
        playlistTitle =
          data.metadata?.playlistMetadataRenderer?.title ||
          data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
          data.header?.playlistHeaderRenderer?.title?.simpleText ||
          "YouTube Playlist";

        const { tracks: htmlTracks, continuationToken } = extractTracksAndToken(data);
        if (htmlTracks.length > 0) {
          tracks = continuationToken ? await fetchYouTubeContinuations(htmlTracks, continuationToken) : htmlTracks;
        }
      }
    }
  } catch (err: any) {
    console.warn("[playlist-resolver] HTML scrape failed:", err?.message);
  }

  // 3. Fallback: RSS feed (note: YouTube caps RSS feeds at 15 items maximum)
  if (tracks.length === 0) {
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      const rssRes = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const entryMatches = xml.matchAll(
          /<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<\/entry>/g
        );
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
    } catch (err: any) {
      console.warn("[playlist-resolver] RSS fallback failed:", err?.message);
    }
  }

  if (tracks.length === 0) {
    throw new Error("Could not resolve any tracks from that YouTube playlist.");
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
