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

  // Fallback: Red Flame icon rendered using ImageResponse
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: '#050505',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FF3300',
          fontWeight: 900,
          border: '2px solid #FF3300',
          borderRadius: '4px',
        }}
      >
        🔥
      </div>
    ),
    {
      ...size,
    }
  );
}
