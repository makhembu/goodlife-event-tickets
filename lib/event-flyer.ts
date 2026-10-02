/**
 * Resolves the appropriate flyer/poster URL for an event.
 * Automatically maps Sunday Chill / mini events to `/flyer-park-chill.png`
 * and main flagship events to `/flyer.png` unless a custom non-default flyer URL is provided.
 */
export function resolveEventFlyer(event?: {
  flyer_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): string {
  if (!event) return "/flyer.png";

  const custom = event.flyer_url?.trim();
  // If an event explicitly configured a flyer URL (including '/flyer.png'), use it directly
  if (custom && custom !== "") {
    return custom;
  }

  const text = `${event.title || ""} ${event.subtitle || ""}`.toLowerCase();
  const isSundayChill =
    event.category === "mini" ||
    text.includes("chill") ||
    text.includes("park & chill") ||
    text.includes("park and chill") ||
    text.includes("sunday");

  if (isSundayChill) {
    return "/flyer-park-chill.png";
  }

  return "/flyer.png";
}

/**
 * Resolves the appropriate teaser/hype video URL for an event.
 * Automatically maps Sunday Park & Chill to `/videos/park-chill-speakers.mp4`
 * and main flagship events to `/videos/goodlife-hype.mp4` unless a custom video URL is provided.
 */
export function resolveEventVideo(event?: {
  id?: number | null;
  video_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): string {
  if (!event) return "/videos/goodlife-hype.mp4";

  const custom = event.video_url?.trim();
  if (custom && custom !== "") {
    return custom;
  }

  const text = `${event.title || ""} ${event.subtitle || ""}`.toLowerCase();
  const isSundayChill =
    event.category === "mini" ||
    text.includes("chill") ||
    text.includes("park & chill") ||
    text.includes("park and chill") ||
    text.includes("sunday");

  if (isSundayChill) {
    return "/videos/park-chill-speakers.mp4";
  }

  return "/videos/goodlife-hype.mp4";
}

