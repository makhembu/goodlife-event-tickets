import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import {
  signPresenterSession,
  PRESENTER_COOKIE_NAME,
} from "@/lib/presenter-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate admin session
    const authErr = await requireAdmin(request);
    if (authErr) return authErr;

    // 2. Parse presenter ID
    const { id } = await context.params;
    const presenterId = parseInt(id, 10);
    if (isNaN(presenterId)) {
      return NextResponse.json({ success: false, error: "Invalid presenter ID" }, { status: 400 });
    }

    // 3. Fetch presenter
    const res = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, status, must_change_password
       FROM presenters
       WHERE id = $1
       LIMIT 1;`,
      [presenterId]
    );

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Presenter not found" }, { status: 404 });
    }

    const presenter = res.rows[0];

    // 4. Sign presenter session token with admin takeover flag
    const token = await signPresenterSession({
      id: presenter.id,
      slug: presenter.slug,
      email: presenter.email,
      dj_name: presenter.dj_name,
      must_change_password: false, // In admin takeover mode, don't force password change
      isAdminTakeover: true,
    });

    const response = NextResponse.json({
      success: true,
      message: `Switched session to presenter ${presenter.dj_name || presenter.full_name}`,
      presenter: {
        id: presenter.id,
        slug: presenter.slug,
        dj_name: presenter.dj_name,
        email: presenter.email,
      },
      redirectUrl: "/presenter/dashboard",
    });

    const isSecure = process.env.NODE_ENV === "production";
    response.cookies.set(PRESENTER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error("[Admin Presenter Takeover Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to switch presenter session" },
      { status: 500 }
    );
  }
}
