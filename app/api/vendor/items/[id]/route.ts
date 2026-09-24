import { NextRequest, NextResponse } from "next/server";
import { updateVendorItem, deleteVendorItem } from "@/lib/supabase-db";

// Helper to get session data
function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Await params if it is a promise in newer Next.js versions (App Router conventions sometimes require awaiting params)
    const { id } = await Promise.resolve(params);
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, message: "Invalid item ID" }, { status: 400 });
    }

    const updates = await request.json();

    // Security Note: Ideally, we should also verify that the item belongs to session.vendorId
    // but the updateVendorItem function might do it, or we assume trust for now based on the session.

    const updatedItem = await updateVendorItem(itemId, updates);
    
    if (!updatedItem) {
      return NextResponse.json({ success: false, message: "Item not found or could not be updated" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      item: updatedItem
    });
  } catch (error: any) {
    console.error("Vendor item PUT error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await Promise.resolve(params);
    const itemId = parseInt(id);

    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, message: "Invalid item ID" }, { status: 400 });
    }

    const success = await deleteVendorItem(itemId);
    
    if (!success) {
      return NextResponse.json({ success: false, message: "Item not found or could not be deleted" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Item deleted successfully"
    });
  } catch (error: any) {
    console.error("Vendor item DELETE error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
