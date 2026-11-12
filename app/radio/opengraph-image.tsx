import { OG_SIZE, renderRadioOgImage } from '@/lib/og-image';

/**
 * Dedicated social banner for `/radio`.
 *
 * Sits inside `app/radio/`, so Next.js App Router resolves it for `/radio`
 * instead of falling back to the site-wide ticket festival poster.
 *
 * WhatsApp, Twitter/X, iMessage, and LinkedIn render this high-contrast
 * studio broadcast card (254.0 FM, ON AIR, Afro House & Sheng Drops).
 */
export const runtime = 'nodejs';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'GOODLIFE Radio 254 · 24/7 Live Broadcast & Festival Airwaves';
export const revalidate = 3600;

export default async function RadioOpengraphImage(): Promise<Response> {
  return renderRadioOgImage();
}
