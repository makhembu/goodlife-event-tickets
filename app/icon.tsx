import { ImageResponse } from 'next/og';
import { fetchEventDetails } from '@/lib/supabase-db';

export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

export default async function Icon() {
  try {
    const details = await fetchEventDetails();
    if (details && details.logo_url) {
      const response = await fetch(details.logo_url);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, {
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'image/png',
          },
        });
      }
    }
  } catch (e) {
    console.error("Failed to generate dynamic icon:", e);
  }

  // Fallback: Brand flame icon in navy + gold
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: '#142B4C',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C79A56',
          fontWeight: 900,
          border: '2px solid #C79A56',
          borderRadius: '4px',
        }}
      >
        G
      </div>
    ),
    {
      ...size,
    }
  );
}
