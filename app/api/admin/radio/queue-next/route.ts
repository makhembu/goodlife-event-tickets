import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeQueueNext } from "@/lib/radio/bridge-client";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { url, custom_drop_text, voice_preference } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid track URL (YouTube, SoundCloud, or direct audio link) is required." },
        { status: 400 }
      );
    }

    const result = await bridgeQueueNext({
      url: url.trim(),
      custom_drop_text: custom_drop_text?.trim() || undefined,
      voice_preference: voice_preference === "female" ? "female" : "male",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to process and queue track." },
        { status: 502 }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error queueing track." },
      { status: 500 }
    );
  }
}
