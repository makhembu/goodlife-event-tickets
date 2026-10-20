import { OG_SIZE, renderEventOgImage, resolveAnchorEvent } from '@/lib/og-image';

/**
 * Default social banner for every route that does not declare its own image
 * (`/events`, `/gallery`, `/radio`, and any future public page).
 *
 * The homepage does NOT use this file: it can be reached as `/?event=<id>`, and
 * a file convention has no access to the query string, so `app/page.tsx` points
 * og:image at the `/og?event=<id>` route handler instead.
 *
 * Poster changes and event switches both show up here without a redeploy,
 * because the poster is resolved from the event row on each render.
 */
export const runtime = 'nodejs';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'GOODLIFE festival tickets';
export const revalidate = 3600;

export default async function OpengraphImage(): Promise<Response> {
  const event = await resolveAnchorEvent();
  return renderEventOgImage(event);
}