import { NextRequest, NextResponse } from "next/server";
import { fetchVendorCategories, renameVendorCategory, deleteVendorCategory } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
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

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !session.vendorId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const categories = await fetchVendorCategories(Number(session.vendorId));
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error("Vendor categories GET error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !session.vendorId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { oldCategory, newCategory } = body || {};

    if (!oldCategory || !newCategory || typeof oldCategory !== "string" || typeof newCategory !== "string") {
      return NextResponse.json(
        { success: false, message: "Both oldCategory and newCategory strings are required" },
        { status: 400 }
      );
    }

    const updatedCount = await renameVendorCategory(
      Number(session.vendorId),
      oldCategory.trim(),
      newCategory.trim()
    );

    return NextResponse.json({ success: true, count: updatedCount });
  } catch (error: any) {
    console.error("Vendor categories PATCH error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !session.vendorId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { category, reassignTo } = body || {};

    if (!category || typeof category !== "string") {
      return NextResponse.json({ success: false, message: "Category name required" }, { status: 400 });
    }

    const reassignedCount = await deleteVendorCategory(
      Number(session.vendorId),
      category.trim(),
      typeof reassignTo === "string" ? reassignTo.trim() : "General"
    );

    return NextResponse.json({ success: true, count: reassignedCount });
  } catch (error: any) {
    console.error("Vendor categories DELETE error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
