import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const res = await neonQuery(
      `SELECT s.*, p.dj_name, p.slug as presenter_slug, p.avatar_url as presenter_avatar
       FROM shows s
       JOIN presenters p ON p.id = s.primary_presenter_id
       ORDER BY s.id ASC;`
    );
    return NextResponse.json({ shows: res.rows || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      genre,
      cover_image_url,
      primary_presenter_id,
      default_duration_min,
      recurrence_pattern,
      recurrence_days,
      default_start_time,
    } = body;

    if (!title || !primary_presenter_id) {
      return NextResponse.json(
        { error: "Show title and primary presenter are required" },
        { status: 400 }
      );
    }

    let slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) slug = `show-${Date.now().toString().slice(-4)}`;

    const query = `
      INSERT INTO shows (
        title, slug, description, genre, cover_image_url, primary_presenter_id,
        default_duration_min, recurrence_pattern, recurrence_days, default_start_time,
        is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      RETURNING *;
    `;

    const { rows } = await neonQuery(query, [
      String(title).trim(),
      slug,
      description ? String(description).trim() : null,
      genre ? String(genre).trim() : "Afrobeats",
      cover_image_url || null,
      parseInt(String(primary_presenter_id), 10),
      parseInt(String(default_duration_min || 120), 10),
      recurrence_pattern || "weekly",
      Array.isArray(recurrence_days) ? recurrence_days : ["Friday"],
      default_start_time || "20:00:00",
    ]);

    return NextResponse.json({ success: true, show: rows[0] });
  } catch (err: any) {
    console.error("[api/admin/radio/shows] Create error:", err);
    if (err.message && err.message.includes("unique")) {
      return NextResponse.json({ error: "Show slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
