import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetAzuracastNowPlaying } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const res = await bridgeGetAzuracastNowPlaying();
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed to fetch AzuraCast now playing" },
      { status: 502 }
    );
  }

  return NextResponse.json(res.data);
}
