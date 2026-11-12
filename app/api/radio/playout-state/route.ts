import { NextResponse } from "next/server";
import { getAuthoritativePlayoutState } from "@/lib/radio/broadcast-state";
import { fetchTrackLyrics } from "@/lib/radio/lyrics-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getAuthoritativePlayoutState();
    if (!state) {
      return NextResponse.json({ offline: true, error: "No active radio sets" }, { status: 503 });
    }

    // Enhance with LRCLIB synced lyrics
    let lyrics = {
      synced_lyrics: null as string | null,
      plain_lyrics: null as string | null,
      is_instrumental: false,
      confidence_score: 0.0,
    };

    if (state.current_track?.title && state.current_track?.artist) {
      lyrics = await fetchTrackLyrics(
        state.current_track.title,
        state.current_track.artist,
        state.current_track.duration_sec || 0
      );
    }

    const payload = {
      ...state,
      lyrics,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3, stale-while-revalidate=3",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Playout calculation failed" }, { status: 500 });
  }
}
