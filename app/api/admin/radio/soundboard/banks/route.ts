// app/api/admin/radio/soundboard/banks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "New Bank").trim().slice(0, 100);

    if (!name) {
      return NextResponse.json({ error: "Bank name cannot be empty" }, { status: 400 });
    }

    // Determine next position
    const posRes = await neonQuery(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM soundboard_banks`
    );
    const position = posRes.rows[0]?.next_pos ?? 0;

    const insertRes = await neonQuery(
      `INSERT INTO soundboard_banks (name, position)
       VALUES ($1, $2)
       RETURNING id, name, position, created_at, updated_at`,
      [name, position]
    );

    const createdBank = {
      ...insertRes.rows[0],
      pads: [],
    };

    return NextResponse.json({ bank: createdBank }, { status: 201 });
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/banks] POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
