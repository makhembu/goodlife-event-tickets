import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/radio/applications
 * Lists presenter recruitment applications for admin review.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const res = await neonQuery(
      `SELECT id, full_name, dj_name, email, phone, bio, show_concept, genre,
              sample_mix_url, social_links, client_ip, status, admin_notes,
              created_at, updated_at
       FROM presenter_applications
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC;`
    );

    return NextResponse.json({
      ok: true,
      count: res.rows.length,
      applications: res.rows,
    });
  } catch (err: any) {
    console.error("[admin presenter apps] Query error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load presenter applications" },
      { status: 500 }
    );
  }
}
