/**
 * Media resolution & external song search helpers for Goodlife Radio.
 */

export interface SongSearchLink {
  platform: "Spotify" | "Apple Music" | "YouTube Music" | "Audiomack";
  url: string;
}

/**
 * Normalizes YouTube video thumbnail URLs to high-resolution 16:9 images without baked-in 4:3 letterboxing.
 * YouTube's hqdefault.jpg is 480x360 (4:3) with black bars baked at top/bottom for 16:9 videos.
 * maxresdefault.jpg is 1280x720 (crisp 16:9, zero letterboxing).
 * mqdefault.jpg is 320x180 (16:9 fallback when 720p maxres is unavailable).
 */
export function resolveCoverArt(thumbnailUrl?: string | null): string {
  if (!thumbnailUrl || typeof thumbnailUrl !== "string" || thumbnailUrl.trim() === "") {
    return "/flyer.png";
  }

  const trimmed = thumbnailUrl.trim();

  // Prioritize high-resolution 16:9 maxresdefault (1280x720) for crisp retina display
  if (trimmed.includes("ytimg.com") || trimmed.includes("youtube.com")) {
    return trimmed.replace(/\/(?:hqdefault|mqdefault|default|sddefault)\.jpg(\?.*)?$/i, "/maxresdefault.jpg$1");
  }

  return trimmed;
}

/**
 * Returns the reliable 16:9 fallback thumbnail (mqdefault.jpg, 320x180) if maxresdefault 404s.
 */
export function resolveFallbackCoverArt(thumbnailUrl?: string | null): string {
  if (!thumbnailUrl || typeof thumbnailUrl !== "string" || thumbnailUrl.trim() === "") {
    return "/flyer.png";
  }

  const trimmed = thumbnailUrl.trim();
  if (trimmed.includes("ytimg.com") || trimmed.includes("youtube.com")) {
    return trimmed.replace(/\/(?:hqdefault|maxresdefault|default|sddefault)\.jpg(\?.*)?$/i, "/mqdefault.jpg$1");
  }

  return "/flyer.png";
}

/**
 * Returns an honest, normalized title string stripped of video/YouTube junk
 * like [Official Music Video], (Official Audio), | VEVO, [Explicit], leading digits, etc.
 * Strictly adheres to NO INVENTED DATA: never substitutes "Unknown Track".
 */
export function formatTrackTitle(title?: string | null): string {
  if (!title || typeof title !== "string" || title.trim() === "") {
    return "Updating...";
  }

  let cleaned = title.trim();

  // 1. Strip bracketed or parenthesized video artifacts & channel/label tags
  cleaned = cleaned.replace(
    /\s*[\[\(](?:official\s+(?:music\s+)?video|official\s+audio|official\s+hd\s+video|official\s+video\s+hd|official\s+visualizer|official\s+lyric\s+video|lyric\s+video|official\s+lyrics|lyrics|visualizer|audio|explicit|clean|4k|hd|hq|extended\s+mix|original\s+mix|[^\]\)]*(?:Records|Music|Entertainment|VEVO|Label|Productions?))[\]\)]/gi,
    ""
  );

  // 2. Strip trailing pipe brandings like "| ShaSha", "| Official Video", "| VEVO"
  cleaned = cleaned.replace(/\s*\|\s*.*$/i, "");

  // 3. Strip leading track numbering e.g. "7. Open Mic Grooves: " or "01 - "
  cleaned = cleaned.replace(/^\d+[\.\-\s]+(?=[A-Za-z])/i, "");

  // 4. Strip standalone (Audio) or [Audio]
  cleaned = cleaned.replace(/\s*[\[\(]Audio[\]\)]\s*/gi, " ");

  // 5. Clean extraneous wrapping quotes e.g. "Lotto" -> Lotto
  cleaned = cleaned.replace(/["“”]/g, "").trim();

  // 6. Clean consecutive whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  return cleaned || "Festival Set";
}

export const normalizeTrackTitle = formatTrackTitle;

/**
 * Builds verified search links for the current track across 4 confirmed streaming platforms.
 * (Boomplay is dropped because its public web search endpoint is unverified/bot-blocked).
 */
export function buildSongSearchUrls(title?: string | null, artist?: string | null): SongSearchLink[] {
  if (!title || typeof title !== "string" || title.trim() === "" || title.trim() === "Updating...") {
    return [];
  }

  const cleanTitle = title.trim();
  const cleanArtist = artist && typeof artist === "string" ? artist.trim() : "";
  const query = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
  const encodedQuery = encodeURIComponent(query);

  return [
    {
      platform: "Spotify",
      url: `https://open.spotify.com/search/${encodedQuery}`,
    },
    {
      platform: "Apple Music",
      url: `https://music.apple.com/search?term=${encodedQuery}`,
    },
    {
      platform: "YouTube Music",
      url: `https://music.youtube.com/search?q=${encodedQuery}`,
    },
    {
      platform: "Audiomack",
      url: `https://audiomack.com/search?q=${encodedQuery}`,
    },
  ];
}
