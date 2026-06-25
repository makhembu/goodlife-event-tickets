import type {Metadata} from 'next';
import { Space_Grotesk, Bebas_Neue } from 'next/font/google';
import './globals.css'; // Global styles

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
  const description = `Official ticket checkout portal for ${title} - ${subtitle} at ${venue}.`;

  const baseUrl = process.env.APP_URL || 'https://goodlife-event-tickets.vercel.app';
  const absoluteImageUrl = flyerUrl.startsWith('http') ? flyerUrl : `${baseUrl}${flyerUrl}`;

  return {
    title: `${title} | Secure Ticket Portal`,
    description,
    openGraph: {
      title: `${title} - ${subtitle}`,
      description,
      url: baseUrl,
      siteName: title,
      images: [
        {
          url: absoluteImageUrl,
          width: 1200,
          height: 1600,
          alt: `${title} Flyer`,
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
