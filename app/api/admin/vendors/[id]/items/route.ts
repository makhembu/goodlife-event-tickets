import { NextRequest, NextResponse } from "next/server";
import { 
  fetchVendorItems, 
  createVendorItem, 
  updateVendorItem, 
  deleteVendorItem, 
  adjustStock,
  neonQuery 
} from "@/lib/supabase-db";

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

  const { searchParams } = new URL(request.url);
  const eventParam = searchParams.get("eventId");
  const eventId = eventParam && eventParam !== "all" && eventParam !== "" ? parseInt(eventParam, 10) : null;

  try {
    const { rows } = await neonQuery(
      `SELECT id, event_id, name, category, price, stock_qty, low_stock_threshold, is_available, image_url, sort_order, created_at
       FROM vendor_items
       WHERE vendor_id = $1 AND deleted_at IS NULL
         AND ($2::int IS NULL OR event_id = $2)
       ORDER BY is_available DESC, category ASC, name ASC`,
      [vendorId, eventId]
    );

    return NextResponse.json({ success: true, items: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(
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
    const body = await request.json();
    const { 
      name, 
      category = "General", 
      price, 
      stock_qty = 50, 
      low_stock_threshold = 5, 
      is_available = true, 
      event_id = 2,
      image_url = "" 
    } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: "Item name and price are required" }, { status: 400 });
    }

    const { rows } = await neonQuery(
      `INSERT INTO vendor_items (vendor_id, event_id, name, category, price, stock_qty, low_stock_threshold, is_available, image_url, modifiers, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '[]'::json, 0)
       RETURNING *`,
      [
        vendorId,
        Number(event_id) || 2,
        name.trim(),
        category.trim() || "General",
        parseFloat(price),
        stock_qty !== null && stock_qty !== "" ? parseInt(stock_qty, 10) : null,
        parseInt(low_stock_threshold, 10) || 5,
        is_available,
        image_url || ""
      ]
    );

    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err: any) {
    console.error("Admin create vendor item error:", err);
    return NextResponse.json({ error: err.message || "Failed to create item" }, { status: 500 });
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
    const body = await request.json();
    const { itemId, stockAdjustment, ...updates } = body;

    if (!itemId) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    // 1. Stock delta adjustment (e.g. +12 or -1)
    if (stockAdjustment !== undefined && stockAdjustment !== null) {
      const delta = parseInt(stockAdjustment, 10);
      if (!isNaN(delta) && delta !== 0) {
        const { rows } = await neonQuery(
          `UPDATE vendor_items 
           SET stock_qty = GREATEST(0, COALESCE(stock_qty, 0) + $1)
           WHERE id = $2 AND vendor_id = $3
           RETURNING *`,
          [delta, itemId, vendorId]
        );
        if (rows.length === 0) {
          return NextResponse.json({ error: "Item not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true, item: rows[0] });
      }
    }

    // 2. Direct field updates
    const allowedFields = ["name", "category", "price", "stock_qty", "low_stock_threshold", "is_available", "image_url"];
    const setClauses: string[] = [];
    const values: any[] = [itemId, vendorId];
    let paramIndex = 3;

    for (const [key, val] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`"${key}" = $${paramIndex}`);
        if (key === "price") values.push(parseFloat(val as string));
        else if (key === "stock_qty") values.push(val !== null && val !== "" ? parseInt(val as string, 10) : null);
        else if (key === "low_stock_threshold") values.push(parseInt(val as string, 10) || 5);
        else values.push(val);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No valid update fields provided" }, { status: 400 });
    }

    const query = `
      UPDATE vendor_items
      SET ${setClauses.join(", ")}
      WHERE id = $1 AND vendor_id = $2
      RETURNING *
    `;

    const { rows } = await neonQuery(query, values);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err: any) {
    console.error("Admin update vendor item error:", err);
    return NextResponse.json({ error: err.message || "Failed to update item" }, { status: 500 });
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
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    if (!itemId) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const { rowCount } = await neonQuery(
      `UPDATE vendor_items SET deleted_at = NOW() WHERE id = $1 AND vendor_id = $2`,
      [parseInt(itemId, 10), vendorId]
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Item deleted successfully" });
  } catch (err: any) {
    console.error("Admin delete vendor item error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete item" }, { status: 500 });
  }
}
