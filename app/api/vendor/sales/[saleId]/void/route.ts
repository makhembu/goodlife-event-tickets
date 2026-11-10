import { NextRequest, NextResponse } from "next/server";
import { fetchSaleById, voidSale } from "@/lib/supabase-db";
import { verifyAdminSession } from "@/lib/admin-session";

function getVendorSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try {
      return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return JSON.parse(atob(raw));
    }
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  const vendorSession = getVendorSession(request);
  const isAdmin = await verifyAdminSession(request.cookies.get("goodlife_admin_session")?.value);

  if (!vendorSession && !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { saleId } = await context.params;
  if (!saleId) {
    return NextResponse.json({ success: false, error: "Missing sale ID" }, { status: 400 });
  }

  try {
    const sale = await fetchSaleById(saleId);
    if (!sale) {
      return NextResponse.json({ success: false, error: "Sale not found" }, { status: 404 });
    }

    if (sale.payment_status === "voided") {
      return NextResponse.json({ success: false, error: "Sale is already voided" }, { status: 409 });
    }

    // If not admin, ensure the sale belongs to the current vendor
    if (!isAdmin && vendorSession && sale.vendor_id !== vendorSession.vendorId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Sale belongs to another vendor" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim().slice(0, 500) || "Sale deleted by vendor";
    const operatorId = vendorSession?.operatorId || null;

    const voided = await voidSale(saleId, operatorId, reason);
    if (!voided) {
      return NextResponse.json({ success: false, error: "Could not void sale" }, { status: 500 });
    }

    return NextResponse.json({ success: true, saleId, reason });
  } catch (err: any) {
    console.error("Vendor void sale error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to void sale" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  return POST(request, context);
}
