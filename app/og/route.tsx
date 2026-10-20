import { renderEventOgImage, resolveAnchorEvent, resolveEventByParam } from '@/lib/og-image';

/**
 * Per-edition social banner: `GET /og?event=<id>`.
 *
 * `app/page.tsx` renders `/?event=<id>` on the server, and metadata files
 * (`opengraph-image.tsx`) cannot read the query string, so this is how the
 * homepage gets a banner for the *edition being viewed* instead of the
 * featured one. Without an `event` param it falls back to the same anchor event
 * the homepage itself would pick, so `og:image` and `og:title` always agree.
 *
 * Public on purpose: it is not in `middleware.ts`'s matcher, exposes no data
 * beyond what the public poster already shows, and is cacheable at the CDN.
 */

const CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const event =
    (await resolveEventByParam(searchParams.get('event'))) ?? (await resolveAnchorEvent());

  const image = await renderEventOgImage(event);
  image.headers.set('Cache-Control', CACHE_CONTROL);
  image.headers.set('X-Content-Type-Options', 'nosniff');
  return image;
}