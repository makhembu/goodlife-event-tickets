import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { hashPresenterPassword } from "@/lib/presenter-session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const res = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, phone, bio, avatar_url,
              social_links, status, must_change_password, failed_login_count,
              locked_until, created_at, updated_at
       FROM presenters
       ORDER BY id ASC;`
    );
    return NextResponse.json({ presenters: res.rows || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { full_name, dj_name, email, phone, bio, avatar_url } = body;

    if (!full_name || !dj_name || !email) {
      return NextResponse.json(
        { error: "Full name, DJ name, and email are required" },
        { status: 400 }
      );
    }

    // Generate slug from DJ name
    let slug = dj_name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) slug = `dj-${Date.now().toString().slice(-4)}`;

    // Generate temporary password shown once
    const temporaryPassword = `GL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const passwordHash = await hashPresenterPassword(temporaryPassword);

    const query = `
      INSERT INTO presenters (
        full_name, dj_name, slug, email, phone, password_hash, must_change_password,
        bio, avatar_url, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, 'active', NOW(), NOW())
      RETURNING id, full_name, dj_name, slug, email, phone, bio, avatar_url, status, must_change_password, created_at;
    `;

    const { rows } = await neonQuery(query, [
      String(full_name).trim(),
      String(dj_name).trim(),
      slug,
      String(email).trim().toLowerCase(),
      phone ? String(phone).trim() : null,
      passwordHash,
      bio ? String(bio).trim() : null,
      avatar_url ? String(avatar_url).trim() : null,
    ]);

    return NextResponse.json({
      success: true,
      presenter: rows[0],
      temporary_password: temporaryPassword, // Handled show-once in admin UI
    });
  } catch (err: any) {
    console.error("[api/admin/radio/presenters] Create error:", err);
    if (err.message && err.message.includes("unique")) {
      return NextResponse.json({ error: "Email or DJ slug already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
