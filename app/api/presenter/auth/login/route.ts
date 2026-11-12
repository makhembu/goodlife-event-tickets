import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import {
  comparePresenterPassword,
  signPresenterSession,
  PRESENTER_COOKIE_NAME,
} from "@/lib/presenter-session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Fetch presenter by email
    const res = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, password_hash, must_change_password,
              status, failed_login_count, locked_until
       FROM presenters
       WHERE LOWER(email) = $1
       LIMIT 1;`,
      [email]
    );

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const presenter = res.rows[0];

    // 2. Check status
    if (presenter.status === "suspended") {
      return NextResponse.json(
        { error: "Account suspended. Please contact the station manager." },
        { status: 403 }
      );
    }

    // 3. Check account lockout (15 minutes after 5 failed attempts)
    if (presenter.locked_until) {
      const lockedUntil = new Date(presenter.locked_until).getTime();
      const now = Date.now();
      if (now < lockedUntil) {
        const remainingMinutes = Math.ceil((lockedUntil - now) / 60000);
        return NextResponse.json(
          { error: `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).` },
          { status: 423 }
        );
      }
    }

    // 4. Verify password
    const isPasswordValid = await comparePresenterPassword(password, presenter.password_hash);
    if (!isPasswordValid) {
      const newFailedCount = (presenter.failed_login_count || 0) + 1;
      let lockQuery = `UPDATE presenters SET failed_login_count = $1`;
      const params: any[] = [newFailedCount, presenter.id];

      if (newFailedCount >= 5) {
        lockQuery += `, locked_until = NOW() + INTERVAL '15 minutes'`;
      }
      lockQuery += ` WHERE id = $2;`;

      await neonQuery(lockQuery, params);

      if (newFailedCount >= 5) {
        return NextResponse.json(
          { error: "Account locked for 15 minutes due to 5 consecutive failed login attempts." },
          { status: 423 }
        );
      }

      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 5. Successful login: reset failed counter
    await neonQuery(
      `UPDATE presenters 
       SET failed_login_count = 0, locked_until = NULL, updated_at = NOW() 
       WHERE id = $1;`,
      [presenter.id]
    );

    // 6. Sign session token
    const token = await signPresenterSession({
      id: presenter.id,
      slug: presenter.slug,
      email: presenter.email,
      dj_name: presenter.dj_name,
      must_change_password: presenter.must_change_password,
    });

    const response = NextResponse.json({
      success: true,
      must_change_password: presenter.must_change_password,
      presenter: {
        id: presenter.id,
        slug: presenter.slug,
        dj_name: presenter.dj_name,
        email: presenter.email,
      },
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
  } catch (err: any) {
    console.error("[api/presenter/auth/login] Error:", err);
    return NextResponse.json(
      { error: err.message || "Authentication failed" },
      { status: 500 }
    );
  }
}
