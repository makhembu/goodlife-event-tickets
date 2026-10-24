const R2_DOMAIN = (
  process.env.NEXT_PUBLIC_R2_DOMAIN ||
  process.env.R2_PUBLIC_DOMAIN ||
  "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev"
).replace(/\/+$/, "");

export const DEFAULT_FLAGSHIP_FLYER = `${R2_DOMAIN}/posters/flyer.png`;
export const DEFAULT_MINI_FLYER = `${R2_DOMAIN}/posters/flyer-park-chill.png`;
export const DEFAULT_FLAGSHIP_VIDEO = `${R2_DOMAIN}/videos/goodlife-hype.mp4`;
export const DEFAULT_MINI_VIDEO = `${R2_DOMAIN}/videos/park-chill-speakers.mp4`;

/**
 * Resolves the appropriate flyer/poster URL for an event.
 * Automatically maps Sunday Chill / mini events to Cloudflare R2 bucket flyer
 * and main flagship events to Cloudflare R2 bucket flyer unless a custom non-default flyer URL is provided.
 */
export function resolveEventFlyer(event?: {
  flyer_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): string {
  if (!event) return DEFAULT_FLAGSHIP_FLYER;

  const custom = event.flyer_url?.trim();
  // Transparently migrate legacy hardcoded local paths to Cloudflare R2 bucket URLs
  if (custom === "/flyer.png") return DEFAULT_FLAGSHIP_FLYER;
  if (custom === "/flyer-park-chill.png") return DEFAULT_MINI_FLYER;

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
    return DEFAULT_MINI_FLYER;
  }

  return DEFAULT_FLAGSHIP_FLYER;
}

/**
 * Resolves the appropriate teaser/hype video URL for an event.
 * Automatically maps Sunday Park & Chill to Cloudflare R2 bucket video
 * and main flagship events to R2 bucket video unless a custom video URL is provided.
 */
export function resolveEventVideo(event?: {
  id?: number | null;
  video_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): string {
  if (!event) return DEFAULT_FLAGSHIP_VIDEO;

  const custom = event.video_url?.trim();
  if (custom === "/videos/goodlife-hype.mp4") return DEFAULT_FLAGSHIP_VIDEO;
  if (custom === "/videos/park-chill-speakers.mp4") return DEFAULT_MINI_VIDEO;

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
    return DEFAULT_MINI_VIDEO;
  }

  return DEFAULT_FLAGSHIP_VIDEO;
}

