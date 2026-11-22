import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { verifyAdminSession } from "@/lib/admin-session";
import { verifyPresenterSession } from "@/lib/presenter-session";

async function verifyAuth(req: NextRequest) {
  const adminCookie = req.cookies.get("goodlife_admin_session")?.value;
  if (adminCookie) {
    const isAdmin = await verifyAdminSession(adminCookie);
    if (isAdmin) return { authenticated: true, user: "admin", role: "admin" };
  }
  const presCookie = req.cookies.get("goodlife_presenter_session")?.value;
  if (presCookie) {
    const presenter = await verifyPresenterSession(presCookie);
    if (presenter) return { authenticated: true, user: presenter.djName || presenter.email, role: "presenter" };
  }
  return { authenticated: false };
}

// GET /api/radio/schedules - List pending/armed schedules & auto-expire stale entries
export async function GET(req: NextRequest) {
  try {
    // Auto-expire items older than 10 minutes past scheduled_for that were never executed
    await neonQuery(
      `UPDATE radio_schedules 
       SET status = 'expired' 
       WHERE status = 'pending' 
         AND trigger_type IN ('clock_soft', 'clock_duck')
         AND scheduled_for < NOW() - INTERVAL '10 minutes'`
    );

    const rows = await neonQuery(
      `SELECT id, target_type, target_id, title, artist_or_persona, audio_url, cover_url, duration_sec,
              trigger_type, scheduled_for, cue_offset_sec, parent_track_id, recurrence,
              status, created_at, created_by,
              EXTRACT(EPOCH FROM (scheduled_for - NOW()))::INT AS remaining_sec
       FROM radio_schedules
       WHERE status IN ('pending', 'armed')
       ORDER BY 
         CASE WHEN scheduled_for IS NOT NULL THEN scheduled_for ELSE created_at END ASC
       LIMIT 50`
    );

    return NextResponse.json({ ok: true, schedules: rows || [] });
  } catch (error: any) {
    console.error("[GET /api/radio/schedules] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST /api/radio/schedules - Create a scheduled song or drop
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      target_type,
      target_id,
      title,
      artist_or_persona,
      audio_url,
      cover_url,
      duration_sec,
      trigger_type,
      scheduled_for,
      cue_offset_sec,
      parent_track_id,
      recurrence = "once",
    } = body;

    if (!target_type || !title || !audio_url || !trigger_type) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: target_type, title, audio_url, trigger_type" },
        { status: 400 }
      );
    }

    let parsedScheduledFor: string | null = null;
    if (trigger_type === "clock_soft" || trigger_type === "clock_duck") {
      if (!scheduled_for) {
        return NextResponse.json(
          { ok: false, error: "scheduled_for timestamp is required for clock triggers" },
          { status: 400 }
        );
      }
      const targetDate = new Date(scheduled_for);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ ok: false, error: "Invalid scheduled_for timestamp" }, { status: 400 });
      }
      parsedScheduledFor = targetDate.toISOString();
    }

    const result = await neonQuery(
      `INSERT INTO radio_schedules (
         target_type, target_id, title, artist_or_persona, audio_url, cover_url, duration_sec,
         trigger_type, scheduled_for, cue_offset_sec, parent_track_id, recurrence,
         status, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13)
       RETURNING *`,
      [
        target_type,
        target_id ? String(target_id) : null,
        title,
        artist_or_persona || null,
        audio_url,
        cover_url || null,
        duration_sec || 0,
        trigger_type,
        parsedScheduledFor,
        cue_offset_sec || null,
        parent_track_id ? String(parent_track_id) : null,
        recurrence,
        auth.user,
      ]
    );

    const created = result[0];
    return NextResponse.json({ ok: true, schedule: created }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/radio/schedules] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
