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

// DELETE /api/radio/schedules/[id] - Cancel a scheduled item
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;

    const result = await neonQuery(
      `UPDATE radio_schedules 
       SET status = 'cancelled' 
       WHERE id = $1 AND status IN ('pending', 'armed')
       RETURNING id, title, target_type`,
      [scheduleId]
    );

    if (!result || result.length === 0) {
      return NextResponse.json({ ok: false, error: "Schedule not found or already executed/cancelled" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, cancelled: result[0] });
  } catch (error: any) {
    console.error("[DELETE /api/radio/schedules/[id]] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/radio/schedules/[id] - Mark executed or postpone
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;
    const body = await req.json();
    const { action, postpone_minutes } = body;

    if (action === "execute") {
      const rows = await neonQuery(
        `UPDATE radio_schedules 
         SET status = 'executed', executed_at = NOW() 
         WHERE id = $1 AND status IN ('pending', 'armed')
         RETURNING *`,
        [scheduleId]
      );
      if (!rows || rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Schedule not found or already inactive" }, { status: 404 });
      }

      const executedItem = rows[0];

      // Handle recurrence if configured
      if (executedItem.recurrence && executedItem.recurrence !== "once") {
        let intervalSql = "INTERVAL '1 day'";
        if (executedItem.recurrence === "hourly") intervalSql = "INTERVAL '1 hour'";
        if (executedItem.recurrence === "weekly") intervalSql = "INTERVAL '1 week'";

        await neonQuery(
          `INSERT INTO radio_schedules (
             target_type, target_id, title, artist_or_persona, audio_url, cover_url, duration_sec,
             trigger_type, scheduled_for, cue_offset_sec, parent_track_id, recurrence,
             status, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9::timestamptz + ${intervalSql},
             $10, $11, $12, 'pending', $13
           )`,
          [
            executedItem.target_type,
            executedItem.target_id,
            executedItem.title,
            executedItem.artist_or_persona,
            executedItem.audio_url,
            executedItem.cover_url,
            executedItem.duration_sec,
            executedItem.trigger_type,
            executedItem.scheduled_for || new Date().toISOString(),
            executedItem.cue_offset_sec,
            executedItem.parent_track_id,
            executedItem.recurrence,
            executedItem.created_by,
          ]
        );
      }

      return NextResponse.json({ ok: true, executed: executedItem });
    }

    if (action === "postpone") {
      const minutes = parseInt(postpone_minutes || "15", 10);
      const rows = await neonQuery(
        `UPDATE radio_schedules 
         SET scheduled_for = COALESCE(scheduled_for, NOW()) + ($2 || ' minutes')::INTERVAL,
             status = 'pending'
         WHERE id = $1 AND status IN ('pending', 'armed')
         RETURNING *`,
        [scheduleId, minutes]
      );
      if (!rows || rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Schedule not found or inactive" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, postponed: rows[0] });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[PATCH /api/radio/schedules/[id]] Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
