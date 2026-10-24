import { ImageResponse } from 'next/og';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolveEventFlyer } from './event-flyer';
import { canonicalStatus, isHiddenFromSite } from './event-availability';
import { fetchAllEvents, getEventById, fetchTicketTiers } from './supabase-db';
import { clamp } from './seo';

/**
 * The social banner, rendered per event at request time.
 *
 * Why this file exists instead of a checked-in 1200x630 JPG:
 *
 *  - Every poster in `public/` is a portrait flyer (896x1200) of 2.8-3.3 MB.
 *    Pointing og:image at one failed every consumer: LinkedIn wants >=1200x630
 *    landscape, WhatsApp refuses anything over 500 KB, and the aspect ratio was
 *    wrong on all of them.
 *  - A single hardcoded banner per *event kind* ("park & chill" vs flagship)
 *    goes stale the moment a poster is re-uploaded to ImgBB, and it was the
 *    reason a shared link could show the wrong poster for the right event.
 *
 * So the banner is generated from the event's own resolved poster
 * (`resolveEventFlyer`, which reads `events.flyer_url` / `event_details` first),
 * at exactly 1200x630, every time the poster or the event changes.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const OG_SIZE = { width: OG_WIDTH, height: OG_HEIGHT };

const BRAND_FONT = 'Bebas Neue';
const NAVY = '#142B4C';
const NAVY_DEEP = '#0B1B2E';
const CREAM = '#F3ECE1';
const GOLD = '#C8A54A';

interface OgEvent {
  id?: number | null;
  title?: string | null;
  subtitle?: string | null;
  venue?: string | null;
  category?: string | null;
  flyer_url?: string | null;
}

/**
 * Loads the poster as an inline data URI.
 *
 * `next/og` rasterises whatever it is handed, so the poster is read locally
 * when it is a `public/` asset and fetched only when the admin pointed
 * `flyer_url` at an external bucket (ImgBB). Either way the failure mode is
 * "no photo", never a broken card: every step is guarded.
 */
export async function loadPosterImage(flyerUrl: string | null | undefined): Promise<string | null> {
  if (!flyerUrl) return null;

  try {
    const publicDir = path.join(process.cwd(), 'public');
    let buffer: Buffer;

    if (/^https?:\/\//i.test(flyerUrl)) {
      const res = await fetch(flyerUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      // Resolve inside `public/` only. `flyer_url` is admin-supplied, so a
      // `../../.env.local` value must not become readable bytes.
      const abs = path.resolve(publicDir, flyerUrl.replace(/^[\\/]+/, ''));
      if (!abs.startsWith(publicDir + path.sep)) return null;
      buffer = await fs.readFile(abs);
    }

    if (!buffer || buffer.length === 0) return null;

    const type = /\.png($|\?)/i.test(flyerUrl) ? 'image/png' : 'image/jpeg';
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Bebas Neue is the site's display face and ships in `public/`. */
async function loadBrandFont() {
  try {
    const buffer = await fs.readFile(path.join(process.cwd(), 'public', 'BebasNeue.ttf'));
    return [{ name: BRAND_FONT, data: buffer, weight: 400 as const, style: 'normal' as const }];
  } catch {
    // No display font: fall back to the bundled default rather than failing the
    // whole render, which would hand scrapers a 500 instead of a card.
    return null;
  }
}

/**
 * The event the root page anchors to when no `?event=` is present - the same
 * precedence `app/page.tsx` uses, so the banner and the page can never describe
 * different events.
 */
export async function resolveAnchorEvent(): Promise<OgEvent | null> {
  try {
    const routable = (await fetchAllEvents()).filter((e) => !isHiddenFromSite(e));
    const event =
      routable.find((e) => e.category === 'flagship' && e.is_active && canonicalStatus(e.status) === 'live') ??
      routable.find((e) => e.category === 'flagship' && canonicalStatus(e.status) === 'live') ??
      routable.find((e) => e.category === 'flagship') ??
      routable[0] ??
      null;
    return event ?? null;
  } catch {
    return null;
  }
}

/** Looks an edition up by id, used by `/og?event=` and `/events/[id]`. */
export async function resolveEventByParam(raw: string | null | undefined): Promise<OgEvent | null> {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return null;
  try {
    return (await getEventById(parsed)) ?? null;
  } catch {
    return null;
  }
}

export interface OgTier {
  id: string;
  name: string;
  price: number;
  tag?: string;
  badge_text?: string | null;
}

export async function resolveTierByParam(
  raw: string | null | undefined,
  eventId: number
): Promise<OgTier | null> {
  if (!raw || !eventId) return null;
  try {
    const tiers = await fetchTicketTiers(eventId);
    const trimmed = raw.trim().toLowerCase();
    const normalized = trimmed.replace(/[^a-z0-9]/g, '');
    const match = tiers.find(
      (t) =>
        t.id.toLowerCase() === trimmed ||
        t.name.toLowerCase() === trimmed ||
        t.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized ||
        t.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
    );
    if (!match) return null;
    return {
      id: match.id,
      name: match.name,
      price: Number(match.price),
      tag: match.tag,
      badge_text: match.badge_text,
    };
  } catch {
    return null;
  }
}

/** Big, loud type for short names; still three lines for a 60-character one. */
function titleSize(length: number): number {
  if (length <= 22) return 96;
  if (length <= 32) return 78;
  if (length <= 46) return 62;
  return 52;
}

export async function renderEventOgImage(
  event?: OgEvent | null,
  tier?: OgTier | null
): Promise<ImageResponse> {
  const title = (event?.title || 'GOODLIFE').replace(/\s+/g, ' ').trim() || 'GOODLIFE';
  const venue = (event?.venue || '').replace(/\s+/g, ' ').trim() || 'MARARA CAMP, THIKA';

  const [fonts, poster] = await Promise.all([
    loadBrandFont(),
    loadPosterImage(resolveEventFlyer(event)),
  ]);
  const displayFont = fonts ? BRAND_FONT : undefined;

  const isTierCard = Boolean(tier);
  const tierName = tier ? (tier.name || 'TICKET PASS').toUpperCase() : '';
  const priceDisplay = tier
    ? Number(tier.price) === 0
      ? 'FREE RSVP'
      : `KES ${Number(tier.price).toLocaleString()}`
    : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: NAVY,
          color: CREAM,
          fontFamily: displayFont,
        }}
      >
        {/* Copy column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: '68%',
            padding: '0 64px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 10, height: 36, background: GOLD, marginRight: 18 }} />
            <div style={{ fontSize: 30, letterSpacing: 6, color: GOLD }}>
              {isTierCard ? `${title.toUpperCase()} · OFFICIAL PASS` : 'GOODLIFE EVENTS'}
            </div>
          </div>

          <div
            style={{
              fontSize: isTierCard ? titleSize(tierName.length) : titleSize(title.length),
              lineHeight: 1.04,
              marginTop: isTierCard ? 20 : 26,
              color: '#FFFFFF',
              textTransform: 'uppercase',
            }}
          >
            {clamp(isTierCard ? tierName : title.toUpperCase(), 52)}
          </div>

          <div
            style={{
              width: 120,
              height: 6,
              background: GOLD,
              marginTop: isTierCard ? 20 : 30,
              marginBottom: isTierCard ? 20 : 28,
            }}
          />

          {isTierCard ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <div style={{ fontSize: 68, color: GOLD, lineHeight: 1 }}>{priceDisplay}</div>
              {tier?.badge_text && (
                <div
                  style={{
                    fontSize: 22,
                    letterSpacing: 2,
                    color: NAVY,
                    background: GOLD,
                    padding: '4px 12px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                  }}
                >
                  {tier.badge_text}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 34, color: 'rgba(243,236,225,0.80)' }}>{venue.toUpperCase()}</div>
          )}

          <div
            style={{
              fontSize: isTierCard ? 24 : 26,
              letterSpacing: 3,
              color: isTierCard ? 'rgba(243,236,225,0.85)' : GOLD,
              marginTop: isTierCard ? 18 : 22,
            }}
          >
            {isTierCard
              ? `${venue.toUpperCase()} · INSTANT M-PESA & WHATSAPP DELIVERY`
              : 'OFFICIAL TICKETS · M-PESA · WHATSAPP PDF'}
          </div>
        </div>

        {/* Poster column: the event's own flyer, cropped to the card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32%',
            background: NAVY_DEEP,
          }}
        >
          {poster ? (
            // Satori rasterises a plain <img> and nothing else - next/image is
            // not an option inside an ImageResponse, and the output is a PNG
            // with no alt text to expose.
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={poster} width={300} height={400} style={{ objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 300,
                height: 400,
                border: `4px solid ${GOLD}`,
                color: GOLD,
                fontSize: 96,
              }}
            >
              G
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      ...(fonts ? { fonts } : {}),
    }
  );
}