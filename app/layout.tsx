import React, { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Bebas_Neue } from 'next/font/google';
import './globals.css'; // Global styles

export const viewport: Viewport = {
  themeColor: '#142B4C',
  width: 'device-width',
  initialScale: 1,
};

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas-neue',
  display: 'swap',
});

import { fetchEventDetails } from '@/lib/supabase-db';
import { SITE_NAME, TWITTER_HANDLE, buildEventSeo, siteUrl } from '@/lib/seo';
import SeoStructuredData from '@/components/SeoStructuredData';
import PwaUpdatePrompt from '@/components/ui/PwaUpdatePrompt';
import { RadioProvider } from '@/context/RadioContext';
import GlobalRadioBar from '@/components/radio/GlobalRadioBar';

export async function generateMetadata(): Promise<Metadata> {
  // Must never throw. generateMetadata runs for every prerendered route, so an
  // unreachable database would fail the whole `next build` - and a failed deploy
  // is a far worse outcome than a stale page title. Degrade to static defaults
  // instead. This is what made one Neon connection timeout break a build.
  const event = await fetchEventDetails().catch(() => null);
  const title = event?.title || 'GOODLIFE';
  const venue = event?.venue || 'MARARA CAMP, THIKA';
  const subtitle = event?.subtitle || venue;

  const seo = buildEventSeo(event);
  const baseUrl = siteUrl();

  return {
    metadataBase: new URL(baseUrl),
    // No `alternates.canonical` here on purpose. A layout-level canonical would
    // be inherited by every route and point `/events/3`, `/gallery` and `/radio`
    // back at the homepage - i.e. tell search engines the whole site is one page.
    // Each route owns its own canonical instead.
    title: {
      default: `${seo.title} | Official Tickets`,
      template: `%s | ${title}`,
    },
    description: seo.description,
    keywords: [title, 'Goodlife tickets', 'Kenya events', 'Thika events', 'M-Pesa tickets', 'Marara Camp', subtitle],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    applicationName: SITE_NAME,
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        // `app/icon.tsx` renders the admin-uploaded logo at /icon; this is the
        // static fallback for browsers that ignore the generated one.
        { url: '/icon', sizes: '32x32', type: 'image/png' },
        { url: '/icon.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#142B4C' }],
    },
    manifest: '/site.webmanifest',
    openGraph: {
      type: 'website',
      title: seo.ogTitle,
      // Deliberately the ~124-character variant, not `seo.description`: social
      // cards truncate past ~125 characters without an ellipsis.
      description: seo.ogDescription,
      url: baseUrl,
      siteName: SITE_NAME,
      locale: 'en_KE',
      // `images` is intentionally absent: `app/opengraph-image.tsx` generates the
      // 1200x630 banner from the current event's own poster. Declaring one here
      // would override the file and hand crawlers a portrait flyer again.
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: seo.ogTitle,
      description: seo.ogDescription,
      // No `images` here either - Next falls back to the generated opengraph-image.
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${bebasNeue.variable}`}>
      <body className="font-sans antialiased bg-brand-bg text-brand-black min-h-screen" suppressHydrationWarning>
        <RadioProvider>
          <Suspense fallback={null}>
            <SeoStructuredData />
          </Suspense>
          <PwaUpdatePrompt />
          {children}
          <GlobalRadioBar />
        </RadioProvider>
      </body>
    </html>
  );
}
