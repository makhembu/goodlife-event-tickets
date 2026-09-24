import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  const vendorSession = request.cookies.get("goodlife_vendor_session")?.value;
  const pathname = request.nextUrl.pathname;

  // Protect admin page routes
  if (pathname.startsWith("/admin")) {
    if (session !== "true") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // Allow /api/admin/me without auth
  if (pathname === "/api/admin/me") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/event-details") && request.method === "PUT") {
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (pathname.startsWith("/api/admin/") || pathname === "/api/admin") {
    // Allow login, logout, and me endpoints without auth
    const publicAdminRoutes = ["/api/admin/login", "/api/admin/logout", "/api/admin/me"];
    if (!publicAdminRoutes.includes(pathname) && session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect ticket-tiers mutations
  if (pathname.startsWith("/api/ticket-tiers") && request.method !== "GET") {
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect events routes (except public GET on /api/events/active)
  if (pathname.startsWith("/api/events")) {
    // Allow public access to active event
    if (pathname === "/api/events/active" && request.method === "GET") {
      return NextResponse.next();
    }
    // Protect all other event routes
    if (session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect vendor page routes
  if (pathname.startsWith("/vendor/") || pathname === "/vendor") {
    if (pathname === "/vendor/login") {
      if (vendorSession === "true") {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/sell";
        return NextResponse.redirect(url);
      }
    } else {
      if (vendorSession !== "true") {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/login";
        return NextResponse.redirect(url);
      }
    }
  }

  // Protect vendor API routes
  if (pathname.startsWith("/api/vendor/") || pathname === "/api/vendor") {
    const publicVendorRoutes = ["/api/vendor/auth", "/api/vendor/logout"];
    if (!publicVendorRoutes.includes(pathname) && vendorSession !== "true") {
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
    "/vendor/:path*",
    "/api/admin/:path*",
    "/api/vendor/:path*",
    "/api/event-details",
    "/api/ticket-tiers/:path*",
    "/api/events/:path*",
  ],
};
