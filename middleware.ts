import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  const pathname = request.nextUrl.pathname;

  // Protect admin page routes
  if (pathname.startsWith("/admin")) {
    if (session !== "true") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // Protect admin API routes — return 401 JSON instead of redirect
  // (skip login endpoint — that's where auth happens)
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/event-details") && request.method === "PUT") {
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (pathname.startsWith("/api/admin/")) {
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect ticket-tiers mutations
  if (pathname.startsWith("/api/ticket-tiers") && request.method !== "GET") {
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Redirect to dashboard if logged in and trying to access login page
  if (pathname === "/login") {
    if (session === "true") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/api/admin/:path*",
    "/api/event-details",
    "/api/ticket-tiers/:path*",
  ],
};
