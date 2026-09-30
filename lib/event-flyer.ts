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
  // If the event has a specific external image (http) or custom path other than default /flyer.png
  if (custom && custom !== "/flyer.png" && custom !== "") {
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
