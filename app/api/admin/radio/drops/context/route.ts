import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { buildUnifiedDropContext } from "@/lib/radio/drop-context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";
    const context = await buildUnifiedDropContext({ refreshExternal: refresh });

    return NextResponse.json({
      success: true,
      context,
      listeners_count: context.radio.active_listeners,
      active_listeners: context.radio.active_listeners,
      listeners: {
        active: context.radio.active_listeners,
        active_10m: context.radio.active_listeners_10m,
        total_24h: context.radio.listeners_24h,
      },
      tags: context.tags,
      generated_at: context.generated_at,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/drops/context] GET error:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to aggregate drop context" },
      { status: 500 }
    );
  }
}
