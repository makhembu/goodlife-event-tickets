import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;

  try {
    const query = `
      SELECT 
        sl.id,
        sl.show_id,
        sl.presenter_id,
        sl.substitute_presenter_id,
        sl.starts_at,
        sl.ends_at,
        sl.status,
        sl.notes,
        sh.title AS show_title,
        sh.slug AS show_slug,
        sh.genre AS show_genre,
        sh.cover_image_url AS show_cover,
        p.dj_name AS primary_dj_name,
        sub.dj_name AS substitute_dj_name
      FROM show_slots sl
      JOIN shows sh ON sh.id = sl.show_id
      JOIN presenters p ON p.id = sl.presenter_id
      LEFT JOIN presenters sub ON sub.id = sl.substitute_presenter_id
      WHERE (sl.presenter_id = $1 OR sl.substitute_presenter_id = $1)
        AND sl.status != 'cancelled'
      ORDER BY sl.starts_at ASC;
    `;

    const { rows } = await neonQuery(query, [presenter.id]);

    const now = new Date();
    const upcoming = rows.filter((r: any) => new Date(r.ends_at) > now);
    const past = rows.filter((r: any) => new Date(r.ends_at) <= now);

    return NextResponse.json({
      upcoming_slots: upcoming,
      past_slots: past,
      total: rows.length,
    });
  } catch (err: any) {
    console.error("[api/presenter/slots] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to load slots" }, { status: 500 });
  }
}
