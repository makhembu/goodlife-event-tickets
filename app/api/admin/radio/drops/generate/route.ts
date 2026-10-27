import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGenerateAiDrop } from "@/lib/radio/bridge-client";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { prompt, theme, custom_text, voice_id } = body;

    const result = await bridgeGenerateAiDrop({
      prompt: prompt?.trim(),
      theme: theme?.trim(),
      custom_text: custom_text?.trim(),
      voice_id: voice_id?.trim(),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to generate AI drop via radio daemon." },
        { status: 502 }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error generating AI drop." },
      { status: 500 }
    );
  }
}
