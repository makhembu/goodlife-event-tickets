import { NextRequest, NextResponse } from "next/server";
import { generateDynamicDrop } from "@/lib/radio/ai-drops";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      nextTrackTitle,
      nextTrackArtist,
      nextTrackGenre,
      currentTrackTitle,
      currentTrackArtist,
      timingType,
      preferredMood,
    } = body;

    const result = await generateDynamicDrop({
      nextTrackTitle: nextTrackTitle?.toString().slice(0, 100),
      nextTrackArtist: nextTrackArtist?.toString().slice(0, 100),
      nextTrackGenre: nextTrackGenre?.toString().slice(0, 50),
      currentTrackTitle: currentTrackTitle?.toString().slice(0, 100),
      currentTrackArtist: currentTrackArtist?.toString().slice(0, 100),
      timingType: timingType === "intro" || timingType === "mid_song" ? timingType : "outro",
      preferredMood,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[api/radio/drops/dynamic] Error:", err.message);
    return NextResponse.json(
      {
        drop_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
        script: "[excited] [shouting] Over 1,200 people locked in! Turn the volume all the way UP on 98.4 FM!",
        title: "DJ Shax · GOODLIFE Hype",
        persona: "DJ Shax",
        mood: "HYPE",
        timingType: "outro",
      },
      { status: 200 }
    );
  }
}
