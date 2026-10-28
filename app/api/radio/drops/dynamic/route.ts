import { NextRequest, NextResponse } from "next/server";
import { generateDropEngineV2 } from "@/lib/radio/drop-engine";
import { selectGenericReviewedDrop } from "@/lib/radio/drop-gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      nextTrackId,
      nextTrackTitle,
      nextTrackArtist,
      nextTrackGenre,
      preferredPersonaId,
      introSeconds,
    } = body;

    const nextTrack =
      nextTrackTitle && nextTrackArtist
        ? {
            id: typeof nextTrackId === "number" ? nextTrackId : Number(nextTrackId) || undefined,
            title: nextTrackTitle.toString().slice(0, 100),
            artist: nextTrackArtist.toString().slice(0, 100),
            genre: nextTrackGenre?.toString().slice(0, 50),
          }
        : undefined;

    const drop = await generateDropEngineV2({
      nextTrack,
      preferredPersonaId,
      introSeconds: typeof introSeconds === "number" ? introSeconds : 10,
    });

    return NextResponse.json(
      {
        drop_url: drop.audio_url,
        script: drop.script,
        title: `${drop.persona_name} · GOODLIFE Drop`,
        persona: drop.persona_name,
        mood: drop.tag,
        timingType: drop.drop_type === "next_track_tease" ? "intro" : "outro",
        event_id: drop.event_id,
        valid_until: drop.valid_until,
        is_fallback: drop.is_generic_fallback,
        provider: drop.provider,
        model_id: drop.model_id,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/radio/drops/dynamic] Pipeline error:", err.message);
    const fallback = selectGenericReviewedDrop();
    return NextResponse.json(
      {
        drop_url: fallback.audio_url || "",
        script: fallback.script,
        title: `${fallback.persona_name} · GOODLIFE Stager`,
        persona: fallback.persona_name,
        mood: fallback.tag,
        timingType: "outro",
        is_fallback: true,
      },
      { status: 200 }
    );
  }
}
