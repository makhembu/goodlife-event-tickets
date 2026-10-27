import { NextRequest, NextResponse } from "next/server";
import { generateDynamicDrop } from "@/lib/radio/ai-drops";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { nextTrackTitle, nextTrackArtist, theme } = body;

    const result = await generateDynamicDrop({
      nextTrackTitle: nextTrackTitle?.toString().slice(0, 100),
      nextTrackArtist: nextTrackArtist?.toString().slice(0, 100),
      theme: theme?.toString().slice(0, 50),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[api/radio/drops/dynamic] Error:", err.message);
    return NextResponse.json(
      {
        drop_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
        script: "Vibes at Marara, its GOODLIFE Festival, Nairobi Sound takin over tonight, Jambo!",
        title: "Marara Camp Vibes 254",
      },
      { status: 200 }
    );
  }
}
