import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/me
 * Returns { isAdmin: true } if the httpOnly session cookie is present.
 * Safe to call from client-side JS because the cookie is never exposed —
 * the server reads it and just returns a boolean.
 */
export async function GET(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session");
  const isAdmin = session?.value === "true";
  return NextResponse.json({ isAdmin }, { status: 200 });
}
