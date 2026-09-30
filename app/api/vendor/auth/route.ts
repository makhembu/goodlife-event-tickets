import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { authenticateOperator } from "@/lib/supabase-db";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "vendor-login", { maxRequests: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }
    
    const { pin } = body || {};

    if (!pin || typeof pin !== "string" || pin.length !== 4) {
      return NextResponse.json({ success: false, message: "Invalid PIN format" }, { status: 400 });
    }

    const authResult = await authenticateOperator(pin);

    if (authResult) {
      const response = NextResponse.json({ 
        success: true, 
        message: "Authenticated successfully",
        vendor: authResult.vendor,
        operator: authResult.operator
      });
      
      const sessionData = {
        vendorId: authResult.vendor.id,
        vendorName: authResult.vendor.name,
        operatorId: authResult.operator.id,
        operatorName: authResult.operator.name,
        role: authResult.operator.role
      };

      const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
      const payloadB64 = Buffer.from(JSON.stringify(sessionData)).toString("base64url");
      const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
      const signedToken = `${payloadB64}.${sig}`;

      // Set session cookie
      response.cookies.set("goodlife_vendor_session", signedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 12 // 12 hours
      });

      return response;
    }

    return NextResponse.json(
      { success: false, message: "Invalid PIN" },
      { status: 401 }
    );
  } catch (error: any) {
    console.error("Vendor auth error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
