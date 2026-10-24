import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeQueueIngest } from "@/lib/radio/bridge-client";

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { tracks, genre, event_id } = body;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "Tracks array required" }, { status: 400 });
    }

    const res = await bridgeQueueIngest({ tracks, genre, event_id });
    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Failed to enqueue ingestion" }, { status: 502 });
    }

    return NextResponse.json(res.data, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Invalid payload" }, { status: 400 });
  }
}
