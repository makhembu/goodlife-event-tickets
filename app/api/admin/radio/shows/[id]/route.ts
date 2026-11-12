import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const showId = parseInt(id, 10);
  if (isNaN(showId)) {
    return NextResponse.json({ error: "Invalid show ID" }, { status: 400 });
  }

  try {
    const { rows } = await neonQuery(
      `SELECT s.*, p.dj_name, p.slug as presenter_slug
       FROM shows s
       JOIN presenters p ON p.id = s.primary_presenter_id
       WHERE s.id = $1;`,
      [showId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    return NextResponse.json({ show: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const showId = parseInt(id, 10);
  if (isNaN(showId)) {
    return NextResponse.json({ error: "Invalid show ID" }, { status: 400 });
  }

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
      is_active,
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
    if (!slug) slug = `show-${showId}`;

    const { rows } = await neonQuery(
      `UPDATE shows
       SET title = $1,
           slug = $2,
           description = $3,
           genre = $4,
           cover_image_url = $5,
           primary_presenter_id = $6,
           default_duration_min = $7,
           recurrence_pattern = $8,
           recurrence_days = $9,
           default_start_time = $10,
           is_active = COALESCE($11, is_active),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *;`,
      [
        String(title).trim(),
        slug,
        description ? String(description).trim() : null,
        genre ? String(genre).trim() : "Eclectic",
        cover_image_url ? String(cover_image_url).trim() : null,
        parseInt(String(primary_presenter_id), 10),
        parseInt(String(default_duration_min || 120), 10),
        recurrence_pattern || "weekly",
        Array.isArray(recurrence_days) ? recurrence_days : ["Friday"],
        default_start_time || "20:00:00",
        typeof is_active === "boolean" ? is_active : true,
        showId,
      ]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, show: rows[0] });
  } catch (err: any) {
    if (err.message && err.message.includes("unique")) {
      return NextResponse.json({ error: "Show title/slug already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { id } = await params;
  const showId = parseInt(id, 10);
  if (isNaN(showId)) {
    return NextResponse.json({ error: "Invalid show ID" }, { status: 400 });
  }

  try {
    await neonQuery(
      `UPDATE shows SET is_active = false, updated_at = NOW() WHERE id = $1;`,
      [showId]
    );

    return NextResponse.json({ success: true, message: "Show deactivated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
