import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgePlaylistPreview } from "@/lib/radio/bridge-client";
import { resolvePlaylist } from "@/lib/radio/playlist-resolver";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!url.trim()) {
    return NextResponse.json({ error: "Playlist URL required" }, { status: 400 });
  }

  // 1. Try native YouTube / Spotify playlist parser
  try {
    const resolved = await resolvePlaylist(url);
    if (resolved && resolved.tracks && resolved.tracks.length > 0) {
      return NextResponse.json(resolved);
    }
  } catch (err: any) {
    console.warn("[playlist-preview] Native resolver attempted, trying bridge:", err?.message);
  }

  // 2. Fall back to bridge client
  const res = await bridgePlaylistPreview(url);
  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Playlist lookup failed" }, { status: 502 });
  }

  return NextResponse.json(res.data);
}
