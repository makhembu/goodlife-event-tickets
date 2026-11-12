import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request, ["superadmin", "station_manager"]);
  if (authErr) return authErr;

  try {
    // 1. Listeners per show & presenter
    const { rows: showStats } = await neonQuery(
      `SELECT s.id, s.title, p.name as presenter_name, 
              COUNT(sl.id) as total_slots,
              COALESCE(SUM(t.amount), 0) as total_tips,
              COUNT(DISTINCT t.id) as tip_count
       FROM radio_shows s
       JOIN radio_presenters p ON s.presenter_id = p.id
       LEFT JOIN radio_show_slots sl ON sl.show_id = s.id
       LEFT JOIN radio_tips t ON t.slot_id = sl.id AND t.status = 'completed'
       GROUP BY s.id, s.title, p.name
       ORDER BY total_tips DESC, total_slots DESC
       LIMIT 10`
    );

    // 2. Presenter reliability metrics (on-time, late, noshows)
    const { rows: presenterReliability } = await neonQuery(
      `SELECT p.id, p.name, p.dj_handle,
              COUNT(sl.id) as scheduled_slots,
              COUNT(CASE WHEN sl.status = 'completed' THEN 1 END) as completed_slots,
              COUNT(CASE WHEN sl.status = 'noshow' THEN 1 END) as noshow_slots
       FROM radio_presenters p
       LEFT JOIN radio_show_slots sl ON sl.presenter_id = p.id
       WHERE p.is_active = TRUE
       GROUP BY p.id, p.name, p.dj_handle
       ORDER BY completed_slots DESC`
    );

    // 3. Tip performance summary
    const { rows: tipSummary } = await neonQuery(
      `SELECT 
         COUNT(*) as total_attempts,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tips,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_tipped_kes
       FROM radio_tips`
    );

    return NextResponse.json({
      shows: showStats,
      presenters: presenterReliability,
      tips: {
        total_attempts: Number(tipSummary[0]?.total_attempts || 0),
        completed_tips: Number(tipSummary[0]?.completed_tips || 0),
        total_tipped_kes: Number(tipSummary[0]?.total_tipped_kes || 0),
      },
    });
  } catch (error: any) {
    console.error("[Radio Analytics API] Error:", error);
    return NextResponse.json({ error: "Failed to load radio analytics" }, { status: 500 });
  }
}
