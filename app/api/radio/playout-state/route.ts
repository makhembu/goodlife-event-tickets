import { NextResponse } from "next/server";
import { getAuthoritativePlayoutState } from "@/lib/radio/broadcast-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getAuthoritativePlayoutState();
    if (!state) {
      return NextResponse.json({ offline: true, error: "No active radio sets" }, { status: 503 });
    }
    return NextResponse.json(state, {
      headers: {
        "Cache-Control": "public, s-maxage=3, stale-while-revalidate=3",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Playout calculation failed" }, { status: 500 });
  }
}
