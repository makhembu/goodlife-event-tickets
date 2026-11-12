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
  const presenterId = parseInt(id, 10);
  if (isNaN(presenterId)) {
    return NextResponse.json({ error: "Invalid presenter ID" }, { status: 400 });
  }

  try {
    const { rows } = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, phone, bio, avatar_url,
              social_links, status, stream_key_prefix, must_change_password,
              created_at, updated_at
       FROM presenters
       WHERE id = $1;`,
      [presenterId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Presenter not found" }, { status: 404 });
    }

    return NextResponse.json({ presenter: rows[0] });
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
  const presenterId = parseInt(id, 10);
  if (isNaN(presenterId)) {
    return NextResponse.json({ error: "Invalid presenter ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { full_name, dj_name, email, phone, bio, avatar_url, status } = body;

    if (!full_name || !dj_name || !email) {
      return NextResponse.json(
        { error: "Full name, DJ name, and email are required" },
        { status: 400 }
      );
    }

    let slug = dj_name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) slug = `dj-${presenterId}`;

    const { rows } = await neonQuery(
      `UPDATE presenters
       SET full_name = $1,
           dj_name = $2,
           slug = $3,
           email = $4,
           phone = $5,
           bio = $6,
           avatar_url = $7,
           status = COALESCE($8, status),
           updated_at = NOW()
       WHERE id = $9
       RETURNING id, full_name, dj_name, slug, email, phone, bio, avatar_url, status, stream_key_prefix, updated_at;`,
      [
        String(full_name).trim(),
        String(dj_name).trim(),
        slug,
        String(email).trim().toLowerCase(),
        phone ? String(phone).trim() : null,
        bio ? String(bio).trim() : null,
        avatar_url ? String(avatar_url).trim() : null,
        status || "active",
        presenterId,
      ]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Presenter not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, presenter: rows[0] });
  } catch (err: any) {
    if (err.message && err.message.includes("unique")) {
      return NextResponse.json({ error: "Email or DJ slug already in use" }, { status: 409 });
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
  const presenterId = parseInt(id, 10);
  if (isNaN(presenterId)) {
    return NextResponse.json({ error: "Invalid presenter ID" }, { status: 400 });
  }

  try {
    // Soft delete: suspend presenter and revoke keys
    await neonQuery(
      `UPDATE presenters
       SET status = 'suspended',
           stream_key_hash = NULL,
           stream_key_prefix = NULL,
           updated_at = NOW()
       WHERE id = $1;`,
      [presenterId]
    );

    return NextResponse.json({ success: true, message: "Presenter suspended" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
