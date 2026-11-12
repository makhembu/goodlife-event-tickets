import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGetNowPlaying } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const res = await bridgeGetNowPlaying();
  const data = res.data as any;

  // Query live status from database as well:
  // 1. Is there an active live show_slot?
  // 2. Is radio_settings in 'live' broadcast_mode (e.g. Admin Takeover or Live DJ)?
  let dbLiveShow: { slot_id: number; show_title: string; dj_name: string } | null = null;
  let broadcastMode = "autodj";
  let liveTitle = "GOODLIFE MAIN STAGE LIVE";

  try {
    const [slotRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT s.id AS slot_id, sh.title AS show_title,
               COALESCE(sub.dj_name, p.dj_name) AS on_air_dj_name
        FROM show_slots s
        JOIN shows sh ON s.show_id = sh.id
        JOIN presenters p ON s.presenter_id = p.id
        LEFT JOIN presenters sub ON s.substitute_presenter_id = sub.id
        WHERE s.status = 'live'
        LIMIT 1;
      `),
      neonQuery(`
        SELECT broadcast_mode, live_title
        FROM radio_settings
        WHERE id = 1
        LIMIT 1;
      `),
    ]);

    if (slotRes.rows.length > 0) {
      dbLiveShow = {
        slot_id: slotRes.rows[0].slot_id,
        show_title: slotRes.rows[0].show_title,
        dj_name: slotRes.rows[0].on_air_dj_name,
      };
    }

    if (settingsRes.rows.length > 0) {
      broadcastMode = settingsRes.rows[0].broadcast_mode || "autodj";
      liveTitle = settingsRes.rows[0].live_title || "GOODLIFE MAIN STAGE LIVE";
    }
  } catch (dbErr) {
    console.warn("[admin radio health] Error checking db live state:", dbErr);
  }

  const bridgeDjConnected = Boolean(data?.live_dj_connected);
  const isBroadcastingLive = bridgeDjConnected || dbLiveShow !== null || broadcastMode === "live";

  let onAirType: "autodj" | "presenter" | "admin" = "autodj";
  let onAirName = null;

  if (dbLiveShow) {
    onAirType = "presenter";
    onAirName = dbLiveShow.dj_name;
  } else if (broadcastMode === "live" || bridgeDjConnected) {
    // If bridge specifies DJ or it's an admin takeover
    if (data?.live_dj_name && data.live_dj_name.toLowerCase().includes("admin")) {
      onAirType = "admin";
      onAirName = "Admin Control";
    } else if (data?.live_dj_name) {
      onAirType = "presenter";
      onAirName = data.live_dj_name;
    } else {
      onAirType = "admin";
      onAirName = "Live Master Ingest";
    }
  }

  return NextResponse.json({
    ok: res.ok,
    error: res.error || null,
    data: res.data || null,
    live_dj_connected: isBroadcastingLive,
    live_dj_name: onAirName || data?.live_dj_name || null,
    live_type: onAirType, // "autodj" | "presenter" | "admin"
    broadcast_mode: broadcastMode,
    live_show: dbLiveShow,
    live_title: liveTitle,
  });
}

