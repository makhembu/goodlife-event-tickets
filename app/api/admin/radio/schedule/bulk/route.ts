import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/radio/schedule/bulk
 * Supports bulk actions on broadcast slots:
 * - cancel: marks selected slots as 'cancelled'
 * - delete: permanently removes selected slots
 * - reassign: sets substitute_presenter_id for selected slots
 * - status: sets status ('scheduled', 'completed', 'cancelled')
 * - clear_future: deletes all future scheduled slots (>= NOW())
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, slot_ids, status, substitute_presenter_id } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    if (action === "clear_future") {
      const { rowCount } = await neonQuery(
        `DELETE FROM show_slots WHERE starts_at >= NOW();`
      );
      return NextResponse.json({
        success: true,
        message: `Cleared ${rowCount || 0} future slot(s).`,
        count: rowCount || 0,
      });
    }

    if (!Array.isArray(slot_ids) || slot_ids.length === 0) {
      return NextResponse.json(
        { error: "slot_ids must be a non-empty array of numbers" },
        { status: 400 }
      );
    }

    const ids = slot_ids.map((id: any) => parseInt(id, 10)).filter((n: number) => !isNaN(n));
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid slot IDs provided" }, { status: 400 });
    }

    if (action === "cancel") {
      const { rowCount } = await neonQuery(
        `UPDATE show_slots
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = ANY($1::int[]);`,
        [ids]
      );
      return NextResponse.json({
        success: true,
        message: `Cancelled ${rowCount || 0} slot(s).`,
        count: rowCount || 0,
      });
    }

    if (action === "delete") {
      const { rowCount } = await neonQuery(
        `DELETE FROM show_slots
         WHERE id = ANY($1::int[]);`,
        [ids]
      );
      return NextResponse.json({
        success: true,
        message: `Permanently deleted ${rowCount || 0} slot(s).`,
        count: rowCount || 0,
      });
    }

    if (action === "reassign") {
      const subId = substitute_presenter_id ? parseInt(substitute_presenter_id, 10) : null;
      const { rowCount } = await neonQuery(
        `UPDATE show_slots
         SET substitute_presenter_id = $1, updated_at = NOW()
         WHERE id = ANY($2::int[]);`,
        [subId, ids]
      );
      return NextResponse.json({
        success: true,
        message: `Reassigned ${rowCount || 0} slot(s).`,
        count: rowCount || 0,
      });
    }

    if (action === "status") {
      const validStatuses = ["scheduled", "warmup", "live", "completed", "noshow", "cancelled"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      const { rowCount } = await neonQuery(
        `UPDATE show_slots
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[]);`,
        [status, ids]
      );
      return NextResponse.json({
        success: true,
        message: `Updated status for ${rowCount || 0} slot(s) to ${status}.`,
        count: rowCount || 0,
      });
    }

    return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
  } catch (err: any) {
    console.error("[bulk schedule action] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
