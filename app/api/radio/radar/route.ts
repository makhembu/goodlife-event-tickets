import { NextResponse } from "next/server";
import { getListenerAnalytics } from "@/lib/radio/listener-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const analytics = await getListenerAnalytics();
    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=5",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
