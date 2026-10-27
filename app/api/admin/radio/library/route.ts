import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { deleteRadioAudioKeys } from "@/lib/radio/r2-signer";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  let query = `
    SELECT * FROM radio_sets 
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (eventId) {
    query += ` AND event_id = $1`;
    params.push(parseInt(eventId, 10));
  }

  query += ` ORDER BY display_order ASC, created_at DESC`;

  const { rows } = await neonQuery(query, params);
  return NextResponse.json(rows || []);
}

export async function PATCH(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "reorder") {
      const { order } = body; // Array of IDs in display sequence
      if (!Array.isArray(order)) {
        return NextResponse.json({ error: "Order array required" }, { status: 400 });
      }

      const ids: number[] = order.map((id: any) => parseInt(String(id), 10)).filter((id: number) => !isNaN(id));
      if (ids.length > 0) {
        const orders: number[] = ids.map((_, idx) => idx);
        await neonQuery(
          `UPDATE radio_sets AS r
           SET display_order = u.new_order
           FROM (
             SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS new_order
           ) AS u
           WHERE r.id = u.id`,
          [ids, orders]
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "update") {
      const { id, title, dj_name, genre, is_active } = body;
      if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

      const updates: string[] = [];
      const params: any[] = [id];
      let pIdx = 2;

      if (title !== undefined) {
        updates.push(`title = $${pIdx++}`);
        params.push(title);
      }
      if (dj_name !== undefined) {
        updates.push(`dj_name = $${pIdx++}`);
        params.push(dj_name);
      }
      if (genre !== undefined) {
        updates.push(`genre = $${pIdx++}`);
        params.push(genre);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${pIdx++}`);
        params.push(Boolean(is_active));
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const q = `UPDATE radio_sets SET ${updates.join(", ")} WHERE id = $1 RETURNING *`;
      const { rows } = await neonQuery(q, params);
      return NextResponse.json({ success: true, item: rows[0] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (!idParam) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const id = parseInt(idParam, 10);
    // 1. Fetch keys before soft deletion
    const { rows } = await neonQuery(
      "SELECT r2_key, r2_high_key FROM radio_sets WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { r2_key, r2_high_key } = rows[0];

    // 2. Soft delete record
    await neonQuery(
      "UPDATE radio_sets SET deleted_at = NOW(), is_active = false WHERE id = $1",
      [id]
    );

    // 3. Purge Cloudflare R2 audio files
    await deleteRadioAudioKeys([r2_key, r2_high_key]);

    return NextResponse.json({ success: true, deleted_id: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
