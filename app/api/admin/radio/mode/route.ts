import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const res = await neonQuery(
      "SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"
    );
    const row = res.rows[0] || {};
    return NextResponse.json({
      mode: row.broadcast_mode || "autodj",
      active_set_id: row.active_set_id || null,
      active_started_at: row.active_started_at || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "mania" ? "mania" : "autodj";

    if (mode === "mania") {
      // If entering mania mode and active_set_id is null, pick the first active set
      const cur = await neonQuery(
        "SELECT active_set_id FROM radio_settings WHERE id = 1"
      );
      let activeId = cur.rows[0]?.active_set_id;
      if (!activeId) {
        const firstSet = await neonQuery(
          "SELECT id FROM radio_sets WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready' ORDER BY display_order ASC, id ASC LIMIT 1"
        );
        activeId = firstSet.rows[0]?.id || null;
      }

      await neonQuery(
        `UPDATE radio_settings 
         SET broadcast_mode = 'mania', 
             active_set_id = COALESCE($1, active_set_id),
             active_started_at = NOW(),
             updated_at = NOW() 
         WHERE id = 1`,
        [activeId]
      );
    } else {
      // AutoDJ mode: server timeline automatically rotates across festival sets
      await neonQuery(
        `UPDATE radio_settings 
         SET broadcast_mode = 'autodj', 
             updated_at = NOW() 
         WHERE id = 1`
      );
    }

    return NextResponse.json({
      success: true,
      mode,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/mode] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
