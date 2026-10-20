import type { Metadata } from 'next';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/supabase-db';
import { resolveEventFlyer } from '@/lib/event-flyer';
import { SITE_NAME, TWITTER_HANDLE, buildEventSeo, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await props.params;
    const parsedId = Number.parseInt(id, 10);
    if (!Number.isFinite(parsedId)) return {};

    const event = await getEventById(parsedId);
    if (!event) return {};

    const baseUrl = siteUrl();
    const seo = buildEventSeo(event);
    const pageUrl = `${baseUrl}/events/${event.id}`;

    return {
      // `absolute` avoids the layout template appending the featured event's
      // name: "GOODLIFE 4 - MARARA CAMP, THIKA | GOODLIFE 4".
      title: { absolute: seo.title },
      description: seo.description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        type: 'website',
        title: seo.ogTitle,
        description: seo.ogDescription,
        url: pageUrl,
        siteName: SITE_NAME,
        locale: 'en_KE',
        // No `images` key on purpose. The sibling `opengraph-image.tsx` renders a
        // 1200x630 banner from this edition's own poster; declaring images here
        // would override that file and put the 896x1200 portrait flyer back.
      },
      twitter: {
        card: 'summary_large_image',
        site: TWITTER_HANDLE,
        creator: TWITTER_HANDLE,
        title: seo.ogTitle,
        description: seo.ogDescription,
      },
    };
  } catch {
    return {};
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const parsedId = Number.parseInt(resolvedParams.id, 10);
  if (!Number.isFinite(parsedId)) {
    notFound();
  }

  const event = await getEventById(parsedId);
  if (!event) {
    notFound();
  }

  const flyer = resolveEventFlyer(event);

  return (
    <div className="min-h-screen bg-brand-off-white font-mono text-brand-navy p-6 md:p-12 flex items-center justify-center">
      <div className="max-w-2xl w-full border-4 border-brand-navy bg-white p-6 md:p-10 shadow-(--shadow-brut-xl-strong)">
        {flyer && (
          <div className="relative w-full aspect-[3/4] max-h-[480px] mb-6 border-2 border-brand-navy overflow-hidden bg-brand-navy/5">
            <Image
              src={flyer}
              alt={event.title}
              fill
              className="object-contain"
              priority
            />
          </div>
        )}
        <div className="text-center">
          <div className="inline-block bg-brand-accent text-brand-navy text-xs font-bold px-3 py-1 uppercase border-2 border-brand-navy mb-4">
            {event.category === 'mini' ? 'Mini Session' : 'Flagship Edition'} • {event.status?.toUpperCase() || 'SCHEDULED'}
          </div>
          <h1 className="font-display text-4xl md:text-5xl uppercase mb-3">{event.title}</h1>
          <p className="font-bold uppercase text-brand-navy/70 text-sm mb-2">{event.subtitle || event.venue}</p>
          {event.event_date && (
            <p className="text-xs uppercase font-bold text-brand-navy/60 mb-6">
              Date: {new Date(event.event_date).toLocaleDateString()}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-6">
            <Link
              href={`/?event=${event.id}`}
              className="w-full sm:w-auto inline-block border-2 border-brand-navy bg-brand-navy text-brand-off-white px-6 py-3 font-bold uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors shadow-(--shadow-brut-sm)"
            >
              Open Event Page &rarr;
            </Link>
            <Link
              href="/events"
              className="w-full sm:w-auto inline-block border-2 border-brand-navy bg-brand-accent px-6 py-3 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors shadow-(--shadow-brut-sm)"
            >
              Return to Archive
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
