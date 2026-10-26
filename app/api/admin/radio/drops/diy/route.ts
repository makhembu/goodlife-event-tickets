import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { BRIDGE_BASE_URL, signRequest } from "@/lib/radio/bridge-client";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const name = formData.get("name") || "mic_drop";

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    const { timestamp, signature } = signRequest(timestampString(audioFile.size));

    // Forward multipart form to daemon
    const outgoingFormData = new FormData();
    outgoingFormData.append("audio", audioFile, "recording.webm");
    outgoingFormData.append("name", String(name));

    const response = await fetch(`${BRIDGE_BASE_URL}/api/radio/drops/diy`, {
      method: "POST",
      headers: {
        "X-Bridge-Timestamp": timestamp,
        "X-Bridge-Signature": signature,
        "X-Goodlife-Timestamp": timestamp,
        "X-Goodlife-Radio-Key": signature,
      },
      body: outgoingFormData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Daemon failed to master audio (${response.status}): ${errText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process DIY drop recording." },
      { status: 500 }
    );
  }
}

function timestampString(size: number): string {
  return `${Math.floor(Date.now() / 1000)}_${size}`;
}
