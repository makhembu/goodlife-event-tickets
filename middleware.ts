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
  const secret = process.env.SCANNER_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_scanner_secret_salt";
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.role === "scanner");
}

async function isValidVendorSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.vendorId);
}

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  const vendorSession = request.cookies.get("goodlife_vendor_session")?.value;
  const scannerSession = request.cookies.get("goodlife_scanner_session")?.value;
  const pathname = request.nextUrl.pathname;

  // Protect admin page routes
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/scanner" && (await isValidScannerSession(scannerSession))) {
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
    const isScannerValid = await isValidScannerSession(scannerSession);
    if (pathname === "/scanner/login") {
      if (isScannerValid || session === "true") {
        const url = request.nextUrl.clone();
        url.pathname = "/scanner";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isScannerValid && session !== "true") {
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

    if (!isPublicScannerRoute && !(await isValidScannerSession(scannerSession)) && session !== "true") {
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
      if (session !== "true" && !(await isValidScannerSession(scannerSession))) {
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
    const isVendorValid = await isValidVendorSession(vendorSession);
    if (pathname === "/vendor/login") {
      if (isVendorValid) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/sell";
        return NextResponse.redirect(url);
      }
    } else {
      if (!isVendorValid) {
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

    if (!isPublicRoute && !(await isValidVendorSession(vendorSession))) {
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
