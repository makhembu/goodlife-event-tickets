import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Bebas_Neue } from 'next/font/google';
import './globals.css'; // Global styles

export const viewport: Viewport = {
  themeColor: '#142B4C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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

export async function generateMetadata(): Promise<Metadata> {
  const event = await fetchEventDetails();
  const title = event?.title || 'GOODLIFE';
  const subtitle = event?.subtitle || '237-THIKA | JULY 11';
  const venue = event?.venue || 'MARARA CAMP, THIKA';
  const flyerUrl = event?.flyer_url || '/flyer.png';
  const description = `Get your official tickets for ${title} (${subtitle}) at ${venue}. Instant M-Pesa checkout & instant WhatsApp PDF ticket delivery.`;

  const baseUrl = process.env.APP_URL || 'https://goodlife.smwhr.space';
  const absoluteImageUrl = flyerUrl.startsWith('http') ? flyerUrl : `${baseUrl}${flyerUrl}`;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: `${title} - ${subtitle} | Official Tickets`,
      template: `%s | ${title}`,
    },
    description,
    keywords: [title, 'Goodlife tickets', 'Kenya events', 'Thika events', 'M-Pesa tickets', 'Marara Camp', subtitle],
    authors: [{ name: 'GOODLIFE Events' }],
    creator: 'GOODLIFE',
    publisher: 'GOODLIFE',
    openGraph: {
      title: `${title} - ${subtitle}`,
      description,
      url: baseUrl,
      siteName: `${title} Event Tickets`,
      locale: 'en_KE',
      images: [
        {
          url: absoluteImageUrl,
          width: 1200,
          height: 1600,
          alt: `${title} - ${subtitle} Official Event Flyer`,
          type: 'image/png',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} - ${subtitle}`,
      description,
      images: [absoluteImageUrl],
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
        {children}
      </body>
    </html>
  );
}
