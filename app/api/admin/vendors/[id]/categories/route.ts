import { NextRequest, NextResponse } from "next/server";
import { fetchVendorCategories, renameVendorCategory, deleteVendorCategory } from "@/lib/supabase-db";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const categories = await fetchVendorCategories(vendorId);
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error("Admin vendor categories GET error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { oldCategory, newCategory } = body || {};

    if (!oldCategory || !newCategory || typeof oldCategory !== "string" || typeof newCategory !== "string") {
      return NextResponse.json(
        { error: "Both oldCategory and newCategory strings are required" },
        { status: 400 }
      );
    }

    const updatedCount = await renameVendorCategory(vendorId, oldCategory.trim(), newCategory.trim());
    return NextResponse.json({ success: true, count: updatedCount });
  } catch (error: any) {
    console.error("Admin vendor categories PATCH error:", error);
    return NextResponse.json({ error: "Failed to rename category" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { category, reassignTo } = body || {};

    if (!category || typeof category !== "string") {
      return NextResponse.json({ error: "Category name required" }, { status: 400 });
    }

    const count = await deleteVendorCategory(
      vendorId,
      category.trim(),
      typeof reassignTo === "string" ? reassignTo.trim() : "General"
    );

    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    console.error("Admin vendor categories DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
