import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;
  // Exclude password_hash from response
  const { password_hash, ...safePresenter } = presenter;
  return NextResponse.json({ presenter: safePresenter });
}

export async function PATCH(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;

  try {
    const body = await req.json().catch(() => ({}));
    const { dj_name, bio, avatar_url, social_links } = body;

    const query = `
      UPDATE presenters
      SET dj_name = COALESCE($1, dj_name),
          bio = COALESCE($2, bio),
          avatar_url = COALESCE($3, avatar_url),
          social_links = COALESCE($4, social_links),
          updated_at = NOW()
      WHERE id = $5
      RETURNING id, full_name, dj_name, slug, email, phone, bio, avatar_url, social_links, status, must_change_password;
    `;

    const { rows } = await neonQuery(query, [
      dj_name ? String(dj_name).trim() : null,
      bio !== undefined ? String(bio).trim() : null,
      avatar_url !== undefined ? String(avatar_url).trim() : null,
      social_links ? JSON.stringify(social_links) : null,
      presenter.id,
    ]);

    return NextResponse.json({ success: true, presenter: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update profile" }, { status: 500 });
  }
}
