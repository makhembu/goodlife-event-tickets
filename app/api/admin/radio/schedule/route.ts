import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let startDate = fromParam ? new Date(fromParam) : new Date();
    let endDate = toParam ? new Date(toParam) : new Date(startDate.getTime() + 30 * 86400 * 1000);

    const query = `
      SELECT 
        sl.*,
        sh.title AS show_title,
        sh.slug AS show_slug,
        sh.genre AS show_genre,
        p.dj_name AS presenter_dj_name,
        p.email AS presenter_email,
        sub.dj_name AS substitute_dj_name
      FROM show_slots sl
      JOIN shows sh ON sh.id = sl.show_id
      JOIN presenters p ON p.id = sl.presenter_id
      LEFT JOIN presenters sub ON sub.id = sl.substitute_presenter_id
      WHERE sl.ends_at >= $1 AND sl.starts_at <= $2
      ORDER BY sl.starts_at ASC;
    `;

    const { rows } = await neonQuery(query, [startDate.toISOString(), endDate.toISOString()]);
    return NextResponse.json({ slots: rows || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { show_id, presenter_id, starts_at, ends_at, notes } = body;

    if (!show_id || !presenter_id || !starts_at || !ends_at) {
      return NextResponse.json(
        { error: "Show, Presenter, starts_at, and ends_at are required" },
        { status: 400 }
      );
    }

    const startDate = new Date(starts_at);
    const endDate = new Date(ends_at);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json(
        { error: "ends_at must be strictly after starts_at" },
        { status: 400 }
      );
    }

    // Overlap Check inside transaction
    const overlapRes = await neonQuery(
      `SELECT id, show_id, starts_at, ends_at 
       FROM show_slots 
       WHERE status != 'cancelled'
         AND starts_at < $2
         AND ends_at > $1
       LIMIT 1;`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    if (overlapRes.rows && overlapRes.rows.length > 0) {
      const conflict = overlapRes.rows[0];
      return NextResponse.json(
        {
          error: `Overlap detected with existing slot #${conflict.id} (${conflict.starts_at} - ${conflict.ends_at}). Station is a single broadcast channel.`,
          conflict,
        },
        { status: 409 }
      );
    }

    const query = `
      INSERT INTO show_slots (
        show_id, presenter_id, starts_at, ends_at, status, notes, generated_from_recurrence, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'scheduled', $5, false, NOW(), NOW())
      RETURNING *;
    `;

    const { rows } = await neonQuery(query, [
      parseInt(String(show_id), 10),
      parseInt(String(presenter_id), 10),
      startDate.toISOString(),
      endDate.toISOString(),
      notes ? String(notes).trim() : null,
    ]);

    return NextResponse.json({ success: true, slot: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
