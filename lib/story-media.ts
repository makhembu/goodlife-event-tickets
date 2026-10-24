import { resolveEventFlyer, resolveEventVideo } from "./event-flyer";

/**
 * Ordered media for the homepage story deck.
 *
 * This lives on `events.story_media` as JSONB rather than in its own table.
 * The deck is capped at a handful of slides, it is always read as one ordered
 * list, and the homepage already selects the whole event row — so a join would
 * add a query without adding a capability. Reordering is just an array order.
 */
export type StoryMediaKind = "poster" | "video";

export interface StoryMediaItem {
  id?: string;
  kind: StoryMediaKind;
  url: string;
  /** A single extracted frame, used while the video buffers. */
  poster_url?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
}

/** Hard cap: every extra video is real mobile data, not just another dot. */
export const MAX_STORY_ITEMS = 8;

function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url) return "";
  // Relative paths (/flyer.png) and real remote media only. A javascript: or
  // data: URL in an <img>/<video> src is not an execution vector, but it is
  // still not media and should never reach the deck.
  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return "";
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Turns whatever is in the JSONB column (or a hand-written save payload) into
 * a predictable list. Unknown kinds, unsafe URLs and malformed rows are
 * dropped rather than rendered as broken slides.
 */
export function normalizeStoryMedia(input: unknown): StoryMediaItem[] {
  if (!Array.isArray(input)) return [];

  const out: StoryMediaItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;

    const source = raw as Record<string, unknown>;
    const kind: StoryMediaKind | null =
      source.kind === "video" ? "video" : source.kind === "poster" ? "poster" : null;
    const url = safeUrl(source.url);
    if (!kind || !url) continue;

    const item: StoryMediaItem = { kind, url };
    if (typeof source.id === "string" && source.id.trim()) item.id = source.id.trim();

    const poster = safeUrl(source.poster_url);
    if (poster) item.poster_url = poster;

    const duration = positiveNumber(source.duration);
    if (duration) item.duration = duration;
    const width = positiveNumber(source.width);
    if (width) item.width = width;
    const height = positiveNumber(source.height);
    if (height) item.height = height;
    const bytes = positiveNumber(source.bytes);
    if (bytes) item.bytes = bytes;

    out.push(item);
    if (out.length >= MAX_STORY_ITEMS) break;
  }

  return out;
}

/**
 * The single decision about what the story deck plays.
 *
 * If the event has configured slides, they win and are used exactly in their
 * saved order. Otherwise the old single-poster + resolved-teaser behaviour is
 * preserved, so events that never opened the new editor keep working.
 *
 * This is the function the event edit page uses as its initial deck state: when
 * `story_media` is empty/null the editor seeds from `flyer_url` and `video_url`
 * so the admin sees what is already playing on the homepage and can manage it
 * rather than staring at an empty "No custom slides yet" panel.
 */
export function resolveStoryMedia(event?: {
  story_media?: unknown;
  flyer_url?: string | null;
  video_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): StoryMediaItem[] {
  const custom = normalizeStoryMedia(event?.story_media);
  if (custom.length > 0) return custom;

  return [
    { kind: "poster", url: resolveEventFlyer(event) },
    { kind: "video", url: resolveEventVideo(event) },
  ];
}

/**
 * Seed values for a freshly-opened edit form whose `story_media` is empty.
 *
 * Returns one poster slide (from `flyer_url` if present), one video slide (from
 * `video_url` if present), or an empty array when neither legacy field exists.
 * The edit page calls this when the fetched event's `story_media` is empty so the
 * deck does not open blank.
 *
 * This is deliberately NOT a persistent sync: it only describes what to show on
 * first open. The save handler in the edit page normalises `story_media` and,
 * when it is non-empty, syncs `flyer_url`/`video_url` from the first poster/video
 * slide — so once the admin adds a real deck slide the legacy fields stop being
 * the source of truth.
 */
export function seedStoryMediaFromLegacy(event?: {
  story_media?: unknown;
  flyer_url?: string | null;
  video_url?: string | null;
  category?: string | null;
  title?: string | null;
  subtitle?: string | null;
} | null): StoryMediaItem[] {
  return resolveStoryMedia(event);
}
