/**
 * Utilities for Goodlife Festival Radio (metadata cleaning, time formatters, visualizer).
 */

export interface CleanedTrackInfo {
  artist: string;
  title: string;
  remix?: string;
}

export function cleanTrackInfo(rawTitle?: string | null, rawDj?: string | null): CleanedTrackInfo {
  if (!rawTitle) {
    return {
      artist: (rawDj && rawDj.trim()) || "GOODLIFE RESIDENT",
      title: "Festival Exclusive Set",
    };
  }

  // 1. Strip common YouTube tags, video annotations, brackets, and pipe suffixes
  let cleaned = rawTitle
    .replace(/\[\s*(official\s*(music\s*)?video|official\s*audio|visualizer|hd|4k|hq|lyric\s*video|remaster(ed)?)\s*\]/gi, "")
    .replace(/\(\s*(official\s*(music\s*)?video|official\s*audio|visualizer|hd|4k|hq|lyric\s*video|remaster(ed)?)\s*\)/gi, "")
    .replace(/\[\s*audio\s*\]/gi, "")
    .replace(/\(\s*audio\s*\)/gi, "")
    .replace(/\|\s*.*$/g, "")
    .trim();

  // 2. Check for remix / VIP annotations in parentheses
  let remix: string | undefined;
  const remixMatch = cleaned.match(/\((.*?remix|.*?vip|.*?edit|.*?mix)\)/i);
  if (remixMatch) {
    remix = remixMatch[1].trim();
  }

  // 3. Check for standard "Artist - Track Title" separator
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    const artist = parts[0].trim();
    let title = parts.slice(1).join(" - ").trim();

    // Remove redundant quotes if wrapped
    title = title.replace(/^["'](.*)["']$/, "$1");

    return {
      artist: artist || (rawDj && rawDj.trim()) || "GOODLIFE DJ",
      title: title || "Festival Mix",
      remix,
    };
  }

  // If no " - " delimiter, fallback to rawDj as artist if present
  return {
    artist: (rawDj && rawDj.trim()) || "GOODLIFE RESIDENT",
    title: cleaned,
    remix,
  };
}

export function formatTime(seconds?: number | null): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
