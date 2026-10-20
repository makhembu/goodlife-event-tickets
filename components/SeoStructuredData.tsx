import { cache } from 'react';
import { fetchAllEvents, fetchEventDetails } from '@/lib/supabase-db';
import { canonicalStatus, isHiddenFromSite } from '@/lib/event-availability';
import { resolveEventFlyer } from '@/lib/event-flyer';
import { SITE_NAME, absoluteUrl, buildEventSeo, siteUrl } from '@/lib/seo';

/**
 * JSON-LD for the site and the event being advertised.
 *
 * Without it, crawlers had a title and a paragraph and nothing else, so no rich
 * result could ever be produced - the largest "structured data" gap in the audit.
 *
 * `cache()` dedupes this against the `generateMetadata` fetch in the same
 * request: React renders both in one pass, so the event row is read from Neon
 * once instead of twice.
 */
const getDetails = cache(async () => {
  try {
    return await fetchEventDetails();
  } catch {
    return null;
  }
});

/** Same precedence `app/page.tsx` uses to anchor the homepage to an edition. */
const getAnchorEvent = cache(async () => {
  try {
    const routable = (await fetchAllEvents()).filter((e) => !isHiddenFromSite(e));
    return (
      routable.find((e) => e.category === 'flagship' && e.is_active && canonicalStatus(e.status) === 'live') ??
      routable.find((e) => e.category === 'flagship' && canonicalStatus(e.status) === 'live') ??
      routable.find((e) => e.category === 'flagship') ??
      routable[0] ??
      null
    );
  } catch {
    return null;
  }
});

export default async function SeoStructuredData() {
  const [details, event] = await Promise.all([getDetails(), getAnchorEvent()]);

  // The featured `event_details` row is the fallback, so the JSON-LD still
  // describes *something* when the events table is momentarily unreadable.
  const subject = (event ?? details) as
    | {
        id?: number | null;
        title?: string | null;
        venue?: string | null;
        flyer_url?: string | null;
        category?: string | null;
        subtitle?: string | null;
        event_date?: string | null;
        status?: string | null;
      }
    | null;
  if (!subject) return null;

  const seo = buildEventSeo(subject);
  const poster = absoluteUrl(resolveEventFlyer(subject));
  const buyUrl = subject.id ? `${siteUrl()}/?event=${subject.id}` : siteUrl();
  const eventDate = subject.event_date ?? details?.event_date ?? null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Event",
        "@id": `${buyUrl}#event`,
        name: seo.title,
        description: seo.description,
        url: buyUrl,
        image: [poster],
        ...(eventDate ? { startDate: eventDate } : {}),
        // schema.org has no "completed" event status, and a closed edition is
        // still an event that happened - only cancellation/postponement map to
        // distinct values, neither of which this site sets.
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          "@type": "Place",
          name: seo.venue,
          address: {
            "@type": "PostalAddress",
            addressLocality: "Thika",
            addressCountry: "KE",
          },
        },
        organizer: { "@type": "Organization", name: SITE_NAME, url: siteUrl() },
        // Deliberately no `price`: tiers live in the database and are chosen at
        // checkout, so any hardcoded figure here would be a lie in a rich result.
        offers: {
          "@type": "Offer",
          url: buyUrl,
          availability: 'https://schema.org/InStock',
          priceCurrency: 'KES',
          ...(eventDate ? { validFrom: eventDate } : {}),
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl()}/#website`,
        name: SITE_NAME,
        url: siteUrl(),
        description: seo.description,
        inLanguage: 'en-KE',
        publisher: { "@type": "Organization", name: SITE_NAME, url: siteUrl() },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Built from our own event rows; the `<` escape is the one thing that must
      // never appear raw inside a script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}