import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

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
    const { rows } = await neonQuery(
      `SELECT id, vendor_id, name, pin, role, is_active, created_at 
       FROM vendor_operators 
       WHERE vendor_id = $1 
       ORDER BY name ASC`,
      [vendorId]
    );

    return NextResponse.json({ success: true, operators: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch operators" }, { status: 500 });
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
    const { name, pin, role = "cashier" } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Operator name is required" }, { status: 400 });
    }

    const cleanPin = (pin && String(pin).trim()) || String(1000 + Math.floor(Math.random() * 9000));
    if (!/^\d{4}$/.test(cleanPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    }

    const { rows } = await neonQuery(
      `INSERT INTO vendor_operators (vendor_id, name, pin, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [vendorId, name.trim(), cleanPin, role || "cashier"]
    );

    return NextResponse.json({ success: true, operator: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create operator" }, { status: 500 });
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
    const { operatorId, name, pin, role, is_active } = body;

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const setClauses: string[] = [];
    const values: any[] = [operatorId, vendorId];
    let paramIndex = 3;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin).trim())) {
        return NextResponse.json({ error: "PIN must be 4 digits" }, { status: 400 });
      }
      setClauses.push(`pin = $${paramIndex++}`);
      values.push(String(pin).trim());
    }
    if (role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      values.push(Boolean(is_active));
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { rows } = await neonQuery(
      `UPDATE vendor_operators
       SET ${setClauses.join(", ")}
       WHERE id = $1 AND vendor_id = $2
       RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Operator not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, operator: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update operator" }, { status: 500 });
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

  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get("operatorId");
  if (!operatorId) {
    return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
  }

  try {
    await neonQuery(
      `DELETE FROM vendor_operators WHERE id = $1 AND vendor_id = $2`,
      [parseInt(operatorId, 10), vendorId]
    );

    return NextResponse.json({ success: true, message: "Operator deleted successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete operator" }, { status: 500 });
  }
}
