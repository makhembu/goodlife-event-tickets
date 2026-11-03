// app/api/admin/radio/soundboard/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDbPool } from "@/lib/neon-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { bank_id, ordered_pad_ids } = body;

    if (!bank_id || typeof bank_id !== "number") {
      return NextResponse.json({ error: "Missing or invalid bank_id" }, { status: 400 });
    }

    if (!Array.isArray(ordered_pad_ids)) {
      return NextResponse.json({ error: "ordered_pad_ids must be an array" }, { status: 400 });
    }

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Update each pad's position inside a single atomic transaction
      for (let pos = 0; pos < ordered_pad_ids.length; pos++) {
        const padId = Number(ordered_pad_ids[pos]);
        await client.query(
          `UPDATE soundboard_pads 
           SET position = $1, updated_at = NOW() 
           WHERE id = $2 AND bank_id = $3`,
          [pos, padId, bank_id]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true, count: ordered_pad_ids.length }, { status: 200 });
    } catch (txErr: any) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard/reorder] POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
