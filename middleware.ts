import { type NextRequest, NextResponse } from "next/server";

function base64UrlToBytes(base64Url: string): Uint8Array | null {
  try {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodePayload(payloadB64Url: string): any {
  const bytes = base64UrlToBytes(payloadB64Url);
  if (!bytes) return null;
  try {
    const jsonStr = new TextDecoder().decode(bytes);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function verifyHmacSha256(data: string, signatureB64Url: string, secret: string): Promise<boolean> {
  try {
    const sigBytes = base64UrlToBytes(signatureB64Url);
    if (!sigBytes) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(data) as unknown as BufferSource
    );
  } catch {
    return false;
  }
}

async function isValidScannerSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.SCANNER_SESSION_SECRET?.trim() || process.env.TAB_SELF_PAY_SECRET?.trim() || process.env.PAYHERO_CALLBACK_TOKEN?.trim();
  if (!secret) return false; // Fail closed: strictly no hardcoded fallback salt
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.role === "scanner");
}

async function isValidVendorSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.VENDOR_SESSION_SECRET?.trim() || process.env.TAB_SELF_PAY_SECRET?.trim() || process.env.PAYHERO_CALLBACK_TOKEN?.trim();
  if (!secret) return false; // Fail closed: strictly no hardcoded fallback salt
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.vendorId);
}

interface AdminSessionInfo {
  isValid: boolean;
  adminRole: "superadmin" | "station_manager" | "ticketing_admin";
}

async function getAdminSessionInfo(cookieValue: string | undefined): Promise<AdminSessionInfo | null> {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return null;
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) return null; // Fail closed: strictly no hardcoded fallback salt
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return null;
  const parsed = decodePayload(payloadB64);
  if (!parsed || parsed.role !== "admin") return null;
  if (typeof parsed.exp === "number" && Math.floor(Date.now() / 1000) > parsed.exp) {
    return null;
  }
  return {
    isValid: true,
    adminRole: parsed.adminRole || "superadmin",
  };
}

async function isValidPresenterSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.PRESENTER_SESSION_SECRET?.trim();
  if (!secret) return false; // Fail closed: strictly no hardcoded fallback
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  if (!parsed || parsed.role !== "presenter" || !parsed.presenterId) return false;
  if (typeof parsed.exp === "number" && Math.floor(Date.now() / 1000) > parsed.exp) {
    return false;
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  const vendorSession = request.cookies.get("goodlife_vendor_session")?.value;
  const scannerSession = request.cookies.get("goodlife_scanner_session")?.value;
  const presenterSession = request.cookies.get("goodlife_presenter_session")?.value;
  const pathname = request.nextUrl.pathname;

  const adminInfo = await getAdminSessionInfo(session);
  const isAdmin = Boolean(adminInfo?.isValid);
  const adminRole = adminInfo?.adminRole || "superadmin";
  const isPresenter = await isValidPresenterSession(presenterSession);

  // Presenter portal page protection
  if (pathname.startsWith("/presenter")) {
    if (pathname === "/presenter/login") {
      if (isPresenter) {
        const url = request.nextUrl.clone();
        url.pathname = "/presenter/dashboard";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }
    // All other /presenter/* pages require presenter authentication
    // Admin cookies are strictly not treated as presenter
    if (!isPresenter) {
      const url = request.nextUrl.clone();
      url.pathname = "/presenter/login";
      return NextResponse.redirect(url);
    }
  }

  // Presenter API protection
  if (pathname.startsWith("/api/presenter")) {
    const isPublicPresenterApi = pathname === "/api/presenter/auth/login";
    if (!isPublicPresenterApi && !isPresenter) {
      return NextResponse.json({ error: "Presenter session required" }, { status: 401 });
    }
  }

  // Protect admin page routes & enforce RBAC
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/scanner" && (await isValidScannerSession(scannerSession))) {
      const url = request.nextUrl.clone();
      url.pathname = "/scanner";
      return NextResponse.redirect(url);
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Role-based route gating:
    // station_manager can ONLY access /admin/radio/* (blocked from dashboard tickets, vendors, settlements, budget)
    if (adminRole === "station_manager") {
      if (!pathname.startsWith("/admin/radio")) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/radio";
        return NextResponse.redirect(url);
      }
    }

    // ticketing_admin CANNOT touch /admin/radio/*
    if (adminRole === "ticketing_admin") {
      if (pathname.startsWith("/admin/radio")) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/dashboard";
        return NextResponse.redirect(url);
      }
    }
  }

  // Scanner page routes
  if (pathname.startsWith("/scanner") || pathname === "/scanner") {
    const isScannerValid = await isValidScannerSession(scannerSession);
    if (pathname === "/scanner/login") {
      if (isScannerValid || isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/scanner";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isScannerValid && !isAdmin) {
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

    if (!isPublicScannerRoute && !(await isValidScannerSession(scannerSession)) && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Allow /api/admin/me without auth
  if (pathname === "/api/admin/me") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/event-details") && request.method === "PUT") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (pathname.startsWith("/api/admin/") || pathname === "/api/admin") {
    // Allow login, logout, and me endpoints without auth
    const publicAdminRoutes = ["/api/admin/login", "/api/admin/logout", "/api/admin/me"];
    
    // Gate scanners can call ticket scan verification API
    if (pathname.startsWith("/api/admin/scan/") && (await isValidScannerSession(scannerSession))) {
      return NextResponse.next();
    }

    if (publicAdminRoutes.includes(pathname)) {
      return NextResponse.next();
    }

    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role-based API route gating
    if (adminRole === "station_manager") {
      // station_manager can ONLY access /api/admin/radio/*
      if (!pathname.startsWith("/api/admin/radio")) {
        return NextResponse.json({ error: "Forbidden: Station managers cannot access ticketing or finance APIs" }, { status: 403 });
      }
    }

    if (adminRole === "ticketing_admin") {
      // ticketing_admin CANNOT touch /api/admin/radio/*
      if (pathname.startsWith("/api/admin/radio")) {
        return NextResponse.json({ error: "Forbidden: Ticketing admins cannot access radio management APIs" }, { status: 403 });
      }
    }
  }

  // Vendor routes
  if (pathname.startsWith("/vendor")) {
    const isVendorValid = await isValidVendorSession(vendorSession);
    if (pathname === "/vendor/login") {
      if (isVendorValid || isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/sell";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isVendorValid && !isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/login";
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/scanner/:path*",
    "/vendor/:path*",
    "/presenter/:path*",
    "/api/admin/:path*",
    "/api/scanner/:path*",
    "/api/presenter/:path*",
    "/api/event-details",
  ],
};
