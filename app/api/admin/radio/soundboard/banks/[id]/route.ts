// app/api/admin/radio/soundboard/banks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const bankId = parseInt(id, 10);
  if (isNaN(bankId)) {
    return NextResponse.json({ error: "Invalid bank ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, position } = body;

    const existing = await neonQuery(
      `SELECT id, name, position FROM soundboard_banks WHERE id = $1`,
      [bankId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const current = existing.rows[0];
    const newName = name !== undefined ? String(name).trim().slice(0, 100) : current.name;
    const newPos = position !== undefined ? Number(position) : current.position;

    if (!newName) {
      return NextResponse.json({ error: "Bank name cannot be empty" }, { status: 400 });
    }

    const updateRes = await neonQuery(
      `UPDATE soundboard_banks
       SET name = $1, position = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, position, created_at, updated_at`,
      [newName, newPos, bankId]
    );

    return NextResponse.json({ bank: updateRes.rows[0] }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/banks/[id]] PATCH error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const bankId = parseInt(id, 10);
  if (isNaN(bankId)) {
    return NextResponse.json({ error: "Invalid bank ID" }, { status: 400 });
  }

  try {
    // 1. Guard against deleting the last remaining bank
    const countRes = await neonQuery(`SELECT COUNT(*)::int AS count FROM soundboard_banks`);
    const totalBanks = countRes.rows[0]?.count ?? 0;

    if (totalBanks <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining bank on the soundboard." },
        { status: 400 }
      );
    }

    // 2. Check existence
    const existing = await neonQuery(
      `SELECT id, name FROM soundboard_banks WHERE id = $1`,
      [bankId]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    // 3. Delete bank (Postgres CASCADE deletes pads from soundboard_pads without touching radio_drops)
    await neonQuery(`DELETE FROM soundboard_banks WHERE id = $1`, [bankId]);

    // 4. Compact remaining bank positions
    await neonQuery(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, id ASC) - 1 AS new_pos
        FROM soundboard_banks
      )
      UPDATE soundboard_banks b
      SET position = r.new_pos, updated_at = NOW()
      FROM ranked r
      WHERE b.id = r.id
    `);

    return NextResponse.json({ success: true, deleted_id: bankId }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/banks/[id]] DELETE error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
