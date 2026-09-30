import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

function isValidScannerSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.SCANNER_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_scanner_secret_salt";
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expectedSig.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return Boolean(parsed && parsed.role === "scanner");
  } catch {
    return false;
  }
}

function isValidVendorSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expectedSig.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return Boolean(parsed && parsed.vendorId);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  const vendorSession = request.cookies.get("goodlife_vendor_session")?.value;
  const scannerSession = request.cookies.get("goodlife_scanner_session")?.value;
  const pathname = request.nextUrl.pathname;

  // Protect admin page routes
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/scanner" && isValidScannerSession(scannerSession)) {
      const url = request.nextUrl.clone();
      url.pathname = "/scanner";
      return NextResponse.redirect(url);
    }
    if (session !== "true") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // Scanner page routes
  if (pathname.startsWith("/scanner") || pathname === "/scanner") {
    if (pathname === "/scanner/login") {
      if (isValidScannerSession(scannerSession) || session === "true") {
        const url = request.nextUrl.clone();
        url.pathname = "/scanner";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isValidScannerSession(scannerSession) && session !== "true") {
        const url = request.nextUrl.clone();
        url.pathname = "/scanner/login";
        return NextResponse.redirect(url);
      }
    }
  }

  // Scanner API routes
  if (pathname.startsWith("/api/scanner/") || pathname === "/api/scanner") {
    const isPublicScannerRoute =
      pathname === "/api/scanner/auth" ||
      pathname === "/api/scanner/logout" ||
      pathname === "/api/scanner/session";

    if (!isPublicScannerRoute && !isValidScannerSession(scannerSession) && session !== "true") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    
    // Gate scanners can call ticket scan verification API
    if (pathname.startsWith("/api/admin/scan")) {
      if (session !== "true" && !isValidScannerSession(scannerSession)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (!publicAdminRoutes.includes(pathname) && session !== "true") {
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
      if (isValidVendorSession(vendorSession)) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/sell";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isValidVendorSession(vendorSession)) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/login";
        return NextResponse.redirect(url);
      }
    }
  }

  // Protect vendor API routes
  if (pathname.startsWith("/api/vendor/") || pathname === "/api/vendor") {
    const isPublicRoute =
      pathname === "/api/vendor/auth" ||
      pathname === "/api/vendor/logout" ||
      pathname === "/api/vendor/mpesa/status"; // read-only; TABPAY_ refs only (see route)

    if (!isPublicRoute && !isValidVendorSession(vendorSession)) {
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
    "/scanner/:path*",
    "/scanner",
    "/login",
    "/vendor/:path*",
    "/api/admin/:path*",
    "/api/scanner/:path*",
    "/api/vendor/:path*",
    "/api/event-details",
    "/api/ticket-tiers/:path*",
    "/api/events/:path*",
  ],
};
