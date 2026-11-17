import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Check radio_settings for default standby audio and current mode
    const settingsRes = await neonQuery(
      "SELECT broadcast_mode, live_title, default_standby_audio_url FROM radio_settings WHERE id = 1"
    );
    const settings = settingsRes.rows[0] || {};
    const defaultUrl = settings.default_standby_audio_url || null;

    // 2. Check if a presenter has an active show slot right now
    const now = new Date().toISOString();
    const slotRes = await neonQuery(
      `SELECT s.id as slot_id, s.status, p.id as presenter_id, p.dj_name, p.slug, p.standby_audio_url
       FROM show_slots s
       JOIN shows sh ON s.show_id = sh.id
       JOIN presenters p ON COALESCE(s.substitute_presenter_id, sh.primary_presenter_id) = p.id
       WHERE s.starts_at <= $1 AND s.ends_at >= $1 AND s.status IN ('live', 'warmup', 'scheduled')
       ORDER BY CASE WHEN s.status = 'live' THEN 1 WHEN s.status = 'warmup' THEN 2 ELSE 3 END
       LIMIT 1`,
      [now]
    );

    const activeSlot = slotRes.rows[0];

    if (activeSlot && activeSlot.standby_audio_url) {
      return NextResponse.json({
        active: true,
        presenter: {
          id: activeSlot.presenter_id,
          dj_name: activeSlot.dj_name,
          slug: activeSlot.slug,
        },
        standby_audio_url: activeSlot.standby_audio_url,
        is_custom: true,
      });
    }

    // Fall back to station default
    return NextResponse.json({
      active: Boolean(activeSlot),
      presenter: activeSlot
        ? { id: activeSlot.presenter_id, dj_name: activeSlot.dj_name, slug: activeSlot.slug }
        : null,
      standby_audio_url: defaultUrl,
      is_custom: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve standby audio" },
      { status: 500 }
    );
  }
}
