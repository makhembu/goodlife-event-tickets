import { generateDropEngineV2 } from "./drop-engine";
import { selectGenericReviewedDrop } from "./drop-gate";

export interface GenerateDropParams {
  nextTrackId?: number;
  nextTrackTitle?: string;
  nextTrackArtist?: string;
  nextTrackGenre?: string;
  currentTrackTitle?: string;
  currentTrackArtist?: string;
  timingType?: "intro" | "mid_song" | "outro";
  preferredMood?: "hype" | "sensual" | "comedic" | "stoic";
  preferredPersonaId?: string;
  forceNew?: boolean;
  secondsUntilAir?: number;
  targetAirTimeMs?: number;
}

export interface DynamicDropResult {
  drop_url: string;
  script: string;
  title: string;
  persona: string;
  mood: string;
  timingType: "intro" | "mid_song" | "outro";
  is_fallback?: boolean;
}

/**
 * Drop Engine v2 Adapter:
 * Replaces the legacy pipeline with zero-hallucination live-data drops,
 * cascading multi-provider failover, pre-flight Drop Gate check, and Loudnorm mastering.
 */
export async function generateDynamicDrop(params: GenerateDropParams): Promise<DynamicDropResult> {
  try {
    const nextTrack =
      params.nextTrackTitle && params.nextTrackArtist
        ? {
            id: params.nextTrackId,
            title: params.nextTrackTitle,
            artist: params.nextTrackArtist,
            genre: params.nextTrackGenre,
          }
        : undefined;

    const drop = await generateDropEngineV2({
      nextTrack,
      preferredPersonaId: params.preferredPersonaId,
      introSeconds: params.timingType === "intro" ? 10 : 15,
    });

    return {
      drop_url: drop.audio_url,
      script: drop.script,
      title: `${drop.persona_name} · GOODLIFE Drop`,
      persona: drop.persona_name,
      mood: drop.tag,
      timingType: params.timingType || "outro",
      is_fallback: drop.is_generic_fallback,
    };
  } catch (err: any) {
    console.error("[ai-drops] Pipeline error, serving reviewed generic drop:", err.message);
    const fallback = selectGenericReviewedDrop(params.preferredPersonaId);
    return {
      drop_url: fallback.audio_url || "",
      script: fallback.script,
      title: `${fallback.persona_name} · GOODLIFE Stager`,
      persona: fallback.persona_name,
      mood: fallback.tag,
      timingType: params.timingType || "outro",
      is_fallback: true,
    };
  }
}
