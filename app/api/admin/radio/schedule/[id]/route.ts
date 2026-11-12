import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const { id } = await context.params;
    const slotId = parseInt(id, 10);
    const body = await req.json().catch(() => ({}));
    const { presenter_id, substitute_presenter_id, status, notes, starts_at, ends_at } = body;

    // If starts_at or ends_at is modified, check overlap with OTHER slots
    if (starts_at || ends_at) {
      // First get current slot dates if only one is provided
      const curRes = await neonQuery(`SELECT starts_at, ends_at FROM show_slots WHERE id = $1`, [slotId]);
      if (!curRes.rows || curRes.rows.length === 0) {
        return NextResponse.json({ error: "Slot not found" }, { status: 404 });
      }

      const newStart = starts_at ? new Date(starts_at) : new Date(curRes.rows[0].starts_at);
      const newEnd = ends_at ? new Date(ends_at) : new Date(curRes.rows[0].ends_at);

      if (newEnd <= newStart) {
        return NextResponse.json({ error: "ends_at must be strictly after starts_at" }, { status: 400 });
      }

      const overlapRes = await neonQuery(
        `SELECT id, starts_at, ends_at FROM show_slots
         WHERE id != $1 AND status != 'cancelled'
           AND starts_at < $3 AND ends_at > $2
         LIMIT 1;`,
        [slotId, newStart.toISOString(), newEnd.toISOString()]
      );

      if (overlapRes.rows && overlapRes.rows.length > 0) {
        return NextResponse.json(
          { error: "Proposed time range overlaps with another scheduled slot", conflict: overlapRes.rows[0] },
          { status: 409 }
        );
      }
    }

    const query = `
      UPDATE show_slots
      SET presenter_id = COALESCE($1, presenter_id),
          substitute_presenter_id = $2,
          status = COALESCE($3, status),
          notes = COALESCE($4, notes),
          starts_at = COALESCE($5, starts_at),
          ends_at = COALESCE($6, ends_at),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const { rows } = await neonQuery(query, [
      presenter_id ? parseInt(String(presenter_id), 10) : null,
      substitute_presenter_id !== undefined
        ? substitute_presenter_id
          ? parseInt(String(substitute_presenter_id), 10)
          : null
        : null,
      status || null,
      notes !== undefined ? notes : null,
      starts_at ? new Date(starts_at).toISOString() : null,
      ends_at ? new Date(ends_at).toISOString() : null,
      slotId,
    ]);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, slot: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const { id } = await context.params;
    const slotId = parseInt(id, 10);

    // Mark as cancelled rather than hard deleting to preserve historical telemetry
    const { rows } = await neonQuery(
      `UPDATE show_slots SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING id;`,
      [slotId]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, cancelled_id: slotId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
