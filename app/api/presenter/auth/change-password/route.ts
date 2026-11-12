import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";
import {
  comparePresenterPassword,
  hashPresenterPassword,
  signPresenterSession,
  PRESENTER_COOKIE_NAME,
} from "@/lib/presenter-session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { presenter } = authResult;

  try {
    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.current_password || "").trim();
    const newPassword = String(body.new_password || "").trim();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Verify current password
    const isCurrentValid = await comparePresenterPassword(
      currentPassword,
      presenter.password_hash!
    );
    if (!isCurrentValid) {
      return NextResponse.json({ error: "Incorrect current password" }, { status: 401 });
    }

    // Hash new password
    const newHash = await hashPresenterPassword(newPassword);

    // Update database
    await neonQuery(
      `UPDATE presenters
       SET password_hash = $1, must_change_password = false, updated_at = NOW()
       WHERE id = $2;`,
      [newHash, presenter.id]
    );

    // Re-issue cookie with must_change_password = false
    const token = await signPresenterSession({
      id: presenter.id,
      slug: presenter.slug,
      email: presenter.email,
      dj_name: presenter.dj_name,
      must_change_password: false,
    });

    const response = NextResponse.json({
      success: true,
      message: "Password successfully changed",
    });

    response.cookies.set(PRESENTER_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });

    return response;
  } catch (err: any) {
    console.error("[api/presenter/auth/change-password] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to change password" }, { status: 500 });
  }
}
