import { OG_SIZE, renderEventOgImage, resolveAnchorEvent, resolveEventByParam } from '@/lib/og-image';

/**
 * The edition-specific banner for the archive page `/events/[id]`.
 *
 * Sits one segment deeper than `app/opengraph-image.tsx`, so Next resolves it
 * instead of the site-wide default for this route only. It used to advertise
 * the raw 896x1200 portrait flyer, which every social platform either cropped
 * or letterboxed.
 */
export const runtime = 'nodejs';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;

export default async function OpengraphImage(props: {
  params: Promise<{ id: string }>;
}): Promise<Response> {
  const { id } = await props.params;
  const event = (await resolveEventByParam(id)) ?? (await resolveAnchorEvent());
  return renderEventOgImage(event);
}