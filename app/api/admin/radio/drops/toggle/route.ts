import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const { rows } = await neonQuery("SELECT ai_drops_enabled FROM radio_settings WHERE id = 1");
    const enabled = rows[0]?.ai_drops_enabled ?? false;
    return NextResponse.json({ success: true, ai_drops_enabled: enabled });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    let targetEnabled: boolean;

    if (typeof body.enabled === "boolean") {
      targetEnabled = body.enabled;
    } else {
      // Toggle current value
      const cur = await neonQuery("SELECT ai_drops_enabled FROM radio_settings WHERE id = 1");
      const currentVal = cur.rows[0]?.ai_drops_enabled ?? false;
      targetEnabled = !currentVal;
    }

    const { rows } = await neonQuery(
      `UPDATE radio_settings 
       SET ai_drops_enabled = $1, updated_at = NOW() 
       WHERE id = 1 
       RETURNING id, broadcast_mode, ai_drops_enabled`,
      [targetEnabled]
    );

    // If disabled, also archive any unplayed live drops so nothing airs
    if (!targetEnabled) {
      await neonQuery(
        "UPDATE radio_drops SET timing_type = 'archived' WHERE timing_type IN ('live_inject', 'live_drop')"
      );
    }

    return NextResponse.json({
      success: true,
      ai_drops_enabled: rows[0]?.ai_drops_enabled,
      message: targetEnabled ? "AI Station Drops enabled" : "AI Station Drops disabled & unplayed drops purged",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
