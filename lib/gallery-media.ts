/** Shared rules for image-vs-video gallery items. Pure, so tests can import it. */

export type GalleryMediaType = "image" | "video";

const VIDEO_URL_RE = /\.(mp4|webm|ogg|mov|m4v|mkv)($|[?#])/i;

export function isVideoMediaUrl(url?: string | null): boolean {
  return typeof url === "string" && VIDEO_URL_RE.test(url.trim());
}

/**
 * Prefer the explicit `media_type` column; fall back to the URL extension for
 * rows saved before the column existed or by an older client.
 */
export function resolveGalleryMediaType(
  mediaType: unknown,
  url?: string | null
): GalleryMediaType {
  if (mediaType === "video" || mediaType === "image") return mediaType;
  return isVideoMediaUrl(url) ? "video" : "image";
}

export function isVideoGalleryItem(item: {
  media_type?: unknown;
  image_url?: string | null;
}): boolean {
  return resolveGalleryMediaType(item.media_type, item.image_url) === "video";
}
