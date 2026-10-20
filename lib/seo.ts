/**
 * Shared social/SEO copy rules.
 *
 * There is one rule behind this file: the *page* description and the *social*
 * description are not the same string. Google will happily index 150-160
 * characters; Facebook, WhatsApp and X start truncating around 125 and cut
 * mid-word without an ellipsis. Reusing one string for both guaranteed one of
 * the two was wrong, so `description` keeps the search-length copy and
 * `ogDescription` is clamped to the preview-length copy.
 */

export const SITE_NAME = 'GOODLIFE Events';
export const TWITTER_HANDLE = '@goodlife_ke';

/** Social previews are cut around here; Google keeps going to ~160. */
export const OG_DESCRIPTION_MAX = 124;
export const OG_TITLE_MAX = 65;

/** Falls back to production when APP_URL is an unset ngrok/localhost tunnel. */
export function siteUrl(): string {
  const raw = (process.env.APP_URL || '').trim();
  if (!raw) return 'https://goodlife.smwhr.space';
  try {
    const parsed = new URL(raw);
    // A tunnel or localhost is not a shareable identity: og:url and canonical
    // must never point at an ephemeral dev domain.
    const host = parsed.hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.ngrok-free.app')) {
      return 'https://goodlife.smwhr.space';
    }
    return parsed.origin;
  } catch {
    return 'https://goodlife.smwhr.space';
  }
}

/** Turns a possibly-relative asset path into a shareable absolute URL. */
export function absoluteUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return `${siteUrl()}/flyer.png`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** Truncates on a word boundary so cards never end mid-word ("MARARA CA"). */
export function clamp(text: string, max: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export interface SeoEventLike {
  id?: number | null;
  title?: string | null;
  subtitle?: string | null;
  venue?: string | null;
}

export interface EventSeoCopy {
  title: string;
  ogTitle: string;
  description: string;
  ogDescription: string;
  venue: string;
}

const DEFAULT_VENUE = 'MARARA CAMP, THIKA';

/**
 * Builds the title/description pair for an event from ONE source of truth, so
 * the root layout, `/events/[id]` and the homepage `?event=` switch can never
 * drift apart the way three hand-written copies did.
 */
export function buildEventSeo(event?: SeoEventLike | null): EventSeoCopy {
  const name = (event?.title || '').trim() || 'GOODLIFE';
  const venue = (event?.venue || '').trim() || DEFAULT_VENUE;

  const title = `${name} - ${venue}`;

  // Social: title first (the venue is usually implied by the poster image),
  // then the promise that makes someone tap.
  const ogTitle = clamp(title, OG_TITLE_MAX);
  const ogDescription = clamp(
    `Official ${name} tickets at ${venue}. Instant M-Pesa checkout, instant WhatsApp PDF ticket.`,
    OG_DESCRIPTION_MAX
  );

  // Search: the fuller sentence, still inside Google's ~160 character window.
  const description = clamp(
    `Official tickets for ${name} at ${venue}. Instant M-Pesa checkout and instant WhatsApp PDF ticket delivery.`,
    158
  );

  return { title, ogTitle, description, ogDescription, venue };
}