import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgePlaylistPreview } from "@/lib/radio/bridge-client";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!url.trim()) {
    return NextResponse.json({ error: "Playlist URL required" }, { status: 400 });
  }

  const res = await bridgePlaylistPreview(url);
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Playlist lookup failed" }, { status: 502 });
  }

  return NextResponse.json(res.data);
}
