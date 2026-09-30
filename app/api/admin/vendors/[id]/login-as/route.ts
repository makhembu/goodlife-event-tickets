import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getVendorById, fetchOperatorsForVendor, createOperator, neonQuery } from "@/lib/supabase-db";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate admin session
    const adminSession = request.cookies.get("goodlife_admin_session")?.value;
    if (adminSession !== "true") {
      return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
    }

    // 2. Parse vendor ID
    const { id } = await context.params;
    const vendorId = parseInt(id, 10);
    if (isNaN(vendorId)) {
      return NextResponse.json({ success: false, error: "Invalid vendor ID" }, { status: 400 });
    }

    // 3. Fetch vendor
    const vendor = await getVendorById(vendorId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
    }

    // 4. Find or create an operator for takeover
    const operators = await fetchOperatorsForVendor(vendorId);
    let operator = operators.find((o: any) => o.role === "manager") || operators[0];

    if (!operator) {
      // Find a collision-free PIN for the new operator
      let uniquePin = "";
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = Math.floor(1000 + Math.random() * 9000).toString();
        const existing = await neonQuery(
          "SELECT id FROM vendor_operators WHERE pin = $1 AND is_active = TRUE LIMIT 1",
          [candidate]
        );
        if (existing.rows.length === 0) {
          uniquePin = candidate;
          break;
        }
      }
      if (!uniquePin) {
        uniquePin = String(Math.floor(1000 + Math.random() * 9000));
      }

      operator = await createOperator({
        vendor_id: vendorId,
        name: "Admin Takeover",
        pin: uniquePin,
        role: "manager"
      });
    }

    // 5. Construct session payload
    const sessionData = {
      vendorId: vendor.id,
      vendorName: vendor.name,
      operatorId: operator.id,
      operatorName: operator.name.toLowerCase().includes("admin") ? operator.name : `${operator.name} [Admin]`,
      role: "manager",
      isAdminTakeover: true
    };

    // 6. Set response and cookie
    const response = NextResponse.json({
      success: true,
      message: `Switched session to ${vendor.name}`,
      vendor: {
        id: vendor.id,
        name: vendor.name
      },
      operator: {
        id: operator.id,
        name: sessionData.operatorName
      },
      redirectUrl: "/vendor/sell"
    });

    const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
    const payloadB64 = Buffer.from(JSON.stringify(sessionData)).toString("base64url");
    const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
    const signedToken = `${payloadB64}.${sig}`;

    response.cookies.set("goodlife_vendor_session", signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12 // 12 hours
    });

    return response;
  } catch (error: any) {
    console.error("Admin vendor takeover error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to switch vendor session" },
      { status: 500 }
    );
  }
}
