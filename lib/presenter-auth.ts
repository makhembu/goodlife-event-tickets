import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { neonQuery } from "@/lib/supabase-db";
import {
  PRESENTER_COOKIE_NAME,
  verifyPresenterSession,
  PresenterSessionPayload,
} from "./presenter-session";
import { Presenter } from "./radio/types";

export interface PresenterAuthResult {
  session: PresenterSessionPayload;
  presenter: Presenter;
}

/**
 * Enforces presenter authentication for server route handlers.
 * Returns either an error NextResponse (401 or 403) or the authenticated presenter data.
 */
export async function requirePresenter(
  req?: NextRequest
): Promise<NextResponse | PresenterAuthResult> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(PRESENTER_COOKIE_NAME)?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(PRESENTER_COOKIE_NAME)?.value;
  }

  if (!token) {
    return NextResponse.json({ error: "Presenter session required" }, { status: 401 });
  }

  const session = await verifyPresenterSession(token);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired presenter session" }, { status: 401 });
  }

  // Fetch presenter from database to verify active status
  try {
    const res = await neonQuery(
      `SELECT id, full_name, dj_name, slug, email, phone, password_hash, must_change_password,
              bio, avatar_url, social_links, status, failed_login_count, locked_until,
              created_at, updated_at
       FROM presenters
       WHERE id = $1 LIMIT 1;`,
      [session.presenterId]
    );

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ error: "Presenter account not found" }, { status: 401 });
    }

    const presenter = res.rows[0] as Presenter;

    if (presenter.status !== "active") {
      return NextResponse.json(
        { error: `Presenter account is ${presenter.status}` },
        { status: 403 }
      );
    }

    return { session, presenter };
  } catch (err: any) {
    console.error("[requirePresenter] DB error:", err);
    return NextResponse.json({ error: "Authentication service error" }, { status: 500 });
  }
}
