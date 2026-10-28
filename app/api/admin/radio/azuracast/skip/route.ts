import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeSkipTrack } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const res = await bridgeSkipTrack();
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed to skip track" },
      { status: 502 }
    );
  }

  return NextResponse.json(res.data);
}
