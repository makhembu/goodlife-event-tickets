import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetNowPlaying } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const res = await bridgeGetNowPlaying();
  const data = res.data as any;
  return NextResponse.json({
    ok: res.ok,
    error: res.error || null,
    data: res.data || null,
    live_dj_connected: data?.live_dj_connected ?? false,
    live_dj_name: data?.live_dj_name ?? null,
  });
}
