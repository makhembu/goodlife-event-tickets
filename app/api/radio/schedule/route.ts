import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");

    let startDate: Date;
    if (fromParam) {
      startDate = new Date(fromParam);
      if (isNaN(startDate.getTime())) {
        startDate = new Date();
      }
    } else {
      startDate = new Date();
    }

    const endDate = new Date(startDate.getTime() + 7 * 24 * 3600 * 1000);

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
        sl.generated_from_recurrence,
        -- Show details
        sh.title AS show_title,
        sh.slug AS show_slug,
        sh.description AS show_description,
        sh.genre AS show_genre,
        sh.cover_image_url AS show_cover_image,
        -- Primary Presenter details
        p.dj_name AS presenter_dj_name,
        p.slug AS presenter_slug,
        p.avatar_url AS presenter_avatar,
        -- Substitute Presenter details
        sub.dj_name AS substitute_dj_name,
        sub.slug AS substitute_slug,
        sub.avatar_url AS substitute_avatar
      FROM show_slots sl
      JOIN shows sh ON sh.id = sl.show_id
      JOIN presenters p ON p.id = sl.presenter_id
      LEFT JOIN presenters sub ON sub.id = sl.substitute_presenter_id
      WHERE sl.status != 'cancelled'
        AND sl.ends_at >= $1
        AND sl.starts_at <= $2
      ORDER BY sl.starts_at ASC;
    `;

    const { rows } = await neonQuery(query, [startDate.toISOString(), endDate.toISOString()]);

    const formattedSlots = rows.map((r: any) => ({
      id: r.id,
      show_id: r.show_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      status: r.status,
      notes: r.notes,
      show: {
        id: r.show_id,
        title: r.show_title,
        slug: r.show_slug,
        description: r.show_description,
        genre: r.show_genre,
        cover_image_url: r.show_cover_image,
      },
      presenter: {
        id: r.presenter_id,
        dj_name: r.presenter_dj_name,
        slug: r.presenter_slug,
        avatar_url: r.presenter_avatar,
      },
      substitute_presenter: r.substitute_presenter_id
        ? {
            id: r.substitute_presenter_id,
            dj_name: r.substitute_dj_name,
            slug: r.substitute_slug,
            avatar_url: r.substitute_avatar,
          }
        : null,
    }));

    return NextResponse.json(
      {
        window_start: startDate.toISOString(),
        window_end: endDate.toISOString(),
        station_timezone: "Africa/Nairobi",
        slots: formattedSlots,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (err: any) {
    console.error("[api/radio/schedule] Failed to fetch schedule:", err);
    return NextResponse.json({ error: err.message || "Failed to load schedule" }, { status: 500 });
  }
}
